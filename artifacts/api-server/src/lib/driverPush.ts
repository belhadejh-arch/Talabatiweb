import { and, eq } from "drizzle-orm";
import {
  db,
  driverOneSignalSubscriptionsTable,
  driversTable,
  notificationsTable,
  orderDriverAttemptsTable,
  ordersTable,
  restaurantsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { publishDriverEvent } from "./driverEvents";

const DEFAULT_ONESIGNAL_APP_ID = "a076a6a2-2555-42f7-89f1-5fecc8dcf449";
const oneSignalAppId = process.env.ONESIGNAL_APP_ID?.trim() || DEFAULT_ONESIGNAL_APP_ID;
const oneSignalApiKey = process.env.ONESIGNAL_REST_API_KEY?.trim() || "";
const driverDashboardUrl = (
  process.env.DRIVER_DASHBOARD_URL?.trim() ||
  `${process.env.FRONTEND_URL?.trim().replace(/\/$/, "") || "https://talabatiweb-talabat-h1pe-lime.vercel.app"}/driver/dashboard`
).replace(/\/$/, "");
const driverAppIconUrl = (
  process.env.DRIVER_APP_ICON_URL?.trim() ||
  (() => {
    try {
      return `${new URL(driverDashboardUrl).origin}/app-icon-512.png`;
    } catch {
      return "https://talabatiweb-talabat-h1pe-lime.vercel.app/app-icon-512.png";
    }
  })()
).replace(/\/$/, "");

export function getOneSignalAppId(): string {
  return oneSignalAppId;
}

export function isOneSignalConfigured(): boolean {
  return Boolean(oneSignalAppId && oneSignalApiKey);
}

function driverOrderUrl(orderId: number): string {
  return `${driverDashboardUrl}?order=${encodeURIComponent(orderId)}`;
}

async function sendOneSignalNotification(input: {
  driverId: number;
  orderId: number;
  title: string;
  message: string;
  url: string;
  subscriptionIds: string[];
}): Promise<void> {
  if (!isOneSignalConfigured()) {
    logger.warn(
      { driverId: input.driverId, orderId: input.orderId },
      "OneSignal is not configured; set ONESIGNAL_REST_API_KEY to send driver push notifications",
    );
    return;
  }

  const audience = input.subscriptionIds.length > 0
    ? { include_subscription_ids: input.subscriptionIds }
    : { include_aliases: { external_id: [String(input.driverId)] } };
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      Authorization: `Key ${oneSignalApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: oneSignalAppId,
      target_channel: "push",
      ...audience,
      headings: { en: input.title, ar: input.title },
      contents: { en: input.message, ar: input.message },
      url: input.url,
      chrome_web_icon: driverAppIconUrl,
      chrome_web_badge: driverAppIconUrl,
      data: {
        type: "NEW_DRIVER_ORDER",
        orderId: input.orderId,
        url: input.url,
      },
    }),
  });

  const responseText = await response.text().catch(() => "");
  let responseBody: unknown = responseText;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Keep the raw response in the log when OneSignal does not return JSON.
  }

  const responseLog = {
    driverId: input.driverId,
    orderId: input.orderId,
    appId: oneSignalAppId,
    status: response.status,
    response: responseBody,
  };
  const oneSignalErrors = responseBody && typeof responseBody === "object" && "errors" in responseBody
    ? responseBody.errors
    : null;
  const hasOneSignalErrors =
    (Array.isArray(oneSignalErrors) && oneSignalErrors.length > 0) ||
    (oneSignalErrors !== null &&
      typeof oneSignalErrors === "object" &&
      Object.keys(oneSignalErrors).length > 0) ||
    (typeof oneSignalErrors === "string" && oneSignalErrors.length > 0);
  const hasEmptyNotificationId =
    responseBody &&
    typeof responseBody === "object" &&
    "id" in responseBody &&
    !responseBody.id;

  if (!response.ok || hasOneSignalErrors || hasEmptyNotificationId) {
    logger.error(responseLog, "OneSignal push request failed");
    throw new Error(`OneSignal returned ${response.status}: ${responseText.slice(0, 500)}`);
  }

  logger.info(responseLog, "OneSignal push request completed");
}

/**
 * Sends only to the driver whose PENDING attempt is currently active.
 * The database check is deliberately repeated immediately before sending so
 * a late notification cannot be sent after a rejection or timeout.
 */
export async function notifyAssignedDriver(driverId: number, orderId: number): Promise<void> {
  const [order] = await db
    .select({
      id: ordersTable.id,
      totalAmount: ordersTable.totalAmount,
      orderType: ordersTable.orderType,
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
    .where(and(
      eq(driversTable.id, driverId),
      eq(driversTable.restaurantId, order?.restaurantId ?? -1),
      eq(driversTable.isActive, true),
      eq(driversTable.status, "ACTIVE"),
    ));
  const [attempt] = await db
    .select({ id: orderDriverAttemptsTable.id })
    .from(orderDriverAttemptsTable)
    .where(and(
      eq(orderDriverAttemptsTable.orderId, orderId),
      eq(orderDriverAttemptsTable.driverId, driverId),
      eq(orderDriverAttemptsTable.restaurantId, order?.restaurantId ?? -1),
      eq(orderDriverAttemptsTable.status, "PENDING"),
    ));
  if (!order || !driver || !attempt) return;

  const subscriptions = await db
    .select({ subscriptionId: driverOneSignalSubscriptionsTable.subscriptionId })
    .from(driverOneSignalSubscriptionsTable)
    .where(and(
      eq(driverOneSignalSubscriptionsTable.driverId, driverId),
      eq(driverOneSignalSubscriptionsTable.appId, oneSignalAppId),
      eq(driverOneSignalSubscriptionsTable.externalId, String(driverId)),
      eq(driverOneSignalSubscriptionsTable.optedIn, true),
    ))
    .orderBy(driverOneSignalSubscriptionsTable.updatedAt)
    .limit(20);
  const subscriptionIds = subscriptions.map(({ subscriptionId }) => subscriptionId);
  if (subscriptionIds.length === 0) {
    logger.warn(
      { driverId, orderId },
      "No opted-in OneSignal subscription is registered; falling back to driver external_id",
    );
  }

  const typeLabel = order.orderType === "RESERVATION" ? "حجز" : "توصيل";
  const message = [
    `الطلب #${order.id}`,
    `مطعم: ${order.restaurantName}`,
    `نوع الطلب: ${typeLabel}`,
    `الإجمالي: ${Number(order.totalAmount).toFixed(2)} د.ل`,
  ].join("\n");

  const [notification] = await db.insert(notificationsTable).values({
    type: "NEW_DRIVER_ORDER",
    message,
    driverId,
    restaurantId: order.restaurantId,
    orderId: order.id,
    relatedId: order.id,
    relatedType: "order",
  }).returning({ id: notificationsTable.id });

  publishDriverEvent(driverId, {
    type: "NEW_DRIVER_ORDER",
    notificationId: notification?.id ?? null,
    orderId: order.id,
    message,
  });

  await sendOneSignalNotification({
    driverId,
    orderId: order.id,
    title: "🚨 طلب جديد",
    message,
    url: driverOrderUrl(order.id),
    subscriptionIds,
  });
}