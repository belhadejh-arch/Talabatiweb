import {
  db,
  pool,
  driversTable,
  ordersTable,
  settingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_TIMEOUT_SECONDS = 180;
const DISPATCH_INTERVAL_MS = 10_000;

type DispatchResult =
  | { assigned: true; orderId: number; driverId: number }
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
    }>(
      "SELECT id, restaurant_id, driver_id, status FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.status !== "NEW" || order.driver_id !== null) {
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
           WHERE a.order_id = $2 AND a.driver_id = d.id
         )
       ORDER BY d.id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [order.restaurant_id, order.id],
    );
    const driver = driverResult.rows[0];
    if (!driver) {
      await client.query("COMMIT");
      return { assigned: false, reason: "no_driver" };
    }

    await client.query(
      `INSERT INTO order_driver_attempts
        (order_id, driver_id, status, sent_at, timeout_at)
       VALUES ($1, $2, 'PENDING', NOW(), NOW() + ($3 * INTERVAL '1 second'))`,
      [order.id, driver.id, timeoutSeconds],
    );
    await client.query(
      "UPDATE orders SET driver_id = $2, updated_at = NOW() WHERE id = $1",
      [order.id, driver.id],
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', $2)`,
      [order.id, `تم إرسال الطلب للسائق رقم ${driver.id} — مهلة الرد ${timeoutSeconds} ثانية`],
    );
    await client.query("COMMIT");

    return { assigned: true, orderId: order.id, driverId: driver.id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function dispatchPendingOrdersForRestaurant(restaurantId: number): Promise<void> {
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM orders WHERE restaurant_id = $1 AND status = 'NEW' AND driver_id IS NULL ORDER BY created_at ASC, id ASC",
    [restaurantId],
  );
  for (const order of result.rows) {
    await dispatchNextDriverForOrder(order.id);
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
    const orderResult = await client.query<{ restaurant_id: number; driver_id: number | null; status: string }>(
      "SELECT restaurant_id, driver_id, status FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.driver_id !== driverId || order.status !== "NEW") {
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
      "UPDATE order_driver_attempts SET status = $3, response_at = NOW() WHERE id = $1 AND status = 'PENDING'",
      [attempt.id, orderId, response],
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
    const orderResult = await client.query<{ driver_id: number | null; status: string }>(
      "SELECT driver_id, status FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.status !== "NEW") {
      await client.query("ROLLBACK");
      return { assigned: false, reason: "not_pending" };
    }

    if (order.driver_id) {
      await client.query(
        `UPDATE order_driver_attempts
         SET status = 'FAILED'
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

export async function assignSpecificDriverForOrder(orderId: number, driverId: number): Promise<boolean> {
  const timeoutSeconds = await getTimeoutSeconds();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{ restaurant_id: number; driver_id: number | null; status: string }>(
      "SELECT restaurant_id, driver_id, status FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order || order.status !== "NEW") {
      await client.query("ROLLBACK");
      return false;
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
      return false;
    }

    if (order.driver_id && order.driver_id !== driverId) {
      await client.query(
        `UPDATE order_driver_attempts
         SET status = 'REJECTED', response_at = NOW()
         WHERE order_id = $1 AND driver_id = $2 AND status = 'PENDING'`,
        [orderId, order.driver_id],
      );
    }

    await client.query(
      `INSERT INTO order_driver_attempts
        (order_id, driver_id, status, sent_at, timeout_at)
       VALUES ($1, $2, 'PENDING', NOW(), NOW() + ($3 * INTERVAL '1 second'))
       ON CONFLICT (order_id, driver_id) DO UPDATE
        SET status = 'PENDING', sent_at = NOW(), response_at = NULL,
           timeout_at = NOW() + ($3 * INTERVAL '1 second')`,
      [orderId, driverId, timeoutSeconds],
    );
    await client.query(
      "UPDATE orders SET driver_id = $2, updated_at = NOW() WHERE id = $1",
      [orderId, driverId],
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', $2)`,
      [orderId, `تم إسناد الطلب يدويًا للسائق رقم ${driverId} — مهلة الرد ${timeoutSeconds} ثانية`],
    );
    await client.query("COMMIT");

    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function dispatchPendingOrders(): Promise<void> {
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM orders WHERE status = 'NEW' AND driver_id IS NULL ORDER BY created_at ASC, id ASC LIMIT 100",
  );
  for (const order of result.rows) {
    await dispatchNextDriverForOrder(order.id);
  }
}

async function expireTimedOutAttempts(): Promise<void> {
  const client = await pool.connect();
  const expired: Array<{ orderId: number; driverId: number }> = [];
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: number; order_id: number; driver_id: number }>(
      `SELECT id, order_id, driver_id
       FROM order_driver_attempts
       WHERE status = 'PENDING' AND timeout_at <= NOW()
       ORDER BY timeout_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 100`,
    );

    for (const attempt of result.rows) {
      await client.query(
        "UPDATE order_driver_attempts SET status = 'TIMEOUT' WHERE id = $1 AND status = 'PENDING'",
        [attempt.id],
      );
      const orderUpdate = await client.query(
        "UPDATE orders SET driver_id = NULL, updated_at = NOW() WHERE id = $1 AND driver_id = $2 AND status = 'NEW'",
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

  for (const attempt of expired) {
    await dispatchNextDriverForOrder(attempt.orderId);
  }
}

let workerStarted = false;
export function startDriverDispatchWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  const run = async () => {
    try {
      await expireTimedOutAttempts();
      await dispatchPendingOrders();
    } catch (error) {
      logger.error({ err: error }, "Driver dispatch worker failed");
    }
  };

  void run();
  const timer = setInterval(() => void run(), DISPATCH_INTERVAL_MS);
  timer.unref();
}