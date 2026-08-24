import { Router, type IRouter } from "express";
import {
  db,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  orderStatusHistoryTable,
  driversTable,
  restaurantsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, ilike, count, sql, or } from "drizzle-orm";
import {
  ListOrdersQueryParams,
  UpdateOrderStatusBody,
  AssignDriverBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { sendWhatsAppToDriver } from "../lib/whatsapp";

const router: IRouter = Router();

async function getOrderDetail(orderId: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return null;

  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, order.restaurantId));
  const driver = order.driverId
    ? (await db.select().from(driversTable).where(eq(driversTable.id, order.driverId)))[0]
    : null;

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const addons = items.length > 0
    ? await db
        .select()
        .from(orderItemAddonsTable)
        .where(sql`${orderItemAddonsTable.orderItemId} = ANY(${sql.raw(`ARRAY[${items.map((i) => i.id).join(",")}]`)})`)
    : [];

  const addonsByItem: Record<number, any[]> = {};
  for (const a of addons) {
    if (!addonsByItem[a.orderItemId]) addonsByItem[a.orderItemId] = [];
    addonsByItem[a.orderItemId].push({ addonId: a.addonId, addonName: a.addonName, price: parseFloat(a.price) });
  }

  const history = await db
    .select()
    .from(orderStatusHistoryTable)
    .where(eq(orderStatusHistoryTable.orderId, orderId))
    .orderBy(desc(orderStatusHistoryTable.changedAt));

  return {
    ...order,
    totalAmount: parseFloat(order.totalAmount),
    restaurantName: restaurant?.name ?? "",
    driverName: driver?.name ?? null,
    driverPhone: driver?.phone ?? null,
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
      selectedAddons: addonsByItem[i.id] ?? [],
    })),
    statusHistory: history.map((h) => ({ status: h.status, changedAt: h.changedAt, note: h.note })),
  };
}

// List orders
router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const qp = ListOrdersQueryParams.safeParse(req.query);
  const page = qp.success ? (qp.data.page ?? 1) : 1;
  const limit = qp.success ? (qp.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (qp.success) {
    if (qp.data.restaurantId) conditions.push(eq(ordersTable.restaurantId, qp.data.restaurantId));
    if (qp.data.status) conditions.push(eq(ordersTable.status, qp.data.status));
    if (qp.data.driverId) conditions.push(eq(ordersTable.driverId, qp.data.driverId));
    if (qp.data.dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(qp.data.dateFrom)));
    if (qp.data.dateTo) {
      const to = new Date(qp.data.dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(ordersTable.createdAt, to));
    }
    if (qp.data.search) {
      conditions.push(
        or(
          ilike(ordersTable.customerName, `%${qp.data.search}%`),
          ilike(ordersTable.customerPhone, `%${qp.data.search}%`),
        )
      );
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orders, totalResult, restaurants] = await Promise.all([
    db.select().from(ordersTable).where(where).orderBy(desc(ordersTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(ordersTable).where(where),
    db.select({ id: restaurantsTable.id, name: restaurantsTable.name }).from(restaurantsTable),
  ]);

  const restaurantMap: Record<number, string> = {};
  for (const r of restaurants) restaurantMap[r.id] = r.name;

  const driverIds = [...new Set(orders.filter((o) => o.driverId).map((o) => o.driverId!))];
  const drivers = driverIds.length > 0
    ? await db.select().from(driversTable).where(sql`${driversTable.id} = ANY(${sql.raw(`ARRAY[${driverIds.join(",")}]`)})`)
    : [];
  const driverMap: Record<number, string> = {};
  for (const d of drivers) driverMap[d.id] = d.name;

  const data = orders.map((o) => ({
    ...o,
    totalAmount: parseFloat(o.totalAmount),
    restaurantName: restaurantMap[o.restaurantId] ?? "",
    driverName: o.driverId ? (driverMap[o.driverId] ?? null) : null,
  }));

  res.json({ data, total: totalResult[0].count, page, limit });
});

// Get order detail
router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const detail = await getOrderDetail(id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);
});

// Update order status
router.patch("/orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) { res.status(404).json({ error: "Not found" }); return; }

  await db.insert(orderStatusHistoryTable).values({
    orderId: id,
    status: parsed.data.status,
    note: parsed.data.note ?? null,
  });

  const detail = await getOrderDetail(id);
  res.json(detail);
});

// Assign driver
router.post("/orders/:id/assign-driver", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AssignDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!order) { res.status(404).json({ error: "Not found" }); return; }

  // Verify driver belongs to same restaurant
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(and(eq(driversTable.id, parsed.data.driverId), eq(driversTable.restaurantId, order.restaurantId)));

  if (!driver) { res.status(400).json({ error: "Driver not found in this restaurant" }); return; }

  await db.update(ordersTable).set({ driverId: parsed.data.driverId }).where(eq(ordersTable.id, id));

  // Update driver total deliveries
  await db
    .update(driversTable)
    .set({ totalDeliveries: driver.totalDeliveries + 1 })
    .where(eq(driversTable.id, parsed.data.driverId));

  // Create notification
  await db.insert(notificationsTable).values({
    type: "DRIVER_ASSIGNED",
    message: `Driver "${driver.name}" assigned to order #${id}`,
    relatedId: id,
    relatedType: "order",
  });

  const detail = await getOrderDetail(id);

  // Send WhatsApp to driver
  if (detail) {
    const [restaurant] = await db
      .select()
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, order.restaurantId));

    const itemsSummary = detail.items
      .map((i) => `${i.productName} x${i.quantity}`)
      .join(", ");

    sendWhatsAppToDriver({
      restaurantName: restaurant?.name ?? "",
      orderId: id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: itemsSummary,
      total: `${parseFloat(order.totalAmount)} SAR`,
      mapsUrl: order.mapsUrl,
      driverPhone: driver.phone,
    }).catch(() => {}); // fire and forget
  }

  res.json(detail);
});

export default router;
