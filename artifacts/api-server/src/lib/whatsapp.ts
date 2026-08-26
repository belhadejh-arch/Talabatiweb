import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, settingsTable } from "@workspace/db";
import { logger } from "./logger";

const WHATSAPP_CONNECTOR = "whatsapp-business";
const GRAPH_API_VERSION = "v23.0";

interface WhatsAppMessagePayload {
  restaurantName: string;
  orderId: number;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string;
  driverPhone: string;
}

/** True when running inside a Replit environment (dev workspace or a Replit deployment). */
function isReplitRuntime(): boolean {
  return !!(process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);
}

/** Reads a directly configured long-lived WhatsApp Cloud API token, if any. */
function getDirectToken(): string | undefined {
  return process.env.WhatsApp_API_Secret || process.env.WHATSAPP_API_KEY || undefined;
}

/**
 * Sends a WhatsApp Cloud API request.
 *
 * When a directly configured token is present (WhatsApp_API_Secret), it is
 * always preferred — this lets the platform owner bypass a misbehaving
 * Replit connector by supplying their own long-lived Meta token. Otherwise,
 * inside Replit, requests go through the connected WhatsApp Business
 * connector (no secret ever touches this codebase). Outside Replit (e.g. a
 * backend deployed to Render) with no direct token configured, sending fails
 * with a clear error.
 */
async function callWhatsAppApi(phoneNumberId: string, body: unknown): Promise<Response> {
  const path = `/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const token = getDirectToken();
  if (token) {
    return fetch(`https://graph.facebook.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (isReplitRuntime()) {
    const connectors = new ReplitConnectors();
    return connectors.proxy(WHATSAPP_CONNECTOR, path, { method: "POST", body });
  }

  throw new Error(
    "WhatsApp is not configured for this runtime: no Replit connector available and no direct API token (WhatsApp_API_Secret) is set",
  );
}

export async function sendWhatsAppToDriver(payload: WhatsAppMessagePayload): Promise<boolean> {
  const [settings] = await db.select().from(settingsTable);

  if (!settings?.whatsappEnabled) {
    logger.warn("WhatsApp is disabled in settings — skipping message send");
    return false;
  }

  const phoneNumberId = settings.whatsappPhoneId;
  if (!phoneNumberId) {
    logger.warn("WhatsApp phone number ID is not configured — skipping message send");
    return false;
  }

  const message = `🚨 طلب توصيل جديد
🏪 المطعم: ${payload.restaurantName}
📦 الطلب: #${payload.orderId}
👤 العميل: ${payload.customerName}
📞 الهاتف: ${payload.customerPhone}
🍔 الطلب: ${payload.items}
💰 الإجمالي: ${payload.total}
📍 موقع العميل: ${payload.mapsUrl}`;

  try {
    const response = await callWhatsAppApi(phoneNumberId, {
      messaging_product: "whatsapp",
      to: payload.driverPhone,
      type: "text",
      text: { body: message },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      logger.error({ status: response.status, errorBody }, "WhatsApp API error");
      return false;
    }

    logger.info({ orderId: payload.orderId }, "WhatsApp message sent to driver");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send WhatsApp message");
    return false;
  }
}
