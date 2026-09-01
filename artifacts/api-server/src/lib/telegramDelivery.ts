import { pool } from "@workspace/db";
import { db, driversTable, ordersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendTelegramToDriver, type TelegramSendResult } from "./telegram";
import { sendWhatsAppToDriver, type WhatsAppSendResult } from "./whatsapp";

const TABLE_NAME = "delivery_message_logs";

export type DeliveryChannel = "TELEGRAM" | "WHATSAPP";

export type DriverDeliveryPayload = {
  restaurantName: string;
  restaurantId: number;
  orderId: number;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string;
  driverPhone: string;
  telegramChatId: string | null;
};

let schemaReady: Promise<void> | null = null;

/**
 * Keeps the Telegram column and delivery log table available on both the
 * existing Render database and Replit's database without a manual migration.
 */
export async function ensureTelegramSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(`
        ALTER TABLE drivers
          ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

        ALTER TABLE drivers
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

        UPDATE drivers
          SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END;

        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS telegram_contacts (
          chat_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          username TEXT,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }

  await schemaReady;
}

async function logDeliveryResult(
  orderId: number,
  driverId: number,
  channel: DeliveryChannel,
  result: TelegramSendResult | WhatsAppSendResult,
): Promise<void> {
  await ensureTelegramSchema();
  await pool.query(
    `
      INSERT INTO ${TABLE_NAME} (order_id, driver_id, channel, status, error_message, sent_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    [orderId, driverId, channel, result.success ? "SENT" : "FAILED", result.errorMessage || null],
  );
}

export async function notifyDriverOnAllChannels(
  driver: { id: number; restaurantId: number; phone: string; telegramChatId: string | null; isActive: boolean; status: string },
  payload: Omit<DriverDeliveryPayload, "driverPhone" | "telegramChatId">,
): Promise<void> {
  const [currentDriver] = await db.select().from(driversTable).where(eq(driversTable.id, driver.id));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, payload.orderId));
  const eligible =
    currentDriver &&
    order &&
    currentDriver.restaurantId === order.restaurantId &&
    order.restaurantId === payload.restaurantId &&
    order.driverId === currentDriver.id &&
    currentDriver.isActive &&
    currentDriver.status === "ACTIVE";

  if (!eligible) {
    const result = {
      success: false,
      errorMessage: "Driver is not ACTIVE or is not assigned within the order restaurant",
    };
    await Promise.all([
      logDeliveryResult(payload.orderId, driver.id, "TELEGRAM", result),
      logDeliveryResult(payload.orderId, driver.id, "WHATSAPP", result),
    ]);
    return;
  }

  const [telegramResult, whatsappResult] = await Promise.all([
    sendTelegramToDriver({
      ...payload,
      // Use the freshly-read database record. A driver may have completed a
      // new deep-link pairing after the order was selected.
      telegramChatId: currentDriver.telegramChatId,
    }),
    sendWhatsAppToDriver({
      ...payload,
      driverPhone: driver.phone,
    }),
  ]);

  await Promise.all([
    logDeliveryResult(payload.orderId, driver.id, "TELEGRAM", telegramResult),
    logDeliveryResult(payload.orderId, driver.id, "WHATSAPP", whatsappResult),
  ]);
}

export async function safeNotifyDriverOnAllChannels(
  driver: { id: number; restaurantId: number; phone: string; telegramChatId: string | null; isActive: boolean; status: string },
  payload: Omit<DriverDeliveryPayload, "driverPhone" | "telegramChatId">,
): Promise<void> {
  try {
    await notifyDriverOnAllChannels(driver, payload);
  } catch (error) {
    logger.error({ err: error, orderId: payload.orderId, driverId: driver.id }, "Failed to record delivery channel results");
  }
}