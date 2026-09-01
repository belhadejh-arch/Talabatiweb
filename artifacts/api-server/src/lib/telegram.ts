import { pool } from "@workspace/db";
import { logger } from "./logger";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export type TelegramSendResult = {
  success: boolean;
  errorMessage?: string;
};

export type TelegramOrderPayload = {
  restaurantName: string;
  orderId: number;
  orderType: string;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string | null;
  telegramChatId: string | null;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: TelegramChat;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; first_name?: string; last_name?: string; username?: string };
    message?: { message_id: number; chat: TelegramChat; text?: string };
  };
};

export type TelegramInlineKeyboard = Array<Array<{
  text: string;
  callback_data?: string;
  url?: string;
}>>;

function getBotToken(): string | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || undefined;
}

function apiUrl(token: string, method: string): string {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

async function telegramRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(apiUrl(token, method), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.description || `Telegram API returned HTTP ${response.status}`);
  }
  return result.result as T;
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: { keyboard?: Array<Array<{ text: string }>>; inline_keyboard?: TelegramInlineKeyboard; resize_keyboard?: boolean; is_persistent?: boolean },
): Promise<void> {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function editTelegramMessageText(chatId: string | number, messageId: number, text: string): Promise<void> {
  await telegramRequest("editMessageText", { chat_id: chatId, message_id: messageId, text });
}

export async function getTelegramUpdates(offset: number, timeout = 25): Promise<TelegramUpdate[]> {
  return telegramRequest<TelegramUpdate[]>("getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message", "callback_query"],
  });
}

export async function setTelegramCommands(): Promise<void> {
  await telegramRequest("setMyCommands", {
    commands: [
      { command: "start", description: "ربط الحساب أو فتح القائمة" },
      { command: "orders", description: "عرض طلباتي" },
      { command: "account", description: "عرض حسابي" },
    ],
  });
}

/**
 * Sends the delivery message from the API server only. The bot token is read
 * from Replit Secrets and is never returned to the client or logged.
 */
export async function sendTelegramToDriver(payload: TelegramOrderPayload): Promise<TelegramSendResult> {
  const chatId = payload.telegramChatId?.trim();
  if (!chatId) {
    return { success: false, errorMessage: "Telegram Chat ID is not configured for this driver" };
  }

  const token = getBotToken();
  if (!token) {
    return { success: false, errorMessage: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  const message = payload.orderType === "RESERVATION"
    ? `🏪 حجز طلب جديد

🏪 المطعم: ${payload.restaurantName}
📦 الطلب: #${payload.orderId}
👤 الزبون: ${payload.customerName}
📞 الهاتف: ${payload.customerPhone}

🍔 الطلب:
${payload.items}

💰 الإجمالي:
${payload.total}

نوع الطلب:
🏪 حجز`
    : `🚨 طلب توصيل جديد

🏪 المطعم: ${payload.restaurantName}
📦 الطلب: #${payload.orderId}
👤 العميل: ${payload.customerName}
📞 الهاتف: ${payload.customerPhone}

🍔 الطلب:
${payload.items}

💰 الإجمالي:
${payload.total}

📍 موقع العميل:
${payload.mapsUrl}`;
  try {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ قبول الطلب", callback_data: `order_accept:${payload.orderId}` },
            { text: "❌ رفض الطلب", callback_data: `order_reject:${payload.orderId}` },
          ],
          ...(payload.orderType === "DELIVERY" && payload.mapsUrl
            ? [[{ text: "📍 فتح الموقع", url: payload.mapsUrl }]]
            : []),
        ],
      },
    });
    logger.info({ orderId: payload.orderId }, "Telegram message sent to driver");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Telegram error";
    logger.error({ err: error, orderId: payload.orderId }, "Failed to send Telegram message");
    return { success: false, errorMessage };
  }
}

export async function getTelegramBotStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  bot?: { id: number; username: string | null; firstName: string };
  error?: string;
}> {
  const token = getBotToken();
  if (!token) return { configured: false, connected: false, error: "TELEGRAM_BOT_TOKEN is not configured" };

  try {
    const response = await fetch(apiUrl(token, "getMe"));
    const body = await response.json().catch(() => null) as {
      ok?: boolean;
      result?: { id: number; username?: string; first_name: string };
      description?: string;
    } | null;

    if (!response.ok || !body?.ok || !body.result) {
      return {
        configured: true,
        connected: false,
        error: body?.description || `Telegram API returned HTTP ${response.status}`,
      };
    }

    return {
      configured: true,
      connected: true,
      bot: {
        id: body.result.id,
        username: body.result.username || null,
        firstName: body.result.first_name,
      },
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "Telegram connection failed",
    };
  }
}

export async function getTelegramRecentChats(): Promise<Array<{
  chatId: string;
  title: string;
  username: string | null;
  linkedDriverId: number | null;
  linkedDriverName: string | null;
  linkedDriverCount: number;
}>> {
  const result = await pool.query<{
    chatId: string;
    title: string;
    username: string | null;
    linkedDriverId: number | null;
    linkedDriverName: string | null;
    linkedDriverCount: number;
  }>(`
    SELECT
      c.chat_id AS "chatId",
      c.title,
      c.username,
      d.id AS "linkedDriverId",
      d.name AS "linkedDriverName",
      COALESCE(d.linked_driver_count, 0)::int AS "linkedDriverCount"
    FROM telegram_contacts c
    LEFT JOIN LATERAL (
      SELECT
        d0.id,
        d0.name,
        COUNT(*) OVER () AS linked_driver_count
      FROM drivers d0
      WHERE d0.telegram_chat_id = c.chat_id
      ORDER BY d0.id ASC
      LIMIT 1
    ) d ON true
    ORDER BY c.last_seen_at DESC
    LIMIT 50
  `);
  return result.rows;
}