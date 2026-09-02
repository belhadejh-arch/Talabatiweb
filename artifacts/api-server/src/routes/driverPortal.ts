import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, ordersTable, driversTable, orderStatusHistoryTable } from "@workspace/db";
import { requireDriverAuth } from "../middlewares/auth";
import { getOrderDetail } from "./orders";
import { respondToOrderAttempt } from "../lib/driverDispatch";

const router: IRouter = Router();
const DRIVER_STATUS_VALUES = ["OUT_FOR_DELIVERY", "DELIVERED"] as const;

router.get("/driver/orders", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.driverId, driver.id),
      eq(ordersTable.restaurantId, driver.restaurantId),
    ))
    .orderBy(desc(ordersTable.createdAt));

  res.json({
    data: orders.map((order) => ({
      ...order,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      totalAmount: Number(order.totalAmount),
      restaurantName: "",
      driverName: driver.name,
      canRespond: order.status === "NEW",
    })),
  });
});

router.get("/driver/orders/:id", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver as typeof driversTable.$inferSelect;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [assigned] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, id),
      eq(ordersTable.driverId, driver.id),
      eq(ordersTable.restaurantId, driver.restaurantId),
    ));
  if (!assigned) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(await getOrderDetail(id));
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