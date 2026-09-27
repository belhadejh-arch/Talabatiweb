import { pool, withTransaction } from "./db.mjs";
import { actionToken, validActionToken, sendAssignmentEmail } from "./email.mjs";

let running = false;
let timer;
const ACTIVE_DRIVER = "d.is_active = true AND d.status = 'ACTIVE'";

function safeError(error) {
  let text = String(error?.message ?? error);
  for (const key of ["SMTP_PASS", "DATABASE_URL", "SESSION_SECRET"]) {
    const secret = process.env[key];
    if (secret) text = text.replaceAll(secret, "[REDACTED]");
  }
  return text.slice(0, 500);
}

async function updateJob(client, orderId, state, nextCheckAt = null) {
  await client.query(
    `UPDATE order_email_dispatch_jobs
     SET state=$2, next_check_at=COALESCE($3::timestamptz, next_check_at), updated_at=now()
     WHERE order_id=$1 AND ($2 <> 'ACTIVE' OR state='ACTIVE')`,
    [orderId, state, nextCheckAt],
  );
}

async function lockDeliveryChain(client, delivery) {
  // Every transaction that changes a delivery follows job -> order -> attempt
  // -> delivery to avoid a deadlock with acceptance and timeout processing.
  await client.query(
    "SELECT order_id FROM order_email_dispatch_jobs WHERE order_id=$1 FOR UPDATE",
    [delivery.order_id],
  );
  await client.query("SELECT id FROM orders WHERE id=$1 FOR UPDATE", [delivery.order_id]);
  await client.query(
    "SELECT id FROM order_driver_attempts WHERE assignment_id=$1 FOR UPDATE",
    [delivery.assignment_id],
  );
}

async function recordStatus(client, orderId, status, note) {
  await client.query(
    "INSERT INTO order_status_history (order_id,status,note) VALUES ($1,$2,$3)",
    [orderId, status, note],
  );
}

async function dispatchTimeoutMinutes(client) {
  let result;
  try {
    result = await client.query(
      "SELECT dispatch_timeout_minutes FROM admin_settings WHERE id=1"
    );
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      throw new Error("Missing admin settings migration: apply server/migrations/002_admin_settings.sql");
    }
    throw error;
  }
  const minutes = Number(result.rows[0]?.dispatch_timeout_minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    throw new Error("Admin dispatch timeout setting is missing or invalid.");
  }
  return minutes;
}

async function markAttempt(client, attempt, status) {
  const timestampColumn = {
    TIMEOUT: "timed_out_at",
    REJECTED: "rejected_at",
    CANCELLED: "cancelled_at",
  }[status];
  if (!timestampColumn) throw new Error("Unsupported assignment state");
  await client.query(
    `UPDATE order_driver_attempts
     SET status=$2, responded_at=now(), response_at=now(), ${timestampColumn}=now()
     WHERE id=$1 AND status='PENDING'`,
    [attempt.id, status],
  );
  await client.query(
    `UPDATE orders SET status=$2, updated_at=now()
     WHERE id=$1 AND status='ASSIGNED'`,
    [attempt.order_id, status === "CANCELLED" ? "NEW" : status],
  );
  await recordStatus(client, attempt.order_id, status, `محاولة السائق #${attempt.driver_id}`);
}

async function processJob(orderId) {
  return withTransaction(async (client) => {
    const job = (await client.query(
      `SELECT * FROM order_email_dispatch_jobs
       WHERE order_id=$1 AND state='ACTIVE' AND next_check_at<=now()
       FOR UPDATE SKIP LOCKED`,
      [orderId],
    )).rows[0];
    if (!job) return;
    const timeoutMinutes = await dispatchTimeoutMinutes(client);
    const order = (await client.query(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [orderId],
    )).rows[0];
    if (!order || ["ACCEPTED", "COMPLETED", "DELIVERED", "CANCELLED"].includes(order.status)) {
      await updateJob(client, orderId, "DONE");
      return;
    }
    const membership = (await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM restaurants r JOIN subscriptions s ON s.restaurant_id=r.id
         WHERE r.id=$1 AND r.status='ACTIVE' AND s.status='ACTIVE'
           AND s.start_date<=CURRENT_DATE AND s.expiry_date>=CURRENT_DATE
       ) AS active`,
      [order.restaurant_id],
    )).rows[0].active;
    if (!membership) {
      const pending = (await client.query(
        `SELECT id,driver_id FROM order_driver_attempts
         WHERE order_id=$1 AND status='PENDING' FOR UPDATE`,
        [orderId],
      )).rows[0];
      if (pending) {
        await client.query(
          `UPDATE order_driver_attempts SET status='CANCELLED',
                  responded_at=now(),response_at=now(),cancelled_at=now()
           WHERE id=$1 AND status='PENDING'`,
          [pending.id],
        );
      }
      const cancelled = await client.query(
        `UPDATE orders SET status='CANCELLED',
                cancelled_at=COALESCE(cancelled_at,now()),updated_at=now()
         WHERE id=$1 AND status NOT IN ('ACCEPTED','COMPLETED','DELIVERED','CANCELLED')
         RETURNING id`,
        [orderId],
      );
      if (cancelled.rowCount) {
        await recordStatus(client, orderId, "CANCELLED",
          "انتهت عضوية المطعم قبل اكتمال توزيع الطلب");
      }
      await updateJob(client, orderId, "DONE");
      return;
    }

    while (true) {
      const attempt = (await client.query(
        `SELECT a.*, e.id AS delivery_id, e.status AS email_status,
                e.next_retry_at, e.last_attempt_at, e.smtp_started_at
         FROM order_driver_attempts a
         LEFT JOIN order_email_deliveries e ON e.assignment_id=a.assignment_id
         WHERE a.order_id=$1 AND a.status='PENDING'
         ORDER BY a.id DESC LIMIT 1 FOR UPDATE OF a`,
        [orderId],
      )).rows[0];
      if (attempt) {
        const driver = (await client.query(
          `SELECT id FROM drivers d
           WHERE id=$1 AND restaurant_id=$2 AND ${ACTIVE_DRIVER}
             AND email IS NOT NULL AND email<>''
           FOR UPDATE`,
          [attempt.driver_id, order.restaurant_id],
        )).rows[0];
        if (!driver) {
          await markAttempt(client, attempt, "CANCELLED");
          continue;
        }
        if (attempt.email_status === "SENT") {
          if (new Date(attempt.timeout_at).getTime() <= Date.now()) {
            await markAttempt(client, attempt, "TIMEOUT");
            continue;
          }
          await updateJob(client, orderId, "ACTIVE", attempt.timeout_at);
          return;
        }
        if (attempt.email_status === "SENDING") {
          if (!attempt.smtp_started_at) {
            // The worker claimed this row but had not begun the SMTP operation.
            // It is safe to recover this abandoned claim after its lease.
            const recoveryAt = new Date(new Date(attempt.last_attempt_at).getTime() + 120_000);
            if (recoveryAt.getTime() <= Date.now()) {
              await client.query(
                `UPDATE order_email_deliveries SET status='FAILED',
                   next_retry_at=now(),error='Recovered claim before SMTP started',updated_at=now()
                 WHERE id=$1 AND status='SENDING' AND smtp_started_at IS NULL`,
                [attempt.delivery_id],
              );
              await updateJob(client, orderId, "ACTIVE", new Date());
            } else {
              await updateJob(client, orderId, "ACTIVE", recoveryAt);
            }
            return;
          }
          // Delivery after an interrupted SMTP operation is ambiguous.
          // A human must check the Gmail Sent folder before retrying.
          await updateJob(client, orderId, "ACTIVE", new Date(Date.now() + 3_600_000));
          return;
        }
        if (attempt.email_status === "FAILED" && attempt.next_retry_at) {
          await updateJob(client, orderId, "ACTIVE", attempt.next_retry_at);
        }
        return; // A PENDING/FAILED delivery is claimed by the mail worker.
      }

      const driver = (await client.query(
        `SELECT d.id, d.email FROM drivers d
         WHERE d.restaurant_id=$1 AND ${ACTIVE_DRIVER}
           AND d.email IS NOT NULL AND d.email<>''
           AND NOT EXISTS (
             SELECT 1 FROM order_driver_attempts a
             WHERE a.order_id=$2 AND a.driver_id=d.id
           )
          ORDER BY d.id FOR UPDATE OF d LIMIT 1`,
        [order.restaurant_id, orderId],
      )).rows[0];
      if (!driver) {
        await updateJob(client, orderId, "DONE");
        return;
      }
      const created = (await client.query(
        `INSERT INTO order_driver_attempts
           (order_id,driver_id,restaurant_id,driver_email,status,sent_at,timeout_at,expires_at)
         VALUES ($1,$2,$3,$4,'PENDING',now(),now()+($5 * interval '1 minute'),now()+($5 * interval '1 minute'))
         RETURNING assignment_id`,
        [orderId, driver.id, order.restaurant_id, driver.email, timeoutMinutes],
      )).rows[0];
      await client.query(
        `INSERT INTO order_email_deliveries (order_id,driver_id,assignment_id,driver_email)
         VALUES ($1,$2,$3,$4)`,
        [orderId, driver.id, created.assignment_id, driver.email],
      );
      await client.query(
        `UPDATE orders SET status='ASSIGNED',driver_id=NULL,updated_at=now() WHERE id=$1`,
        [orderId],
      );
      await recordStatus(client, orderId, "ASSIGNED", `محاولة السائق #${driver.id}`);
      await updateJob(client, orderId, "ACTIVE", new Date());
      return;
    }
  });
}

async function claimEmail(orderId = null) {
  return withTransaction(async (client) => {
    const delivery = (await client.query(
      `SELECT e.id
       FROM order_email_deliveries e
       JOIN order_driver_attempts a ON a.assignment_id=e.assignment_id
       JOIN order_email_dispatch_jobs j ON j.order_id=e.order_id AND j.state='ACTIVE'
       JOIN orders o ON o.id=e.order_id AND o.status='ASSIGNED'
       JOIN drivers d ON d.id=e.driver_id AND d.restaurant_id=o.restaurant_id
       JOIN restaurants r ON r.id=o.restaurant_id AND r.status='ACTIVE'
       JOIN subscriptions s ON s.restaurant_id=r.id AND s.status='ACTIVE'
         AND s.start_date<=CURRENT_DATE AND s.expiry_date>=CURRENT_DATE
       WHERE e.status IN ('PENDING','FAILED')
         AND ($1::integer IS NULL OR e.order_id=$1)
         AND (e.next_retry_at IS NULL OR e.next_retry_at<=now())
         AND a.status='PENDING' AND ${ACTIVE_DRIVER}
       ORDER BY e.created_at,e.id LIMIT 1
       FOR UPDATE OF e SKIP LOCKED`,
      [orderId],
    )).rows[0];
    if (!delivery) return null;
    return (await client.query(
      `UPDATE order_email_deliveries
        SET status='SENDING',last_attempt_at=now(),smtp_started_at=NULL,updated_at=now()
       WHERE id=$1 AND status IN ('PENDING','FAILED') RETURNING *`,
      [delivery.id],
    )).rows[0];
  });
}

async function mailPayload(delivery) {
  const result = await pool.query(
    `SELECT o.*, r.name AS restaurant_name, a.created_at AS assignment_created_at,
            a.assignment_id, a.driver_id, a.driver_email
     FROM orders o
     JOIN restaurants r ON r.id=o.restaurant_id
     JOIN order_driver_attempts a ON a.assignment_id=$1 AND a.order_id=o.id
     WHERE o.id=$2`,
    [delivery.assignment_id, delivery.order_id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Order or assignment missing during email delivery");
  const items = (await pool.query(
    `SELECT i.* FROM order_items i WHERE i.order_id=$1 ORDER BY i.id`,
    [delivery.order_id],
  )).rows;
  if (items.length) {
    const addons = (await pool.query(
      `SELECT ia.order_item_id, ia.addon_name, ia.price
       FROM order_item_addons ia JOIN order_items i ON i.id=ia.order_item_id
       WHERE i.order_id=$1 ORDER BY ia.id`,
      [delivery.order_id],
    )).rows;
    for (const item of items) item.addons = addons.filter((addon) => addon.order_item_id === item.id);
  }
  return {
    order: row,
    restaurant: { name: row.restaurant_name },
    assignment: {
      order_id: row.id,
      assignment_id: row.assignment_id,
      driver_id: row.driver_id,
      driver_email: delivery.driver_email,
      created_at: row.assignment_created_at,
    },
    items,
    baseUrl: process.env.PUBLIC_API_URL,
  };
}

async function sendNextEmail(sendMail, orderId = null) {
  const delivery = await claimEmail(orderId);
  if (!delivery) return false;
  let sendInvoked = false;
  try {
    const payload = await mailPayload(delivery);
    const started = await pool.query(
      `UPDATE order_email_deliveries SET smtp_started_at=now(),updated_at=now()
       WHERE id=$1 AND status='SENDING' RETURNING id`,
      [delivery.id],
    );
    if (!started.rowCount) throw new Error("Email delivery claim expired before SMTP");
    sendInvoked = true;
    await sendMail(payload);
  } catch (error) {
    const details = safeError(error);
    console.error(`SMTP assignment ${delivery.assignment_id} failed: ${details}`);
    const command = String(error?.command || "").toUpperCase();
    const definitelyBeforeData =
      !sendInvoked || error?.smtpNotStarted === true ||
      (error?.code === "EAUTH" && command.startsWith("AUTH")) ||
      (["ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(error?.code) && command === "CONN") ||
      (["EENVELOPE", "ESMTP"].includes(error?.code) &&
        (command.startsWith("MAIL FROM") || command.startsWith("RCPT TO")));
    const ambiguous = !definitelyBeforeData;
    if (ambiguous) {
      // Any send result not provably rejected before DATA may have been accepted.
      // Never automatically resend such a message.
      await pool.query(
        "UPDATE order_email_deliveries SET error=$2,updated_at=now() WHERE id=$1 AND status='SENDING'",
        [delivery.id, `Unconfirmed SMTP result: ${details}`],
      );
      return true;
    }
    const retrySeconds = Math.min(300, 10 * 2 ** Math.min(delivery.retry_count, 5));
    const retryAt = new Date(Date.now() + retrySeconds * 1000);
    await withTransaction(async (client) => {
      await lockDeliveryChain(client, delivery);
      await client.query(
        `UPDATE order_email_deliveries
         SET status='FAILED',retry_count=retry_count+1,error=$2,
             next_retry_at=$3,updated_at=now()
         WHERE id=$1 AND status='SENDING'`,
        [delivery.id, details, retryAt],
      );
      await updateJob(client, delivery.order_id, "ACTIVE", retryAt);
    });
    return true;
  }
  // SMTP has already accepted the message. If PostgreSQL now fails, leave the
  // delivery in SENDING for reconciliation; automatically retrying could duplicate it.
  try {
    await withTransaction(async (client) => {
      await lockDeliveryChain(client, delivery);
      const timeoutMinutes = await dispatchTimeoutMinutes(client);
      const sent = (await client.query(
        `UPDATE order_email_deliveries
         SET status='SENT',sent_at=now(),error=NULL,next_retry_at=NULL,updated_at=now()
         WHERE id=$1 AND status='SENDING' RETURNING sent_at`,
        [delivery.id],
      )).rows[0];
      if (!sent) return;
      const activeAttempt = await client.query(
        `UPDATE order_driver_attempts
          SET timeout_at=$2::timestamptz+($3 * interval '1 minute'),
              expires_at=$2::timestamptz+($3 * interval '1 minute')
         WHERE assignment_id=$1 AND status='PENDING'`,
        [delivery.assignment_id, sent.sent_at, timeoutMinutes],
      );
      if (activeAttempt.rowCount) {
        await updateJob(client, delivery.order_id, "ACTIVE",
          new Date(new Date(sent.sent_at).getTime() + timeoutMinutes * 60_000));
      }
    });
  } catch (error) {
    console.error(`SMTP accepted assignment ${delivery.assignment_id}, database confirmation failed: ${safeError(error)}`);
  }
  return true;
}

export async function processDispatchOnce(sendMail = sendAssignmentEmail) {
  const jobs = (await pool.query(
    `SELECT order_id FROM order_email_dispatch_jobs
     WHERE state='ACTIVE' AND next_check_at<=now()
     ORDER BY next_check_at,order_id LIMIT 100`,
  )).rows;
  for (const job of jobs) await processJob(job.order_id);
  for (let i = 0; i < 20; i++) {
    if (!await sendNextEmail(sendMail)) break;
  }
}

// Scoped entry point for integration tests; never touches other live orders.
export async function processDispatchForOrder(orderId, sendMail = sendAssignmentEmail) {
  await processJob(orderId);
  for (let i = 0; i < 5; i++) {
    if (!await sendNextEmail(sendMail, orderId)) break;
  }
}

export async function reconcileEmailDelivery({ id, result }, schedule = kickDispatch) {
  const deliveryId = Number(id);
  if (!Number.isSafeInteger(deliveryId) || deliveryId < 1 ||
      !["NOT_SENT", "SENT"].includes(result)) {
    return { ok: false, reason: "Invalid reconciliation request" };
  }
  const reference = (await pool.query(
    "SELECT order_id,assignment_id FROM order_email_deliveries WHERE id=$1",
    [deliveryId],
  )).rows[0];
  if (!reference) return { ok: false, reason: "Delivery not found" };
  const outcome = await withTransaction(async (client) => {
    await lockDeliveryChain(client, reference);
    const row = (await client.query(
      `SELECT e.*, a.status AS attempt_status, j.state AS job_state,
              o.status AS order_status
       FROM order_email_deliveries e
       JOIN order_driver_attempts a ON a.assignment_id=e.assignment_id
       JOIN order_email_dispatch_jobs j ON j.order_id=e.order_id
       JOIN orders o ON o.id=e.order_id
       WHERE e.id=$1 FOR UPDATE OF e`,
      [deliveryId],
    )).rows[0];
    if (!row || row.status !== "SENDING" || row.attempt_status !== "PENDING" ||
        row.job_state !== "ACTIVE" || row.order_status !== "ASSIGNED") {
      return { ok: false, reason: "Assignment is no longer awaiting email reconciliation" };
    }
    const timeoutMinutes = result === "SENT" ? await dispatchTimeoutMinutes(client) : null;
    // Allow any in-flight SMTP socket to finish before a human decides whether
    // it did or did not send. This is not a substitute for checking Gmail Sent.
    if (new Date(row.last_attempt_at).getTime() > Date.now() - 120_000) {
      return { ok: false, reason: "Wait two minutes, then verify the Gmail Sent folder" };
    }
    if (result === "NOT_SENT") {
      await client.query(
        `UPDATE order_email_deliveries SET status='FAILED',
                next_retry_at=now(),error='Operator verified message was not sent',
                updated_at=now()
         WHERE id=$1`,
        [deliveryId],
      );
      await updateJob(client, row.order_id, "ACTIVE", new Date());
      return { ok: true, result, advance: true };
    }
    const sentAt = (await client.query(
      `UPDATE order_email_deliveries SET status='SENT',
              sent_at=now(),next_retry_at=NULL,error=NULL,updated_at=now()
       WHERE id=$1 RETURNING sent_at`,
      [deliveryId],
    )).rows[0].sent_at;
    await client.query(
      `UPDATE order_driver_attempts
       SET timeout_at=$2::timestamptz+($3 * interval '1 minute'),
           expires_at=$2::timestamptz+($3 * interval '1 minute')
       WHERE assignment_id=$1 AND status='PENDING'`,
      [row.assignment_id, sentAt, timeoutMinutes],
    );
    await updateJob(client, row.order_id, "ACTIVE",
      new Date(new Date(sentAt).getTime() + timeoutMinutes * 60_000));
    return { ok: true, result, advance: false };
  });
  if (outcome.advance) schedule();
  return outcome;
}

async function runTick() {
  if (running) return;
  running = true;
  try {
    await processDispatchOnce();
  } catch (error) {
    console.error("Email dispatch worker error:", safeError(error));
  } finally {
    running = false;
  }
}

export function kickDispatch() {
  queueMicrotask(() => void runTick());
}

export function startDispatchWorker() {
  if (timer) return;
  timer = setInterval(kickDispatch, 1_000);
  timer.unref();
  kickDispatch();
}

function idsAreValid(input) {
  return ["orderId", "assignmentId", "driverId"].every((key) =>
    Number.isSafeInteger(Number(input[key])) && Number(input[key]) > 0);
}

function decisionIsValid(decision) {
  return decision === "ACCEPTED" || decision === "REJECTED";
}

export async function previewEmailAction(input) {
  if (!idsAreValid(input) || !decisionIsValid(input.decision)) return { ok: false };
  const result = await pool.query(
    `SELECT a.*, o.status AS order_status, o.driver_id AS accepted_driver_id,
            o.restaurant_id AS order_restaurant_id, e.status AS email_status,
            j.state AS job_state,d.restaurant_id AS current_restaurant_id,
            d.is_active,d.status AS driver_status
     FROM order_driver_attempts a
     JOIN orders o ON o.id=a.order_id
     JOIN order_email_deliveries e ON e.assignment_id=a.assignment_id
     JOIN order_email_dispatch_jobs j ON j.order_id=o.id
     JOIN drivers d ON d.id=a.driver_id
     WHERE a.order_id=$1 AND a.assignment_id=$2 AND a.driver_id=$3`,
    [input.orderId, input.assignmentId, input.driverId],
  );
  const row = result.rows[0];
  const ok = !!row && validActionToken(row, input.token) &&
    row.status === "PENDING" && row.email_status === "SENT" &&
    row.job_state === "ACTIVE" && row.order_status === "ASSIGNED" &&
    row.accepted_driver_id == null &&
    row.current_restaurant_id === row.order_restaurant_id &&
    row.is_active && row.driver_status === "ACTIVE" &&
    new Date(row.timeout_at).getTime() > Date.now();
  return ok ? { ok: true, orderId: row.order_id, decision: input.decision } : { ok: false };
}

export async function respondToEmailAction(input, schedule = kickDispatch) {
  if (!idsAreValid(input) || !decisionIsValid(input.decision)) return { ok: false, reason: "رابط غير صالح" };
  const outcome = await withTransaction(async (client) => {
    // Lock order-wide job first in both the worker and the email response path.
    const job = (await client.query(
      "SELECT * FROM order_email_dispatch_jobs WHERE order_id=$1 FOR UPDATE",
      [input.orderId],
    )).rows[0];
    if (!job || job.state !== "ACTIVE") return { ok: false, reason: "انتهت صلاحية الرابط" };
    const order = (await client.query(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [input.orderId],
    )).rows[0];
    const attempt = (await client.query(
      `SELECT a.*, e.status AS email_status FROM order_driver_attempts a
       JOIN order_email_deliveries e ON e.assignment_id=a.assignment_id
       WHERE a.order_id=$1 AND a.assignment_id=$2 AND a.driver_id=$3 FOR UPDATE OF a`,
      [input.orderId, input.assignmentId, input.driverId],
    )).rows[0];
    if (!order || !attempt || !validActionToken(attempt, input.token) ||
        attempt.status !== "PENDING" || attempt.email_status !== "SENT" ||
        order.status !== "ASSIGNED" || order.driver_id != null) {
      return { ok: false, reason: "انتهت صلاحية الرابط أو تمت معالجة الطلب" };
    }
    const driver = (await client.query(
      `SELECT id FROM drivers d WHERE id=$1 AND restaurant_id=$2
       AND ${ACTIVE_DRIVER} FOR UPDATE`,
      [input.driverId, order.restaurant_id],
    )).rows[0];
    if (!driver) {
      await markAttempt(client, attempt, "CANCELLED");
      await updateJob(client, order.id, "ACTIVE", new Date());
      return { ok: false, reason: "السائق لم يعد مؤهلاً لهذا المطعم", advance: true };
    }
    if (new Date(attempt.timeout_at).getTime() <= Date.now()) {
      await markAttempt(client, attempt, "TIMEOUT");
      await updateJob(client, order.id, "ACTIVE", new Date());
      return { ok: false, reason: "انتهت مهلة الرد", advance: true };
    }
    if (input.decision === "ACCEPTED") {
      await client.query(
        `UPDATE order_driver_attempts
         SET status='ACCEPTED',responded_at=now(),response_at=now(),accepted_at=now()
         WHERE id=$1 AND status='PENDING'`,
        [attempt.id],
      );
      await client.query(
        `UPDATE orders SET status='ACCEPTED',driver_id=$2,updated_at=now()
         WHERE id=$1 AND status='ASSIGNED' AND driver_id IS NULL`,
        [order.id, driver.id],
      );
      await recordStatus(client, order.id, "ACCEPTED", `قبول السائق #${driver.id} من البريد`);
      await updateJob(client, order.id, "DONE");
    } else {
      await markAttempt(client, attempt, "REJECTED");
      await updateJob(client, order.id, "ACTIVE", new Date());
    }
    return { ok: true, decision: input.decision, advance: input.decision === "REJECTED" };
  });
  if (outcome.advance) schedule();
  return outcome;
}