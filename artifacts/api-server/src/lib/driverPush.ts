import webpush from "web-push";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  driverPushSubscriptionsTable,
  driversTable,
  notificationsTable,
  orderDriverAttemptsTable,
  ordersTable,
  restaurantsTable,
} from "@workspace/db";
import { logger } from "./logger";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const vapidSubject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@talabat.local";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  logger.warn("Web Push is disabled until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are configured");
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey || null;
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export async function notifyAssignedDriver(driverId: number, orderId: number): Promise<void> {
  const [order] = await db
    .select({
      id: ordersTable.id,
      totalAmount: ordersTable.totalAmount,
      restaurantId: ordersTable.restaurantId,
      restaurantName: restaurantsTable.name,
    })
    .from(ordersTable)
    .innerJoin(restaurantsTable, eq(restaurantsTable.id, ordersTable.restaurantId))
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.driverId, driverId),
      eq(ordersTable.status, "NEW"),
    ));

  const [driver] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.id, driverId));
  const [attempt] = await db
    .select({ id: orderDriverAttemptsTable.id })
    .from(orderDriverAttemptsTable)
    .where(and(
      eq(orderDriverAttemptsTable.orderId, orderId),
      eq(orderDriverAttemptsTable.driverId, driverId),
      eq(orderDriverAttemptsTable.status, "PENDING"),
    ));
  if (!order || !driver || !attempt) return;

  const message = `طلب جديد من ${order.restaurantName} — الطلب #${order.id}`;
  await db.insert(notificationsTable).values({
    type: "NEW_DRIVER_ORDER",
    message,
    driverId,
    restaurantId: order.restaurantId,
    orderId: order.id,
    relatedId: order.id,
    relatedType: "order",
  });

  if (!isPushConfigured()) return;

  const subscriptions = await db
    .select()
    .from(driverPushSubscriptionsTable)
    .where(and(
      eq(driverPushSubscriptionsTable.driverId, driverId),
      eq(driverPushSubscriptionsTable.active, true),
    ))
    .orderBy(desc(driverPushSubscriptionsTable.updatedAt));

  const payload = JSON.stringify({
    type: "NEW_DRIVER_ORDER",
    title: "🚨 طلب جديد",
    body: `مطعم ${order.restaurantName} · الطلب #${order.id} · الإجمالي: ${Number(order.totalAmount).toFixed(2)} د.ل`,
    orderId: order.id,
    url: `/driver/dashboard?order=${order.id}`,
  });

  await Promise.all(subscriptions.map(async (record) => {
    try {
      await webpush.sendNotification(JSON.parse(record.subscription), payload);
    } catch (error: any) {
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db
          .update(driverPushSubscriptionsTable)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(driverPushSubscriptionsTable.id, record.id));
      } else {
        logger.warn({ err: error, driverId, subscriptionId: record.id }, "Driver Web Push delivery failed");
      }
    }
  }));
}