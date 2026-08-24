import { Router, type IRouter } from "express";
import { db, ordersTable, restaurantsTable, subscriptionsTable, productsTable, orderItemsTable, driversTable } from "@workspace/db";
import { eq, gte, lte, and, sql, count, sum, avg, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function getDateRange(period?: string, dateFrom?: string, dateTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date();
  let from = new Date();

  if (period === "today") {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    from.setDate(now.getDate() - 7);
  } else if (period === "month") {
    from.setDate(now.getDate() - 30);
  } else if (period === "year") {
    from.setFullYear(now.getFullYear() - 1);
  } else if (period === "custom" && dateFrom && dateTo) {
    from = new Date(dateFrom);
    to.setTime(new Date(dateTo).getTime());
    to.setHours(23, 59, 59, 999);
  } else {
    from.setDate(now.getDate() - 30);
  }

  return { from, to };
}

// Summary KPIs
router.get("/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo } = req.query as Record<string, string>;
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const [
    allRestaurants,
    ordersInPeriod,
    newToday,
    revenueToday,
  ] = await Promise.all([
    db.select().from(restaurantsTable),
    db
      .select({ total: count(), revenue: sum(ordersTable.totalAmount) })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
    db
      .select({ total: count() })
      .from(ordersTable)
      .where(
        gte(ordersTable.createdAt, (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })())
      ),
    db
      .select({ rev: sum(ordersTable.totalAmount) })
      .from(ordersTable)
      .where(
        gte(ordersTable.createdAt, (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })())
      ),
  ]);

  const subs = await db.select().from(subscriptionsTable);
  const latestSubByRestaurant: Record<number, any> = {};
  for (const s of subs) {
    if (!latestSubByRestaurant[s.restaurantId] || s.createdAt > latestSubByRestaurant[s.restaurantId].createdAt) {
      latestSubByRestaurant[s.restaurantId] = s;
    }
  }

  let totalRestaurants = allRestaurants.length;
  let activeRestaurants = 0;
  let trialRestaurants = 0;
  let expiredRestaurants = 0;
  let suspendedRestaurants = 0;

  for (const r of allRestaurants) {
    const sub = latestSubByRestaurant[r.id];
    if (!sub) { expiredRestaurants++; continue; }
    if (sub.status === "TRIAL") trialRestaurants++;
    else if (sub.status === "ACTIVE") activeRestaurants++;
    else if (sub.status === "EXPIRED") expiredRestaurants++;
    else if (sub.status === "SUSPENDED") suspendedRestaurants++;
  }

  const totalOrders = Number(ordersInPeriod[0].total) || 0;
  const totalRevenue = parseFloat(ordersInPeriod[0].revenue ?? "0") || 0;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  res.json({
    totalRestaurants,
    activeRestaurants,
    trialRestaurants,
    expiredRestaurants,
    suspendedRestaurants,
    totalOrders,
    totalRevenue,
    averageOrderValue,
    newOrdersToday: Number(newToday[0].total) || 0,
    revenueToday: parseFloat(revenueToday[0].rev ?? "0") || 0,
  });
});

// Orders over time
router.get("/analytics/orders-over-time", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo, restaurantId } = req.query as Record<string, string>;
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const conditions: any[] = [gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)];
  if (restaurantId) conditions.push(eq(ordersTable.restaurantId, parseInt(restaurantId)));

  const rows = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})`,
      value: count(),
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  res.json(rows.map((r) => ({ date: r.date, value: Number(r.value) })));
});

// Revenue over time
router.get("/analytics/revenue-over-time", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo, restaurantId } = req.query as Record<string, string>;
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const conditions: any[] = [gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)];
  if (restaurantId) conditions.push(eq(ordersTable.restaurantId, parseInt(restaurantId)));

  const rows = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})`,
      value: sum(ordersTable.totalAmount),
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  res.json(rows.map((r) => ({ date: r.date, value: parseFloat(r.value ?? "0") })));
});

// Top restaurants
router.get("/analytics/top-restaurants", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo } = req.query as Record<string, string>;
  const limit = parseInt((req.query.limit as string) ?? "10");
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const rows = await db
    .select({
      restaurantId: ordersTable.restaurantId,
      totalOrders: count(),
      totalRevenue: sum(ordersTable.totalAmount),
    })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(ordersTable.restaurantId)
    .orderBy(desc(sum(ordersTable.totalAmount)))
    .limit(limit);

  const restaurantIds = rows.map((r) => r.restaurantId);
  const names: Record<number, string> = {};
  if (restaurantIds.length > 0) {
    const rests = await db.select({ id: restaurantsTable.id, name: restaurantsTable.name }).from(restaurantsTable);
    for (const r of rests) names[r.id] = r.name;
  }

  res.json(rows.map((r) => ({
    restaurantId: r.restaurantId,
    restaurantName: names[r.restaurantId] ?? "",
    totalOrders: Number(r.totalOrders),
    totalRevenue: parseFloat(r.totalRevenue ?? "0"),
  })));
});

// Top products
router.get("/analytics/top-products", requireAuth, async (req, res): Promise<void> => {
  const { period, dateFrom, dateTo } = req.query as Record<string, string>;
  const limit = parseInt((req.query.limit as string) ?? "10");
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const rows = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      totalSold: sum(orderItemsTable.quantity),
      totalRevenue: sum(orderItemsTable.subtotal),
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sum(orderItemsTable.quantity)))
    .limit(limit);

  const restaurantMap: Record<number, string> = {};
  const products = await db.select({ id: productsTable.id, restaurantId: productsTable.restaurantId }).from(productsTable);
  const restaurants = await db.select({ id: restaurantsTable.id, name: restaurantsTable.name }).from(restaurantsTable);
  for (const r of restaurants) restaurantMap[r.id] = r.name;
  const productToRestaurant: Record<number, number> = {};
  for (const p of products) productToRestaurant[p.id] = p.restaurantId;

  res.json(rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    restaurantName: restaurantMap[productToRestaurant[r.productId] ?? 0] ?? "",
    totalSold: Number(r.totalSold),
    totalRevenue: parseFloat(r.totalRevenue ?? "0"),
  })));
});

// Driver performance
router.get("/analytics/driver-performance", requireAuth, async (req, res): Promise<void> => {
  const { restaurantId, period, dateFrom, dateTo } = req.query as Record<string, string>;
  const { from, to } = getDateRange(period, dateFrom, dateTo);

  const conditions: any[] = [gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)];
  if (restaurantId) conditions.push(eq(ordersTable.restaurantId, parseInt(restaurantId)));

  const rows = await db
    .select({
      driverId: ordersTable.driverId,
      totalDeliveries: count(),
      deliveredCount: count(sql`CASE WHEN ${ordersTable.status} = 'DELIVERED' THEN 1 END`),
    })
    .from(ordersTable)
    .where(and(sql`${ordersTable.driverId} IS NOT NULL`, ...conditions))
    .groupBy(ordersTable.driverId);

  const driverIds = rows.map((r) => r.driverId!).filter(Boolean);
  const driversData = driverIds.length > 0
    ? await db.select().from(driversTable)
    : [];
  const restaurants = await db.select({ id: restaurantsTable.id, name: restaurantsTable.name }).from(restaurantsTable);
  const restMap: Record<number, string> = {};
  for (const r of restaurants) restMap[r.id] = r.name;
  const driverMap: Record<number, any> = {};
  for (const d of driversData) driverMap[d.id] = d;

  res.json(
    rows
      .filter((r) => r.driverId != null)
      .map((r) => {
        const driver = driverMap[r.driverId!] ?? {};
        return {
          driverId: r.driverId,
          driverName: driver.name ?? "",
          restaurantName: restMap[driver.restaurantId] ?? "",
          totalDeliveries: Number(r.totalDeliveries),
          deliveredCount: Number(r.deliveredCount),
        };
      })
  );
});

// Peak hours
router.get("/analytics/peak-hours", requireAuth, async (req, res): Promise<void> => {
  const { restaurantId, period } = req.query as Record<string, string>;
  const { from, to } = getDateRange(period);

  const conditions: any[] = [gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)];
  if (restaurantId) conditions.push(eq(ordersTable.restaurantId, parseInt(restaurantId)));

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${ordersTable.createdAt})::int`,
      orderCount: count(),
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`);

  res.json(rows.map((r) => ({ hour: r.hour, orderCount: Number(r.orderCount) })));
});

export default router;
