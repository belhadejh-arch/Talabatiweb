import { logger } from "./logger";

const DEFAULT_API_URL = "https://backendapi.wpsenderx.com/api";

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

type WpSenderConfig = {
  apiKey: string;
  apiUrl: string;
  sessionId: string | null;
};

function getConfig(): WpSenderConfig | null {
  const apiKey = process.env.WP_SENDER_API_KEY?.trim();
  const apiUrl = process.env.WP_SENDER_API_URL?.trim()?.replace(/\/+$/, "");
  const sessionId = process.env.WP_SENDER_SESSION_ID?.trim() || null;
  return apiKey && apiUrl ? { apiKey, apiUrl, sessionId } : null;
}

export function isWpSenderConfigured(requireSession = false): boolean {
  const config = getConfig();
  return Boolean(config && (!requireSession || config.sessionId));
}

export function getWpSenderConfigStatus(): {
  apiKeyConfigured: boolean;
  apiUrlConfigured: boolean;
  sessionIdConfigured: boolean;
  apiUrl: string;
  sessionId: string | null;
} {
  const config = getConfig();
  return {
    apiKeyConfigured: Boolean(config?.apiKey),
    apiUrlConfigured: Boolean(process.env.WP_SENDER_API_URL?.trim()),
    sessionIdConfigured: Boolean(config?.sessionId),
    apiUrl: config?.apiUrl || DEFAULT_API_URL,
    sessionId: config?.sessionId || null,
  };
}

function normalizePhone(value: string): string {
  return value.trim().replace(/[^\d]/g, "");
}

function buildOrderMessage(payload: WhatsAppMessagePayload): string {
  const lines = [
    payload.orderType === "RESERVATION" ? "🚨 حجز طلب جديد" : "🚨 طلب توصيل جديد",
    "",
    `🏪 المطعم: ${payload.restaurantName}`,
    `📦 رقم الطلب: #${payload.orderId}`,
    `👤 العميل: ${payload.customerName}`,
    `📞 الهاتف: ${payload.customerPhone}`,
    "",
    "🍔 الطلب:",
    payload.items,
    "",
    `💰 الإجمالي: ${payload.total}`,
  ];

  if (payload.orderType === "DELIVERY" && payload.mapsUrl) {
    lines.push("", `📍 موقع العميل: ${payload.mapsUrl}`);
  } else if (payload.orderType === "RESERVATION") {
    lines.push("", "🏪 نوع الطلب: حجز");
  }

  lines.push("", `للرد: اكتب قبول #${payload.orderId} أو رفض #${payload.orderId}`);
  return lines.join("\n");
}

async function wpSenderRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("WP Sender is not configured: set WP_SENDER_API_KEY");

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "X-API-Key": config.apiKey,
      ...(init.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(detail || `WP Sender returned HTTP ${response.status}`);
  }

  return body as T;
}

export async function sendWhatsAppToDriver(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const phone = normalizePhone(payload.driverPhone);

  if (!config) {
    return { success: false, errorMessage: "WP Sender is not configured: set WP_SENDER_API_KEY" };
  }
  if (!config.sessionId) {
    return { success: false, errorMessage: "WP Sender session is not configured: set WP_SENDER_SESSION_ID" };
  }
  if (!phone) {
    return { success: false, errorMessage: "Driver WhatsApp number is not configured" };
  }

  try {
    await wpSenderRequest("/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: phone,
        message: buildOrderMessage(payload),
        contentType: "string",
        sender_number: config.sessionId,
      }),
    });
    logger.info({ orderId: payload.orderId, driverPhone: phone }, "WP Sender message sent to driver");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown WP Sender error";
    logger.error({ err: error, orderId: payload.orderId }, "Failed to send WP Sender message");
    return { success: false, errorMessage };
  }
}

export function normalizeWhatsAppNumber(value: string): string {
  return normalizePhone(value);
}

export async function listWpSenderSessions(): Promise<unknown> {
  return wpSenderRequest("/whatsapp-session/list");
}

export async function createWpSenderSession(): Promise<unknown> {
  return wpSenderRequest("/whatsapp-session/create", { method: "POST" });
}

export async function getWpSenderSessionStatus(sessionId: string): Promise<unknown> {
  return wpSenderRequest(`/whatsapp-session/${encodeURIComponent(sessionId)}/status`);
}

export async function getWpSenderSessionDetails(sessionId: string): Promise<unknown> {
  return wpSenderRequest(`/whatsapp-session/${encodeURIComponent(sessionId)}/details`);
}

export async function reconnectWpSenderSession(sessionId: string): Promise<unknown> {
  return wpSenderRequest(`/whatsapp-session/${encodeURIComponent(sessionId)}/reconnect`, { method: "POST" });
}

export async function setWpSenderWebhook(sessionId: string, webhookUrl: string): Promise<unknown> {
  return wpSenderRequest("/whatsapp-session/webhook-url/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, webhookUrl }),
  });
}

export async function requestWpSenderPairingCode(sessionId: string, phoneNumber: string): Promise<unknown> {
  return wpSenderRequest(`/whatsapp-session/${encodeURIComponent(sessionId)}/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: normalizePhone(phoneNumber) }),
  });
}

export async function getWpSenderQr(sessionId: string, output: "image" | "base64" | "raw" = "base64"): Promise<{
  contentType: string;
  body: Buffer | string;
}> {
  const config = getConfig();
  if (!config) throw new Error("WP Sender is not configured: set WP_SENDER_API_KEY");

  const response = await fetch(
    `${config.apiUrl}/whatsapp-session/${encodeURIComponent(sessionId)}/qr?output=${output}`,
    { headers: { "X-API-Key": config.apiKey } },
  );
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `WP Sender returned HTTP ${response.status}`);
  }
  return {
    contentType,
    body: contentType.includes("image/") ? Buffer.from(await response.arrayBuffer()) : await response.text(),
  };
}

export type WpSenderWebhookMessage = {
  from: string;
  text: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function parseWpSenderWebhookMessage(body: unknown): WpSenderWebhookMessage | null {
  const root = asRecord(body);
  const data = asRecord(root.data);
  const message = asRecord(data.message ?? root.message);
  const from = firstString(
    data.from,
    data.sender,
    data.fromNumber,
    message.from,
    message.sender,
    root.from,
    root.sender,
    root.fromNumber,
  );
  const text = firstString(
    data.text,
    data.body,
    message.text,
    message.body,
    root.text,
    root.body,
  );
  if (!from || !text) return null;
  return { from: normalizePhone(from), text };
}

export function parseDriverOrderResponse(text: string): { orderId: number; response: "ACCEPTED" | "REJECTED" } | null {
  const normalized = text.trim().toLowerCase();
  const accepted = /(?:قبول|موافق|accept|accepted|yes|نعم)/i.test(normalized);
  const rejected = /(?:رفض|رافض|reject|rejected|no|لا)/i.test(normalized);
  const match = normalized.match(/#?\s*(\d{1,12})\b/);
  if ((!accepted && !rejected) || !match || accepted === rejected) return null;
  return { orderId: Number(match[1]), response: accepted ? "ACCEPTED" : "REJECTED" };
}