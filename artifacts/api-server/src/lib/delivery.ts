import { pool, db, driversTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendWhatsAppToDriver, type WhatsAppSendResult } from "./wpSender";

const TABLE_NAME = "delivery_message_logs";

export type DriverDeliveryPayload = {
  restaurantName: string;
  restaurantId: number;
  orderId: number;
  orderType: string;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string | null;
};

let schemaReady: Promise<void> | null = null;

export async function ensureDeliverySchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(`
        ALTER TABLE drivers
          ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

        ALTER TABLE drivers
          ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

        ALTER TABLE drivers
          ALTER COLUMN is_active SET DEFAULT false;

        ALTER TABLE drivers
          ALTER COLUMN status SET DEFAULT 'INACTIVE';

        ALTER TABLE settings
          ADD COLUMN IF NOT EXISTS driver_response_timeout_seconds INTEGER NOT NULL DEFAULT 180;

        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
          channel TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          response_at TIMESTAMPTZ
        );

        ALTER TABLE ${TABLE_NAME}
          ADD COLUMN IF NOT EXISTS response_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS order_driver_attempts (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'PENDING',
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          response_at TIMESTAMPTZ,
          timeout_at TIMESTAMPTZ NOT NULL
        );

        ALTER TABLE order_driver_attempts
          ADD COLUMN IF NOT EXISTS response_at TIMESTAMPTZ;

        CREATE UNIQUE INDEX IF NOT EXISTS order_driver_attempt_order_driver_idx
          ON order_driver_attempts(order_id, driver_id);
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
  result: WhatsAppSendResult,
): Promise<void> {
  await ensureDeliverySchema();
  await pool.query(
    `
      INSERT INTO ${TABLE_NAME} (order_id, driver_id, channel, status, error_message, sent_at, response_at)
      VALUES ($1, $2, 'WHATSAPP', $3, $4, NOW(), NULL)
    `,
    [orderId, driverId, result.success ? "SENT" : "FAILED", result.errorMessage || null],
  );
}

export async function notifyDriver(
  driver: { id: number; restaurantId: number; whatsappNumber: string | null; isActive: boolean; status: string },
  payload: DriverDeliveryPayload,
): Promise<WhatsAppSendResult> {
  const [currentDriver] = await db.select().from(driversTable).where(eq(driversTable.id, driver.id));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, payload.orderId));
  const eligible = Boolean(
    currentDriver &&
    order &&
    currentDriver.restaurantId === order.restaurantId &&
    order.restaurantId === payload.restaurantId &&
    order.driverId === currentDriver.id &&
    currentDriver.isActive &&
    currentDriver.status === "ACTIVE" &&
    currentDriver.whatsappNumber?.trim(),
  );

  const result = eligible && currentDriver?.whatsappNumber
    ? await sendWhatsAppToDriver({ ...payload, driverPhone: currentDriver.whatsappNumber })
    : { success: false, errorMessage: "Driver is not ACTIVE or is not assigned within the order restaurant" };

  await logDeliveryResult(payload.orderId, driver.id, result);
  return result;
}

export async function safeNotifyDriver(
  driver: { id: number; restaurantId: number; whatsappNumber: string | null; isActive: boolean; status: string },
  payload: DriverDeliveryPayload,
): Promise<WhatsAppSendResult | null> {
  try {
    return await notifyDriver(driver, payload);
  } catch (error) {
    logger.error({ err: error, orderId: payload.orderId, driverId: driver.id }, "Failed to record WP Sender delivery result");
    return null;
  }
}