import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  driverOneSignalSubscriptionsTable,
  driversTable,
  notificationsTable,
  orderItemsTable,
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

type OneSignalPushResult = {
  status: number;
  responseText: string;
  responseBody: unknown;
};

type OneSignalPushError = Error & {
  status?: number;
  responseText?: string;
  responseBody?: unknown;
};

async function sendOneSignalNotification(input: {
  driverId: number;
  orderId: number;
  restaurantId: number;
  assignmentId: number;
  title: string;
  message: string;
  url: string;
  subscriptionIds: string[];
  customerName: string;
  orderType: string;
  products: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
  total: string;
}): Promise<OneSignalPushResult> {
  if (!isOneSignalConfigured()) {
    const error = new Error("OneSignal is not configured; ONESIGNAL_REST_API_KEY is required") as OneSignalPushError;
    error.status = 0;
    error.responseText = "OneSignal credentials are not configured";
    throw error;
  }

  const audience = input.subscriptionIds.length > 0
    ? { include_subscription_ids: input.subscriptionIds }
    : { include_aliases: { external_id: [String(input.driverId)] } };
  const send = async (target: typeof audience) => {
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        target_channel: "push",
        ...target,
        headings: { en: input.title, ar: input.title },
        contents: { en: input.message, ar: input.message },
        url: input.url,
        chrome_web_icon: driverAppIconUrl,
        chrome_web_badge: driverAppIconUrl,
        data: {
          type: "NEW_DRIVER_ORDER",
          orderId: input.orderId,
          restaurantId: input.restaurantId,
          customerName: input.customerName,
          orderType: input.orderType,
          products: input.products,
          total: input.total,
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
    return { status: response.status, responseText, responseBody };
  };

  const validate = (result: Awaited<ReturnType<typeof send>>): OneSignalPushResult => {
    const responseLog = {
      driverId: input.driverId,
      orderId: input.orderId,
      restaurantId: input.restaurantId,
      assignmentId: input.assignmentId,
      appId: oneSignalAppId,
      status: result.status,
      response: result.responseBody,
    };
    const oneSignalErrors = result.responseBody && typeof result.responseBody === "object" && "errors" in result.responseBody
      ? result.responseBody.errors
      : null;
    const hasOneSignalErrors =
      (Array.isArray(oneSignalErrors) && oneSignalErrors.length > 0) ||
      (oneSignalErrors !== null &&
        typeof oneSignalErrors === "object" &&
        Object.keys(oneSignalErrors).length > 0) ||
      (typeof oneSignalErrors === "string" && oneSignalErrors.length > 0);
    const hasEmptyNotificationId =
      result.responseBody &&
      typeof result.responseBody === "object" &&
      "id" in result.responseBody &&
      !result.responseBody.id;

    if (result.status < 200 || result.status >= 300 || hasOneSignalErrors || hasEmptyNotificationId) {
      logger.error(responseLog, "OneSignal push request failed");
      const error = new Error(`OneSignal returned ${result.status}: ${result.responseText}`) as OneSignalPushError;
      error.status = result.status;
      error.responseText = result.responseText;
      error.responseBody = result.responseBody;
      throw error;
    }
    logger.info(responseLog, "OneSignal push request completed");
    return result;
  };

  return validate(await send(audience));
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
      customerName: ordersTable.customerName,
      source: ordersTable.source,
    })
    .from(ordersTable)
    .innerJoin(restaurantsTable, eq(restaurantsTable.id, ordersTable.restaurantId))
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.driverId, driverId),
      eq(ordersTable.status, "NEW"),
      eq(ordersTable.source, "PUBLIC_CUSTOMER"),
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
      eq(orderDriverAttemptsTable.notificationStatus, "PENDING"),
    ));
  if (!order || !driver || !attempt) return;

  const [claimedAttempt] = await db
    .update(orderDriverAttemptsTable)
    .set({
      notificationStatus: "SENDING",
      notificationAttemptedAt: new Date(),
    })
    .where(and(
      eq(orderDriverAttemptsTable.id, attempt.id),
      eq(orderDriverAttemptsTable.orderId, orderId),
      eq(orderDriverAttemptsTable.driverId, driverId),
      eq(orderDriverAttemptsTable.status, "PENDING"),
      eq(orderDriverAttemptsTable.notificationStatus, "PENDING"),
      sql`EXISTS (
        SELECT 1
          FROM orders current_order
          JOIN drivers current_driver ON current_driver.id = current_order.driver_id
         WHERE current_order.id = ${orderId}
           AND current_order.driver_id = ${driverId}
           AND current_order.restaurant_id = ${orderDriverAttemptsTable.restaurantId}
           AND current_order.status = 'NEW'
           AND current_order.source = 'PUBLIC_CUSTOMER'
           AND current_driver.is_active = true
           AND current_driver.status = 'ACTIVE'
      )`,
    ))
    .returning({ id: orderDriverAttemptsTable.id });
  if (!claimedAttempt) return;

  try {
    const products = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
        subtotal: orderItemsTable.subtotal,
      })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));

    const subscriptions = await db
      .select({ subscriptionId: driverOneSignalSubscriptionsTable.subscriptionId })
      .from(driverOneSignalSubscriptionsTable)
      .where(and(
        eq(driverOneSignalSubscriptionsTable.driverId, driverId),
        eq(driverOneSignalSubscriptionsTable.appId, oneSignalAppId),
        eq(driverOneSignalSubscriptionsTable.externalId, String(driverId)),
        eq(driverOneSignalSubscriptionsTable.optedIn, true),
      ))
      .orderBy(desc(driverOneSignalSubscriptionsTable.updatedAt))
      .limit(1);
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
      `العميل: ${order.customerName}`,
      `نوع الطلب: ${typeLabel}`,
      `المنتجات: ${products.map((product) => `${product.productName} × ${product.quantity}`).join("، ")}`,
      `الإجمالي: ${Number(order.totalAmount).toFixed(2)} د.ل`,
    ].join("\n");

    const result = await sendOneSignalNotification({
      driverId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      assignmentId: attempt.id,
      title: "🚨 طلب جديد",
      message,
      url: driverOrderUrl(order.id),
      subscriptionIds,
      customerName: order.customerName,
      orderType: order.orderType,
      products,
      total: order.totalAmount,
    });

    const [notification] = await db.insert(notificationsTable).values({
      type: "NEW_DRIVER_ORDER",
      message,
      driverId,
      restaurantId: order.restaurantId,
      orderId: order.id,
      relatedId: order.id,
      relatedType: "order",
    }).returning({ id: notificationsTable.id });

    await db.update(orderDriverAttemptsTable)
      .set({
        notificationStatus: "SENT",
        notificationSentAt: new Date(),
        notificationResponseStatus: result.status,
        notificationResponse: result.responseText,
      })
      .where(eq(orderDriverAttemptsTable.id, attempt.id));

    publishDriverEvent(driverId, {
      type: "NEW_DRIVER_ORDER",
      notificationId: notification?.id ?? null,
      orderId: order.id,
      message,
    });
  } catch (error) {
    const pushError = error as OneSignalPushError;
    const responseText = pushError.responseText ?? pushError.message;
    await db.update(orderDriverAttemptsTable)
      .set({
        notificationStatus: "FAILED",
        notificationResponseStatus: pushError.status ?? null,
        notificationResponse: responseText,
        notificationError: pushError.message,
      })
      .where(eq(orderDriverAttemptsTable.id, attempt.id));
    logger.error({
      err: error,
      orderId: order.id,
      restaurantId: order.restaurantId,
      driverId,
      assignmentId: attempt.id,
      timestamp: new Date().toISOString(),
      oneSignalResponseStatus: pushError.status ?? null,
      oneSignalResponse: pushError.responseBody ?? responseText,
    }, "Driver OneSignal notification failed");
    throw error;
  }
}