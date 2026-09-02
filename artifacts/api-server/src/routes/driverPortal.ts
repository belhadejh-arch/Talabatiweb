import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, pool, ordersTable, driversTable, orderStatusHistoryTable } from "@workspace/db";
import { requireDriverAuth } from "../middlewares/auth";
import { getOrderDetail } from "./orders";
import { respondToOrderAttempt } from "../lib/driverDispatch";

const router: IRouter = Router();
const DRIVER_STATUS_VALUES = ["OUT_FOR_DELIVERY", "DELIVERED"] as const;

async function getDriverAttempt(orderId: number, driverId: number) {
  const result = await pool.query<{
    id: number;
    status: string;
    sent_at: Date;
    response_at: Date | null;
    timeout_at: Date;
  }>(
    `SELECT id, status, sent_at, response_at, timeout_at
       FROM order_driver_attempts
      WHERE order_id = $1 AND driver_id = $2`,
    [orderId, driverId],
  );
  return result.rows[0] ?? null;
}

async function getDriverOrderDetail(orderId: number, driverId: number) {
  const detail = await getOrderDetail(orderId);
  if (!detail) return null;
  const attempt = await getDriverAttempt(orderId, driverId);
  return {
    ...detail,
    driverResponseStatus: attempt?.status ?? null,
    driverAttemptSentAt: attempt?.sent_at ?? null,
    driverAttemptResponseAt: attempt?.response_at ?? null,
    driverAttemptTimeoutAt: attempt?.timeout_at ?? null,
  };
}

router.get("/driver/orders", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const result = await pool.query<{ id: number }>(
    `SELECT o.id
       FROM orders o
       JOIN order_driver_attempts a
         ON a.order_id = o.id AND a.driver_id = $1
       WHERE o.driver_id = $1
         AND o.restaurant_id = $2
         AND a.status IN ('PENDING', 'ACCEPTED')
         AND o.status IN ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
      ORDER BY o.created_at DESC, o.id DESC`,
    [driver.id, driver.restaurantId],
  );

  const details = await Promise.all(result.rows.map((order) => getDriverOrderDetail(order.id, driver.id)));
  res.json({
    data: details.filter((order): order is NonNullable<typeof order> => order !== null).map((order) => ({
      ...order,
      canRespond: order.status === "NEW" && order.driverResponseStatus === "PENDING",
    })),
  });
});

router.get("/driver/orders/history", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const result = await pool.query<{ id: number; order_id: number; status: string; sent_at: Date; response_at: Date | null; timeout_at: Date }>(
    `SELECT a.id, a.order_id, a.status, a.sent_at, a.response_at, a.timeout_at
       FROM order_driver_attempts a
       JOIN orders o ON o.id = a.order_id
      WHERE a.driver_id = $1 AND o.restaurant_id = $2 AND a.status <> 'PENDING'
      ORDER BY a.sent_at DESC, a.id DESC`,
    [driver.id, driver.restaurantId],
  );

  const details = await Promise.all(result.rows.map(async (attempt) => {
    const order = await getDriverOrderDetail(attempt.order_id, driver.id);
    if (!order) return null;
    return {
      ...order,
      attemptId: attempt.id,
      driverResponseStatus: attempt.status,
      driverAttemptSentAt: attempt.sent_at,
      driverAttemptResponseAt: attempt.response_at,
      driverAttemptTimeoutAt: attempt.timeout_at,
      canRespond: false,
    };
  }));

  res.json({ data: details.filter((order): order is NonNullable<typeof order> => order !== null) });
});

router.get("/driver/stats", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const result = await pool.query<{
    total_orders: number;
    accepted_orders: number;
    rejected_orders: number;
    timeout_orders: number;
  }>(
    `SELECT
       COUNT(*)::int AS total_orders,
       COUNT(*) FILTER (WHERE a.status = 'ACCEPTED')::int AS accepted_orders,
       COUNT(*) FILTER (WHERE a.status = 'REJECTED')::int AS rejected_orders,
       COUNT(*) FILTER (WHERE a.status = 'TIMEOUT')::int AS timeout_orders
       FROM order_driver_attempts a
       JOIN orders o ON o.id = a.order_id
      WHERE a.driver_id = $1 AND o.restaurant_id = $2`,
    [driver.id, driver.restaurantId],
  );
  const stats = result.rows[0] ?? { total_orders: 0, accepted_orders: 0, rejected_orders: 0, timeout_orders: 0 };
  res.json({
    totalOrders: Number(stats.total_orders),
    acceptedOrders: Number(stats.accepted_orders),
    rejectedOrders: Number(stats.rejected_orders),
    timeoutOrders: Number(stats.timeout_orders),
  });
});

router.get("/driver/orders/:id", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const assigned = await pool.query<{ id: number }>(
    `SELECT o.id
       FROM orders o
      WHERE o.id = $1 AND o.restaurant_id = $2
        AND (o.driver_id = $3 OR EXISTS (
          SELECT 1 FROM order_driver_attempts a
           WHERE a.order_id = o.id AND a.driver_id = $3
        ))`,
    [id, driver.restaurantId, driver.id],
  );
  if (!assigned.rows[0]) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(await getDriverOrderDetail(id, driver.id));
});

router.post("/driver/orders/:id/respond", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const id = Number(req.params.id);
  const response = req.body?.response;
  if (!Number.isInteger(id) || (response !== "ACCEPTED" && response !== "REJECTED")) {
    res.status(400).json({ error: "Invalid order response" });
    return;
  }

  const [assigned] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, id),
      eq(ordersTable.driverId, driver.id),
      eq(ordersTable.restaurantId, driver.restaurantId),
      eq(ordersTable.status, "NEW"),
    ));
  if (!assigned) {
    res.status(404).json({ error: "Order is no longer assigned to this driver" });
    return;
  }

  const handled = await respondToOrderAttempt(id, driver.id, response);
  if (!handled) {
    res.status(409).json({ error: "تعذر تحديث الطلب، ربما تم تحديثه من مكان آخر" });
    return;
  }
  res.json(await getOrderDetail(id));
});

router.patch("/driver/orders/:id/status", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isInteger(id) || !DRIVER_STATUS_VALUES.includes(status)) {
    res.status(400).json({ error: "حالة الطلب غير مسموحة للسائق" });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, id),
      eq(ordersTable.driverId, driver.id),
      eq(ordersTable.restaurantId, driver.restaurantId),
    ));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const validTransition =
    (status === "OUT_FOR_DELIVERY" && order.status === "ACCEPTED") ||
    (status === "DELIVERED" && order.status === "OUT_FOR_DELIVERY");
  if (!validTransition) {
    res.status(409).json({ error: "لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية" });
    return;
  }

  await db.update(ordersTable).set({ status }).where(eq(ordersTable.id, id));
  await db.insert(orderStatusHistoryTable).values({
    orderId: id,
    status,
    note: status === "DELIVERED" ? `تم تسليم الطلب بواسطة السائق ${driver.name}` : "الطلب في الطريق",
  });
  if (status === "DELIVERED") {
    await db.update(driversTable)
      .set({ totalDeliveries: driver.totalDeliveries + 1 })
      .where(eq(driversTable.id, driver.id));
  }

  res.json(await getOrderDetail(id));
});

export default router;