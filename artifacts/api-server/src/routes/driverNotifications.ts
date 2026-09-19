import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  driverOneSignalSubscriptionsTable,
  driverPushSubscriptionsTable,
  notificationsTable,
} from "@workspace/db";
import { requireDriverAuth } from "../middlewares/auth";
import { getOneSignalAppId, isOneSignalConfigured } from "../lib/driverPush";
import { subscribeToDriverEvents } from "../lib/driverEvents";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/driver/events", requireDriverAuth, (req, res): void => {
  const driver = (req as any).driver;
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const unsubscribe = subscribeToDriverEvents(driver.id, res);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

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

router.get("/driver/push/onesignal-config", requireDriverAuth, (_req, res): void => {
  res.json({ appId: getOneSignalAppId(), configured: isOneSignalConfigured() });
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

router.post("/driver/push/onesignal-subscription", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const subscriptionId = typeof req.body?.subscriptionId === "string"
    ? req.body.subscriptionId.trim()
    : "";
  const appId = typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
  const externalId = typeof req.body?.externalId === "string" ? req.body.externalId.trim() : "";
  const notificationPermission = req.body?.notificationPermission;
  const optedIn = req.body?.optedIn === true;
  const expectedExternalId = String(driver.id);

  if (!isOneSignalConfigured()) {
    logger.error(
      { driverId: driver.id, appId: getOneSignalAppId() },
      "Cannot register OneSignal driver subscription because the backend REST key is not configured",
    );
    res.status(503).json({ error: "إشعارات OneSignal غير مهيأة في الخادم" });
    return;
  }
  if (appId !== getOneSignalAppId()) {
    logger.warn(
      { driverId: driver.id, receivedAppId: appId, expectedAppId: getOneSignalAppId() },
      "Rejected OneSignal subscription with a mismatched App ID",
    );
    res.status(400).json({ error: "OneSignal App ID غير مطابق" });
    return;
  }
  if (externalId !== expectedExternalId) {
    logger.warn(
      { driverId: driver.id, receivedExternalId: externalId, expectedExternalId },
      "Rejected OneSignal subscription with a mismatched external ID",
    );
    res.status(400).json({ error: "هوية OneSignal لا تطابق السائق الحالي" });
    return;
  }

  if (!optedIn || notificationPermission !== "granted") {
    await db.update(driverOneSignalSubscriptionsTable)
      .set({ optedIn: false, updatedAt: new Date() })
      .where(and(
        eq(driverOneSignalSubscriptionsTable.driverId, driver.id),
        eq(driverOneSignalSubscriptionsTable.appId, appId),
        eq(driverOneSignalSubscriptionsTable.externalId, expectedExternalId),
      ));
    logger.warn(
      {
        driverId: driver.id,
        appId,
        externalId: expectedExternalId,
        subscriptionId: subscriptionId || null,
        notificationPermission,
        optedIn,
      },
      "OneSignal driver subscription is not active; push notifications are disabled for this driver",
    );
    res.status(409).json({ error: "جهاز السائق غير مشترك فعليًا في الإشعارات", subscribed: false });
    return;
  }

  if (!subscriptionId || subscriptionId.length > 255) {
    logger.warn(
      { driverId: driver.id, appId, externalId: expectedExternalId },
      "OneSignal driver subscription registration has no valid subscription ID",
    );
    res.status(400).json({ error: "معرّف OneSignal Subscription غير صالح" });
    return;
  }

  const [existingSubscription] = await db
    .select({
      driverId: driverOneSignalSubscriptionsTable.driverId,
      appId: driverOneSignalSubscriptionsTable.appId,
      externalId: driverOneSignalSubscriptionsTable.externalId,
    })
    .from(driverOneSignalSubscriptionsTable)
    .where(eq(driverOneSignalSubscriptionsTable.subscriptionId, subscriptionId));
  if (
    existingSubscription &&
    (
      existingSubscription.driverId !== driver.id ||
      existingSubscription.appId !== appId ||
      existingSubscription.externalId !== expectedExternalId
    )
  ) {
    logger.error(
      {
        driverId: driver.id,
        subscriptionId,
        existingDriverId: existingSubscription.driverId,
        existingAppId: existingSubscription.appId,
        existingExternalId: existingSubscription.externalId,
        appId,
        externalId: expectedExternalId,
      },
      "Rejected OneSignal subscription already owned by another driver identity",
    );
    res.status(409).json({ error: "اشتراك OneSignal مرتبط بسائق آخر" });
    return;
  }

  // A browser can create a new subscription after a reinstall, profile
  // switch, or permission reset. Keep only the current opted-in subscription
  // eligible for driver-order pushes so an old browser cannot receive a
  // duplicate or stale alert.
  await db.update(driverOneSignalSubscriptionsTable)
    .set({ optedIn: false, updatedAt: new Date() })
    .where(and(
      eq(driverOneSignalSubscriptionsTable.driverId, driver.id),
      eq(driverOneSignalSubscriptionsTable.appId, appId),
      eq(driverOneSignalSubscriptionsTable.externalId, expectedExternalId),
    ));

  await db.insert(driverOneSignalSubscriptionsTable).values({
    driverId: driver.id,
    appId,
    subscriptionId,
    externalId: expectedExternalId,
    optedIn,
  }).onConflictDoUpdate({
    target: driverOneSignalSubscriptionsTable.subscriptionId,
    set: {
      driverId: driver.id,
      appId,
      externalId: expectedExternalId,
      optedIn,
      updatedAt: new Date(),
    },
  });

  logger.info(
    {
      driverId: driver.id,
      appId,
      subscriptionId,
      externalId: expectedExternalId,
      notificationPermission,
      optedIn,
    },
    "OneSignal driver subscription registered",
  );
  res.status(201).json({
    ok: true,
    subscribed: true,
    appId,
    externalId: expectedExternalId,
    subscriptionId,
    optedIn,
  });
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