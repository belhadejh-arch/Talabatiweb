import { pool } from "@workspace/db";
import { logger } from "./logger";
import { sendTelegramToDriver, type TelegramSendResult } from "./telegram";
import { sendWhatsAppToDriver, type WhatsAppSendResult } from "./whatsapp";

const TABLE_NAME = "delivery_message_logs";

export type DeliveryChannel = "TELEGRAM" | "WHATSAPP";

export type DriverDeliveryPayload = {
  restaurantName: string;
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

        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  driver: { id: number; phone: string; telegramChatId: string | null },
  payload: Omit<DriverDeliveryPayload, "driverPhone" | "telegramChatId">,
): Promise<void> {
  const [telegramResult, whatsappResult] = await Promise.all([
    sendTelegramToDriver({
      ...payload,
      telegramChatId: driver.telegramChatId,
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
  driver: { id: number; phone: string; telegramChatId: string | null },
  payload: Omit<DriverDeliveryPayload, "driverPhone" | "telegramChatId">,
): Promise<void> {
  try {
    await notifyDriverOnAllChannels(driver, payload);
  } catch (error) {
    logger.error({ err: error, orderId: payload.orderId, driverId: driver.id }, "Failed to record delivery channel results");
  }
}