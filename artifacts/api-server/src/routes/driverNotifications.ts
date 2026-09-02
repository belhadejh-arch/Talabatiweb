import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  driverPushSubscriptionsTable,
  notificationsTable,
} from "@workspace/db";
import { requireDriverAuth } from "../middlewares/auth";
import { getVapidPublicKey } from "../lib/driverPush";

const router: IRouter = Router();

router.get("/driver/notifications", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const unreadOnly = req.query.unreadOnly === "true";
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.driverId, driver.id),
      ...(unreadOnly ? [eq(notificationsTable.isRead, false)] : []),
    ))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json({ data: notifications });
});

router.patch("/driver/notifications/:id/read", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.driverId, driver.id)));
  res.json({ ok: true });
});

router.post("/driver/notifications/read-all", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.driverId, driver.id), eq(notificationsTable.isRead, false)));
  res.json({ ok: true });
});

router.get("/driver/push/vapid-public-key", requireDriverAuth, (_req, res): void => {
  res.json({ publicKey: getVapidPublicKey(), configured: Boolean(getVapidPublicKey()) });
});

router.post("/driver/push/subscription", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const subscription = req.body?.subscription;
  const device = typeof req.body?.device === "string" ? req.body.device.slice(0, 255) : null;
  if (!subscription || typeof subscription.endpoint !== "string" || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: "اشتراك Push غير صالح" });
    return;
  }

  await db.insert(driverPushSubscriptionsTable).values({
    driverId: driver.id,
    endpoint: subscription.endpoint,
    subscription: JSON.stringify(subscription),
    device,
    active: true,
  }).onConflictDoUpdate({
    target: driverPushSubscriptionsTable.endpoint,
    set: {
      driverId: driver.id,
      subscription: JSON.stringify(subscription),
      device,
      active: true,
      updatedAt: new Date(),
    },
  });
  res.status(201).json({ ok: true });
});

router.delete("/driver/push/subscription", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    res.status(400).json({ error: "عنوان الاشتراك مطلوب" });
    return;
  }
  await db.update(driverPushSubscriptionsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(and(
      eq(driverPushSubscriptionsTable.driverId, driver.id),
      eq(driverPushSubscriptionsTable.endpoint, endpoint),
    ));
  res.json({ ok: true });
});

export default router;