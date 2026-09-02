import { logger } from "./logger";

const WAPI_SENDER_BASE_URL = "https://api.wapisender.com";

export type WhatsAppMessagePayload = {
  restaurantName: string;
  orderId: number;
  orderType: string;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string | null;
  driverPhone: string;
};

export type WhatsAppSendResult = {
  success: boolean;
  errorMessage?: string;
};

function getConfig(): { apiKey: string; instance: string } | null {
  const apiKey = process.env.WAPI_SENDER_API_KEY?.trim();
  const instance = process.env.WAPI_SENDER_INSTANCE?.trim();
  return apiKey && instance ? { apiKey, instance } : null;
}

function normalizePhone(value: string): string {
  return value.trim().replace(/[^\d]/g, "");
}

function buildOrderMessage(payload: WhatsAppMessagePayload): string {
  const lines = [
    payload.orderType === "RESERVATION" ? "🏪 حجز طلب جديد" : "🚨 طلب توصيل جديد",
    "",
    `🏪 المطعم: ${payload.restaurantName}`,
    `📦 رقم الطلب: #${payload.orderId}`,
    `👤 اسم العميل: ${payload.customerName}`,
    `📞 رقم العميل: ${payload.customerPhone}`,
    "",
    "🍔 المنتجات والكميات:",
    payload.items,
    "",
    `💰 الإجمالي: ${payload.total}`,
    `نوع الطلب: ${payload.orderType === "RESERVATION" ? "حجز" : "توصيل"}`,
    "",
    `للرد: اكتب قبول #${payload.orderId} أو رفض #${payload.orderId}`,
  ];

  if (payload.orderType === "DELIVERY" && payload.mapsUrl) {
    lines.splice(lines.length - 2, 0, `📍 موقع العميل: ${payload.mapsUrl}`);
  }

  return lines.join("\n");
}

/**
 * Sends through WapiSender's documented direct API:
 * POST /message/sendText/{instance}, payload { number, text }.
 * The API key is read only by the backend from Replit Secrets.
 */
export async function sendWhatsAppToDriver(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const phone = normalizePhone(payload.driverPhone);

  if (!config) {
    return { success: false, errorMessage: "WapiSender is not configured: set WAPI_SENDER_API_KEY and WAPI_SENDER_INSTANCE" };
  }
  if (!phone) {
    return { success: false, errorMessage: "Driver WhatsApp number is not configured" };
  }

  try {
    const response = await fetch(
      `${WAPI_SENDER_BASE_URL}/message/sendText/${encodeURIComponent(config.instance)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: phone,
          text: buildOrderMessage(payload),
        }),
      },
    );

    const responseBody = await response.text().catch(() => "");
    if (!response.ok) {
      logger.error({ status: response.status, responseBody, orderId: payload.orderId }, "WapiSender API error");
      return { success: false, errorMessage: responseBody || `WapiSender returned HTTP ${response.status}` };
    }

    logger.info({ orderId: payload.orderId, driverPhone: phone }, "WapiSender message sent to driver");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown WapiSender error";
    logger.error({ err: error, orderId: payload.orderId }, "Failed to send WapiSender message");
    return { success: false, errorMessage };
  }
}

export type WapiWebhookMessage = {
  from: string;
  text: string;
  messageId?: string;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findFirstString(values: unknown[]): string | null {
  for (const value of values) {
    const result = stringValue(value);
    if (result) return result;
  }
  return null;
}

/**
 * Accepts the common Wapi/Evolution-style inbound webhook shapes while
 * ignoring status events and messages that cannot be tied to an order.
 */
export function parseWapiWebhookMessage(body: unknown): WapiWebhookMessage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const message = data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : data;
  const key = message.key && typeof message.key === "object" ? message.key as Record<string, unknown> : {};
  const textNode = message.message && typeof message.message === "object"
    ? message.message as Record<string, unknown>
    : message;

  const from = findFirstString([
    key.remoteJid,
    message.from,
    data.from,
    root.from,
  ])?.replace(/@s\.whatsapp\.net$/, "");
  const text = findFirstString([
    textNode.conversation,
    (textNode.extendedTextMessage as Record<string, unknown> | undefined)?.text,
    message.text,
    data.text,
    root.text,
  ]);

  if (!from || !text || from === "status") return null;
  return {
    from: normalizePhone(from),
    text,
    messageId: findFirstString([key.id, message.id, data.messageId, root.messageId]) ?? undefined,
  };
}

export function parseDriverOrderResponse(text: string): { orderId: number; response: "ACCEPTED" | "REJECTED" } | null {
  const normalized = text.trim().toLowerCase();
  const accepted = /(?:قبول|موافق|accept|accepted|yes|نعم)/i.test(normalized);
  const rejected = /(?:رفض|رافض|reject|rejected|no|لا)/i.test(normalized);
  const match = normalized.match(/#?\s*(\d{1,12})\b/);
  if ((!accepted && !rejected) || !match || accepted === rejected) return null;
  return { orderId: Number(match[1]), response: accepted ? "ACCEPTED" : "REJECTED" };
}