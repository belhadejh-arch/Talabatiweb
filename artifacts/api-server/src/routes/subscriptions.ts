import { Router, type IRouter } from "express";
import { db, subscriptionsTable, restaurantsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  GetSubscriptionParams,
  CreateSubscriptionParams,
  CreateSubscriptionBody,
  UpdateSubscriptionParams,
  UpdateSubscriptionBody,
  ListSubscriptionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { computeSubscriptionDates } from "../lib/subscriptions";

const router: IRouter = Router();

// Get subscription for restaurant
router.get("/restaurants/:id/subscription", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, id))
    .orderBy(desc(subscriptionsTable.createdAt));

  if (!subscription) { res.status(404).json({ error: "Not found" }); return; }
  res.json(subscription);
});

// Create / renew subscription
router.post("/restaurants/:id/subscription", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { startDate, expiryDate, status } = computeSubscriptionDates(parsed.data.plan);

  const [subscription] = await db
    .insert(subscriptionsTable)
    .values({
      restaurantId: id,
      plan: parsed.data.plan,
      status,
      startDate,
      expiryDate,
    })
    .returning();

  res.status(201).json(subscription);
});

// Update / extend subscription
router.patch("/restaurants/:id/subscription", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, id))
    .orderBy(desc(subscriptionsTable.createdAt));

  if (!current) { res.status(404).json({ error: "No subscription found" }); return; }

  const updates: Record<string, any> = {};

  if (parsed.data.renew) {
    // Renew: reset the billing cycle to start today, keeping (or switching)
    // the plan. Does not touch the restaurant or any of its data.
    const planToUse = parsed.data.plan ?? current.plan;
    const { startDate, expiryDate, status } = computeSubscriptionDates(planToUse);
    updates.plan = planToUse;
    updates.startDate = startDate;
    updates.expiryDate = expiryDate;
    updates.status = parsed.data.status ?? status;
  } else {
    if (parsed.data.status) updates.status = parsed.data.status;

    if (parsed.data.plan) {
      // Upgrade / downgrade: switching plan restarts the billing cycle.
      const { startDate, expiryDate, status } = computeSubscriptionDates(parsed.data.plan);
      updates.plan = parsed.data.plan;
      updates.startDate = startDate;
      updates.expiryDate = expiryDate;
      if (!parsed.data.status) updates.status = status;
    }

    if (parsed.data.extensionDays) {
      const currentExpiry = new Date(current.expiryDate);
      currentExpiry.setDate(currentExpiry.getDate() + parsed.data.extensionDays);
      updates.expiryDate = currentExpiry.toISOString().slice(0, 10);
      if (!parsed.data.status) updates.status = "ACTIVE";
    }
  }

  const [updated] = await db
    .update(subscriptionsTable)
    .set(updates)
    .where(eq(subscriptionsTable.id, current.id))
    .returning();

  res.json(updated);
});

// List all subscriptions
router.get("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const qp = ListSubscriptionsQueryParams.safeParse(req.query);
  const page = qp.success ? (qp.data.page ?? 1) : 1;
  const limit = qp.success ? (qp.data.limit ?? 20) : 20;
  const status = qp.success ? qp.data.status : undefined;
  const offset = (page - 1) * limit;

  const where = status ? eq(subscriptionsTable.status, status) : undefined;

  const [subs, totalResult] = await Promise.all([
    db.select().from(subscriptionsTable).where(where).orderBy(desc(subscriptionsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(subscriptionsTable).where(where),
  ]);

  res.json({ data: subs, total: totalResult[0].count, page, limit });
});

export default router;
