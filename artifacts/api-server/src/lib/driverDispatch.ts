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
           WHERE a.order_id = $2 AND a.driver_id = d.id
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

    await client.query(
      `INSERT INTO order_driver_attempts
        (order_id, driver_id, restaurant_id, status, sent_at, timeout_at)
       VALUES ($1, $2, $3, 'PENDING', NOW(), NOW() + ($4 * INTERVAL '1 second'))`,
      [order.id, driver.id, order.restaurant_id, timeoutSeconds],
    );
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
      await notifyAssignedDriver(driver.id, order.id);
    } catch (error) {
      logger.error({ err: error, driverId: driver.id, orderId: order.id }, "Failed to notify assigned driver");
    }
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
    "SELECT id FROM orders WHERE restaurant_id = $1 AND source = 'PUBLIC_CUSTOMER' AND status IN ('NEW', 'WAITING_FOR_DRIVER') AND driver_id IS NULL ORDER BY created_at ASC, id ASC",
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

export async function assignSpecificDriverForOrder(orderId: number, driverId: number): Promise<boolean> {
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

    const previousAttempt = await client.query<{ id: number }>(
      "SELECT id FROM order_driver_attempts WHERE order_id = $1 AND driver_id = $2 FOR UPDATE",
      [orderId, driverId],
    );
    if (previousAttempt.rows[0]) {
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
        (order_id, driver_id, restaurant_id, status, sent_at, timeout_at)
       VALUES ($1, $2, $3, 'PENDING', NOW(), NOW() + ($4 * INTERVAL '1 second'))`,
      [orderId, driverId, order.restaurant_id, timeoutSeconds],
    );
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

    return true;
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
    } catch (error) {
      logger.error({ err: error }, "Driver dispatch worker failed");
    }
  };

  const timer = setInterval(() => void run(), DISPATCH_INTERVAL_MS);
  timer.unref();
}