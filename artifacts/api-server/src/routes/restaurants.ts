import { Router, type IRouter } from "express";
import { db, restaurantsTable, subscriptionsTable } from "@workspace/db";
import { eq, ilike, and, desc, count, sql } from "drizzle-orm";
import {
  CreateRestaurantBody,
  UpdateRestaurantBody,
  UpdateRestaurantStatusBody,
  GetRestaurantParams,
  UpdateRestaurantParams,
  DeleteRestaurantParams,
  UpdateRestaurantStatusParams,
  ListRestaurantsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { computeSubscriptionDates } from "../lib/subscriptions";
import { notificationsTable } from "@workspace/db";
import { deleteDatabaseStoredImage, deleteStoredImage } from "../lib/imageUpload";

const router: IRouter = Router();

// List restaurants
router.get("/restaurants", requireAuth, async (req, res): Promise<void> => {
  const qp = ListRestaurantsQueryParams.safeParse(req.query);
  const page = qp.success ? (qp.data.page ?? 1) : 1;
  const limit = qp.success ? (qp.data.limit ?? 20) : 20;
  const search = qp.success ? qp.data.search : undefined;
  const status = qp.success ? qp.data.status : undefined;

  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(ilike(restaurantsTable.name, `%${search}%`));
  if (status) conditions.push(eq(restaurantsTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [restaurants, totalResult] = await Promise.all([
    db
      .select()
      .from(restaurantsTable)
      .where(whereClause)
      .orderBy(desc(restaurantsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(restaurantsTable)
      .where(whereClause),
  ]);

  const restaurantIds = restaurants.map((r) => r.id);
  let subscriptions: any[] = [];
  if (restaurantIds.length > 0) {
    subscriptions = await db
      .select()
      .from(subscriptionsTable)
      .where(sql`${subscriptionsTable.restaurantId} = ANY(${sql.raw(`ARRAY[${restaurantIds.join(",")}]`)})`)
      .orderBy(desc(subscriptionsTable.createdAt));
  }

  const subByRestaurant: Record<number, any> = {};
  for (const sub of subscriptions) {
    if (!subByRestaurant[sub.restaurantId]) subByRestaurant[sub.restaurantId] = sub;
  }

  const data = restaurants.map((r) => ({
    ...r,
    deliveryFee: parseFloat(r.deliveryFee),
    subscription: subByRestaurant[r.id] ?? null,
  }));

  res.json({ data, total: totalResult[0].count, page, limit });
});

// Create restaurant
router.post("/restaurants", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRestaurantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { subscriptionPlan, ...restaurantData } = parsed.data;

  // Check slug uniqueness
  const existing = await db
    .select({ id: restaurantsTable.id })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.slug, restaurantData.slug));

  if (existing.length > 0) {
    res.status(400).json({ error: "Slug already taken" });
    return;
  }

  const insertValues: any = {
    ...restaurantData,
    ...(restaurantData.deliveryFee !== undefined ? { deliveryFee: String(restaurantData.deliveryFee) } : {}),
  };
  const [restaurant] = await db.insert(restaurantsTable).values(insertValues).returning();

  // Create subscription
  const { startDate, expiryDate, status } = computeSubscriptionDates(subscriptionPlan);
  const [subscription] = await db.insert(subscriptionsTable).values({
    restaurantId: restaurant.id,
    plan: subscriptionPlan,
    status,
    startDate,
    expiryDate,
  }).returning();

  // Create notification
  await db.insert(notificationsTable).values({
    type: "NEW_RESTAURANT",
    message: `تم إنشاء مطعم جديد "${restaurant.name}"`,
    relatedId: restaurant.id,
    relatedType: "restaurant",
  });

  res.status(201).json({ ...restaurant, deliveryFee: parseFloat(restaurant.deliveryFee), subscription });
});

// Get restaurant
router.get("/restaurants/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id));
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, id))
    .orderBy(desc(subscriptionsTable.createdAt));

  res.json({ ...restaurant, deliveryFee: parseFloat(restaurant.deliveryFee), subscription: subscription ?? null });
});

// Update restaurant
router.patch("/restaurants/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateRestaurantBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [previous] = await db.select({ logoUrl: restaurantsTable.logoUrl, coverUrl: restaurantsTable.coverUrl }).from(restaurantsTable).where(eq(restaurantsTable.id, id));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }

  const updateValues: any = { ...parsed.data };
  if (parsed.data.deliveryFee !== undefined) updateValues.deliveryFee = String(parsed.data.deliveryFee);

  const [restaurant] = await db
    .update(restaurantsTable)
    .set(updateValues)
    .where(eq(restaurantsTable.id, id))
    .returning();

  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }

  const replacedImages = [previous.logoUrl, previous.coverUrl]
    .filter((url): url is string => !!url && url !== restaurant.logoUrl && url !== restaurant.coverUrl);
  for (const url of replacedImages) {
    void Promise.all([deleteStoredImage(url), deleteDatabaseStoredImage(url)]).catch(() => undefined);
  }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, id))
    .orderBy(desc(subscriptionsTable.createdAt));

  res.json({ ...restaurant, deliveryFee: parseFloat(restaurant.deliveryFee), subscription: subscription ?? null });
});

// Delete restaurant
router.delete("/restaurants/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(restaurantsTable).where(eq(restaurantsTable.id, id));
  res.sendStatus(204);
});

// Update restaurant status
router.patch("/restaurants/:id/status", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateRestaurantStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [restaurant] = await db
    .update(restaurantsTable)
    .set({ status: parsed.data.status })
    .where(eq(restaurantsTable.id, id))
    .returning();

  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, id))
    .orderBy(desc(subscriptionsTable.createdAt));

  res.json({ ...restaurant, deliveryFee: parseFloat(restaurant.deliveryFee), subscription: subscription ?? null });
});

export default router;
