import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  db,
  driverOneSignalSubscriptionsTable,
  driversTable,
  orderItemAddonsTable,
  orderItemsTable,
  orderDriverAttemptsTable,
  ordersTable,
  pool,
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

type DriverPushProduct = {
  productId: number;
  productName: string;
  sizeName: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  selectedAddons: Array<{ addonName: string; price: string }>;
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
  data: Record<string, unknown>;
}): Promise<OneSignalPushResult> {
  if (!isOneSignalConfigured()) {
    const error = new Error("OneSignal is not configured; ONESIGNAL_REST_API_KEY is required") as OneSignalPushError;
    error.status = 0;
    error.responseText = "OneSignal credentials are not configured";
    throw error;
  }

  if (input.subscriptionIds.length === 0) {
    const error = new Error("A real OneSignal subscription is required for driver push") as OneSignalPushError;
    error.status = 0;
    error.responseText = "No OneSignal subscription ID was selected";
    throw error;
  }

  const audience = { include_subscription_ids: input.subscriptionIds };
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
        data: input.data,
      }),
      signal: AbortSignal.timeout(30_000),
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
export async function notifyAssignedDriver(
  driverId: number,
  orderId: number,
  assignmentId: number,
): Promise<void> {
  const [order] = await db
    .select({
      id: ordersTable.id,
      totalAmount: ordersTable.totalAmount,
      orderType: ordersTable.orderType,
      restaurantId: ordersTable.restaurantId,
      restaurantName: restaurantsTable.name,
      customerName: ordersTable.customerName,
      customerPhone: ordersTable.customerPhone,
      notes: ordersTable.notes,
      latitude: ordersTable.latitude,
      longitude: ordersTable.longitude,
      mapsUrl: ordersTable.mapsUrl,
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
      eq(orderDriverAttemptsTable.id, assignmentId),
      eq(orderDriverAttemptsTable.restaurantId, order?.restaurantId ?? -1),
      eq(orderDriverAttemptsTable.status, "PENDING"),
      eq(orderDriverAttemptsTable.notificationStatus, "PENDING"),
      gt(orderDriverAttemptsTable.timeoutAt, new Date()),
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
            AND ${orderDriverAttemptsTable.timeoutAt} > NOW()
           AND current_driver.is_active = true
           AND current_driver.status = 'ACTIVE'
            AND EXISTS (
              SELECT 1
                FROM restaurants current_restaurant
               WHERE current_restaurant.id = current_order.restaurant_id
            )
      )`,
    ))
    .returning({ id: orderDriverAttemptsTable.id });
  if (!claimedAttempt) return;

  try {
    const productRows = await db
      .select({
        itemId: orderItemsTable.id,
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        sizeName: orderItemsTable.sizeName,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
        subtotal: orderItemsTable.subtotal,
      })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));
    const itemIds = productRows.map((product) => product.itemId);
    const itemRows = await db
      .select({
        orderItemId: orderItemAddonsTable.orderItemId,
        addonName: orderItemAddonsTable.addonName,
        price: orderItemAddonsTable.price,
      })
      .from(orderItemAddonsTable)
      .where(
        productRows.length > 0
          ? inArray(orderItemAddonsTable.orderItemId, itemIds)
          : sql`false`,
      );
    const addonsByItem = new Map<number, Array<{ addonName: string; price: string }>>();
    for (const addon of itemRows) {
      const current = addonsByItem.get(addon.orderItemId) ?? [];
      current.push({ addonName: addon.addonName, price: addon.price });
      addonsByItem.set(addon.orderItemId, current);
    }
    const products: DriverPushProduct[] = productRows.map((product) => ({
      productId: product.productId,
      productName: product.productName,
      sizeName: product.sizeName,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      subtotal: product.subtotal,
      selectedAddons: addonsByItem.get(product.itemId) ?? [],
    }));

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
      const error = new Error("No opted-in OneSignal subscription is registered for the assigned driver");
      logger.error(
        { driverId, orderId, assignmentId },
        "Driver push was not sent because the assigned driver has no active OneSignal subscription",
      );
      throw error;
    }

    const typeLabel = order.orderType === "RESERVATION" ? "حجز" : "توصيل";
    const productLabel = products.map((product) => [
      product.productName,
      product.sizeName ? `الحجم: ${product.sizeName}` : null,
      `× ${product.quantity}`,
      product.selectedAddons.length > 0
        ? `الإضافات: ${product.selectedAddons.map((addon) => addon.addonName).join("، ")}`
        : null,
    ].filter(Boolean).join(" — ")).join("، ");
    const messageLines = [
      `الطلب #${order.id}`,
      `مطعم: ${order.restaurantName}`,
      `نوع الطلب: ${typeLabel}`,
      `العميل: ${order.customerName}`,
      `الهاتف: ${order.customerPhone}`,
      `المنتجات: ${productLabel}`,
      `الإجمالي: ${Number(order.totalAmount).toFixed(2)} د.ل`,
    ];
    if (order.orderType === "DELIVERY") {
      if (order.latitude != null && order.longitude != null) {
        messageLines.push(`موقع العميل: ${order.latitude}, ${order.longitude}`);
      }
      if (order.mapsUrl) {
        messageLines.push(`الخريطة: ${order.mapsUrl}`);
      }
    } else if (order.notes) {
      messageLines.push(`بيانات الحجز: ${order.notes}`);
    }
    const message = messageLines.join("\n");
    const deliveryData =
      order.orderType === "DELIVERY" && order.latitude != null && order.longitude != null
        ? {
            latitude: order.latitude,
            longitude: order.longitude,
            ...(order.mapsUrl ? { mapsUrl: order.mapsUrl } : {}),
          }
        : {};
    const notificationData = {
      type: "NEW_DRIVER_ORDER",
      orderId: order.id,
      restaurantId: order.restaurantId,
      assignmentId: attempt.id,
      driverId,
      restaurantName: order.restaurantName,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      orderType: order.orderType,
      products,
      total: order.totalAmount,
      url: driverOrderUrl(order.id),
      ...deliveryData,
      ...(order.orderType === "RESERVATION" && order.notes
        ? { reservationDetails: order.notes }
        : {}),
    };

    // Hold PostgreSQL row locks across the final eligibility check and the
    // external request. This prevents an accept, reject, cancellation,
    // timeout, reassignment, or driver deactivation from committing between
    // the last check and the OneSignal request.
    const client = await pool.connect();
    let notificationId: number | null = null;
    try {
      await client.query("BEGIN");
      const eligible = await client.query(
        `SELECT a.id
           FROM order_driver_attempts a
           JOIN orders o ON o.id = a.order_id
           JOIN drivers d ON d.id = a.driver_id
           JOIN restaurants r ON r.id = a.restaurant_id
          WHERE a.id = $1
            AND a.order_id = $2
            AND a.driver_id = $3
            AND a.status = 'PENDING'
            AND a.notification_status = 'SENDING'
            AND a.timeout_at > NOW()
            AND o.driver_id = a.driver_id
            AND o.restaurant_id = a.restaurant_id
            AND o.status = 'NEW'
            AND o.source = 'PUBLIC_CUSTOMER'
            AND d.restaurant_id = a.restaurant_id
            AND d.is_active = true
            AND d.status = 'ACTIVE'
          FOR UPDATE OF a, o, d`,
        [attempt.id, orderId, driverId],
      );
      if (eligible.rowCount !== 1) {
        await client.query(
          `UPDATE order_driver_attempts
              SET notification_status = 'SKIPPED',
                  notification_error = $2
            WHERE id = $1
              AND notification_status = 'SENDING'`,
          [attempt.id, "Order eligibility changed before OneSignal send"],
        );
        await client.query("COMMIT");
        logger.info(
          { driverId, orderId, assignmentId: attempt.id },
          "Driver OneSignal notification skipped after final eligibility check",
        );
        return;
      }

      const result = await sendOneSignalNotification({
        driverId,
        orderId: order.id,
        restaurantId: order.restaurantId,
        assignmentId: attempt.id,
        title: "🚨 طلب جديد",
        message,
        url: driverOrderUrl(order.id),
        subscriptionIds,
        data: notificationData,
      });

      const notification = await client.query<{ id: number }>(
        `INSERT INTO notifications
          (type, message, driver_id, restaurant_id, order_id, related_id, related_type)
         VALUES ($1, $2, $3, $4, $5, $5, $6)
         RETURNING id`,
        ["NEW_DRIVER_ORDER", message, driverId, order.restaurantId, order.id, "order"],
      );
      notificationId = notification.rows[0]?.id ?? null;

      await client.query(
        `UPDATE order_driver_attempts
            SET notification_status = 'SENT',
                notification_sent_at = NOW(),
                notification_response_status = $2,
                notification_response = $3
          WHERE id = $1
            AND notification_status = 'SENDING'`,
        [attempt.id, result.status, result.responseText],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    publishDriverEvent(driverId, {
      type: "NEW_DRIVER_ORDER",
      notificationId,
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