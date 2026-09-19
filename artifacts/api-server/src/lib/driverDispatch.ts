import {
  db,
  pool,
  driversTable,
  ordersTable,
  settingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { notifyAssignedDriver } from "./driverPush";

const DEFAULT_TIMEOUT_SECONDS = 300;
const DISPATCH_INTERVAL_MS = 10_000;

type DispatchResult =
  | { assigned: true; orderId: number; driverId: number; assignmentId: number }
  | { assigned: false; reason: "not_pending" | "no_driver" };

async function getTimeoutSeconds(): Promise<number> {
  const [settings] = await db
    .select({ timeout: settingsTable.driverResponseTimeoutSeconds })
    .from(settingsTable)
    .limit(1);
  return settings?.timeout ?? DEFAULT_TIMEOUT_SECONDS;
}

/**
 * Atomically selects the next eligible driver and creates one PENDING
 * attempt. The driver sees the assignment in the internal dashboard.
 */
export async function dispatchNextDriverForOrder(orderId: number): Promise<DispatchResult> {
  const timeoutSeconds = await getTimeoutSeconds();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      id: number;
      restaurant_id: number;
      driver_id: number | null;
      status: string;
      source: string;
    }>(
      "SELECT id, restaurant_id, driver_id, status, source FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (
      !order ||
      order.source !== "PUBLIC_CUSTOMER" ||
      !["NEW", "WAITING_FOR_DRIVER"].includes(order.status) ||
      order.driver_id !== null
    ) {
      await client.query("COMMIT");
      return { assigned: false, reason: "not_pending" };
    }

    const driverResult = await client.query<{ id: number }>(
      `SELECT d.id
       FROM drivers d
       WHERE d.restaurant_id = $1
         AND d.is_active = true
           AND d.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM order_driver_attempts a
            WHERE a.order_id = $2
              AND a.restaurant_id = $1
              AND a.driver_id = d.id
         )
       ORDER BY d.id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [order.restaurant_id, order.id],
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      await client.query(
        "UPDATE orders SET status = 'WAITING_FOR_DRIVER', updated_at = NOW() WHERE id = $1 AND driver_id IS NULL AND status IN ('NEW', 'WAITING_FOR_DRIVER') AND source = 'PUBLIC_CUSTOMER'",
        [order.id],
      );
      await client.query("COMMIT");
      return { assigned: false, reason: "no_driver" };
    }

    const attemptResult = await client.query<{ id: number }>(
      `INSERT INTO order_driver_attempts
        (order_id, driver_id, restaurant_id, status, sent_at, timeout_at)
       VALUES ($1, $2, $3, 'PENDING', NOW(), NOW() + ($4 * INTERVAL '1 second'))
       RETURNING id`,
      [order.id, driver.id, order.restaurant_id, timeoutSeconds],
    );
    const assignmentId = attemptResult.rows[0]?.id;
    if (!assignmentId) throw new Error("Failed to create driver assignment");
    await client.query(
      "UPDATE orders SET driver_id = $2, updated_at = NOW() WHERE id = $1",
      [order.id, driver.id],
    );
    await client.query(
      "UPDATE orders SET status = 'NEW', updated_at = NOW() WHERE id = $1 AND driver_id = $2",
      [order.id, driver.id],
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', $2)`,
      [order.id, `تم إرسال الطلب للسائق رقم ${driver.id} — مهلة الرد ${timeoutSeconds} ثانية`],
    );
    await client.query("COMMIT");

    try {
      await notifyAssignedDriver(driver.id, order.id, assignmentId);
    } catch (error) {
      logger.error({ err: error, driverId: driver.id, orderId: order.id }, "Failed to notify assigned driver");
    }
    return { assigned: true, orderId: order.id, driverId: driver.id, assignmentId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function respondToOrderAttempt(
  orderId: number,
  driverId: number,
  response: "ACCEPTED" | "REJECTED",
): Promise<boolean> {
  const client = await pool.connect();
  let shouldDispatchNext = false;
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      restaurant_id: number;
      driver_id: number | null;
      status: string;
      source: string;
    }>(
      "SELECT restaurant_id, driver_id, status, source FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (
      !order ||
      order.source !== "PUBLIC_CUSTOMER" ||
      order.driver_id !== driverId ||
      order.status !== "NEW"
    ) {
      await client.query("ROLLBACK");
      return false;
    }

    const attemptResult = await client.query<{ id: number }>(
      `SELECT id FROM order_driver_attempts
       WHERE order_id = $1 AND driver_id = $2 AND status = 'PENDING'
       FOR UPDATE`,
      [orderId, driverId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      "UPDATE order_driver_attempts SET status = $2, response_at = NOW() WHERE id = $1 AND status = 'PENDING'",
      [attempt.id, response],
    );

    if (response === "ACCEPTED") {
      await client.query(
        "UPDATE orders SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1 AND driver_id = $2 AND status = 'NEW'",
        [orderId, driverId],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, note)
          VALUES ($1, 'ACCEPTED', $2)`,
          [orderId, `تم قبول الطلب من السائق رقم ${driverId}`],
      );
    } else {
      await client.query(
        "UPDATE orders SET driver_id = NULL, status = 'NEW', updated_at = NOW() WHERE id = $1 AND driver_id = $2 AND status = 'NEW'",
        [orderId, driverId],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, note)
         VALUES ($1, 'NEW', $2)`,
        [orderId, `رفض السائق رقم ${driverId} الطلب وانتقل إلى المحاولة التالية`],
      );
      shouldDispatchNext = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (shouldDispatchNext) await dispatchNextDriverForOrder(orderId);
  return true;
}

/**
 * Marks the current delivery attempt as failed and starts the next eligible
 * driver. Rejected and timed-out drivers remain excluded by their history.
 */
export async function retryOrderDispatch(orderId: number): Promise<DispatchResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{ driver_id: number | null; status: string; source: string }>(
      "SELECT driver_id, status, source FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.source !== "PUBLIC_CUSTOMER" || !["NEW", "WAITING_FOR_DRIVER"].includes(order.status)) {
      await client.query("ROLLBACK");
      return { assigned: false, reason: "not_pending" };
    }

    if (order.driver_id) {
      await client.query(
        `UPDATE order_driver_attempts
          SET status = 'REJECTED', response_at = NOW()
         WHERE order_id = $1 AND driver_id = $2 AND status = 'PENDING'`,
        [orderId, order.driver_id],
      );
      await client.query(
        "UPDATE orders SET driver_id = NULL, updated_at = NOW() WHERE id = $1",
        [orderId],
      );
    }
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', 'إعادة محاولة إرسال الطلب إلى سائق آخر')`,
      [orderId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return dispatchNextDriverForOrder(orderId);
}

export async function assignSpecificDriverForOrder(orderId: number, driverId: number): Promise<number | null> {
  const timeoutSeconds = await getTimeoutSeconds();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      restaurant_id: number;
      driver_id: number | null;
      status: string;
      source: string;
    }>(
      "SELECT restaurant_id, driver_id, status, source FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.source !== "PUBLIC_CUSTOMER" || order.status !== "NEW") {
      await client.query("ROLLBACK");
      return null;
    }

    const driverResult = await client.query<{ id: number }>(
      `SELECT id FROM drivers
       WHERE id = $1 AND restaurant_id = $2
          AND is_active = true AND status = 'ACTIVE'
       FOR UPDATE`,
      [driverId, order.restaurant_id],
    );
    if (!driverResult.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const previousAttempt = await client.query<{ id: number }>(
      "SELECT id FROM order_driver_attempts WHERE order_id = $1 AND driver_id = $2 FOR UPDATE",
      [orderId, driverId],
    );
    if (previousAttempt.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    if (order.driver_id && order.driver_id !== driverId) {
      await client.query(
        `UPDATE order_driver_attempts
         SET status = 'REJECTED', response_at = NOW()
         WHERE order_id = $1 AND driver_id = $2 AND status = 'PENDING'`,
        [orderId, order.driver_id],
      );
    }

    const attemptResult = await client.query<{ id: number }>(
      `INSERT INTO order_driver_attempts
        (order_id, driver_id, restaurant_id, status, sent_at, timeout_at)
       VALUES ($1, $2, $3, 'PENDING', NOW(), NOW() + ($4 * INTERVAL '1 second'))
       RETURNING id`,
      [orderId, driverId, order.restaurant_id, timeoutSeconds],
    );
    const assignmentId = attemptResult.rows[0]?.id;
    if (!assignmentId) throw new Error("Failed to create manual driver assignment");
    await client.query(
      "UPDATE orders SET driver_id = $2, status = 'NEW', updated_at = NOW() WHERE id = $1 AND source = 'PUBLIC_CUSTOMER'",
      [orderId, driverId],
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', $2)`,
      [orderId, `تم إسناد الطلب يدويًا للسائق رقم ${driverId} — مهلة الرد ${timeoutSeconds} ثانية`],
    );
    await client.query("COMMIT");

    return assignmentId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function expireTimedOutAttempts(): Promise<void> {
  const client = await pool.connect();
  const expired: Array<{ orderId: number; driverId: number }> = [];
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: number; order_id: number; driver_id: number }>(
       `SELECT a.id, a.order_id, a.driver_id
       FROM order_driver_attempts a
       JOIN orders o ON o.id = a.order_id
       WHERE a.status = 'PENDING'
         AND a.timeout_at <= NOW()
         AND o.source = 'PUBLIC_CUSTOMER'
         AND o.driver_id = a.driver_id
         AND o.restaurant_id = a.restaurant_id
        ORDER BY a.timeout_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 100`,
    );

    for (const attempt of result.rows) {
      await client.query(
        "UPDATE order_driver_attempts SET status = 'TIMEOUT', response_at = NOW() WHERE id = $1 AND status = 'PENDING'",
        [attempt.id],
      );
      const orderUpdate = await client.query(
        "UPDATE orders SET driver_id = NULL, updated_at = NOW() WHERE id = $1 AND driver_id = $2 AND status = 'NEW' AND source = 'PUBLIC_CUSTOMER'",
        [attempt.order_id, attempt.driver_id],
      );
      if (orderUpdate.rowCount) {
        await client.query(
          `INSERT INTO order_status_history (order_id, status, note)
           VALUES ($1, 'NEW', $2)`,
          [attempt.order_id, `انتهت مهلة رد السائق رقم ${attempt.driver_id} وانتقل الطلب للمحاولة التالية`],
        );
        expired.push({ orderId: attempt.order_id, driverId: attempt.driver_id });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  await Promise.allSettled(
    expired.map((attempt) =>
      dispatchNextDriverForOrder(attempt.orderId).catch((error) => {
        logger.error(
          { err: error, orderId: attempt.orderId, driverId: attempt.driverId },
          "Failed to dispatch after driver timeout",
        );
      }),
    ),
  );
}

/**
 * Deliver only assignments that have never been claimed. SENDING is
 * intentionally never reset: after a process restart we cannot know whether
 * OneSignal accepted a request before the process stopped, so retrying it
 * would be able to duplicate a driver alert.
 */
async function dispatchPendingDriverNotifications(): Promise<void> {
  const client = await pool.connect();
  let pending: Array<{ order_id: number; driver_id: number; assignment_id: number }> = [];
  try {
    const result = await client.query<{ order_id: number; driver_id: number; assignment_id: number }>(
      `SELECT a.order_id, a.driver_id
              , a.id AS assignment_id
         FROM order_driver_attempts a
         JOIN orders o ON o.id = a.order_id
         JOIN drivers d ON d.id = a.driver_id
        WHERE a.status = 'PENDING'
          AND a.notification_status = 'PENDING'
          AND a.timeout_at > NOW()
          AND o.id = a.order_id
          AND o.driver_id = a.driver_id
          AND o.status = 'NEW'
          AND o.source = 'PUBLIC_CUSTOMER'
          AND d.is_active = true
          AND d.status = 'ACTIVE'
        ORDER BY a.sent_at ASC
        LIMIT 100`,
    );
    pending = result.rows;
  } finally {
    client.release();
  }

  await Promise.allSettled(
    pending.map(({ order_id: orderId, driver_id: driverId, assignment_id: assignmentId }) =>
      notifyAssignedDriver(driverId, orderId, assignmentId).catch((error) => {
        logger.error({ err: error, orderId, driverId, assignmentId }, "Failed to dispatch pending driver notification");
      }),
    ),
  );
}

let workerStarted = false;
export function startDriverDispatchWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  const run = async () => {
    try {
      await dispatchPendingDriverNotifications();
      await expireTimedOutAttempts();
    } catch (error) {
      logger.error({ err: error }, "Driver dispatch worker failed");
    }
  };

  void run();
  const timer = setInterval(() => void run(), DISPATCH_INTERVAL_MS);
  timer.unref();
}