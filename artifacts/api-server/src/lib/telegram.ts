import { logger } from "./logger";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export type TelegramSendResult = {
  success: boolean;
  errorMessage?: string;
};

export type TelegramOrderPayload = {
  restaurantName: string;
  orderId: number;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string;
  telegramChatId: string | null;
};

function getBotToken(): string | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || undefined;
}

function apiUrl(token: string, method: string): string {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

async function readTelegramError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { description?: string } | null;
  return body?.description || `Telegram API returned HTTP ${response.status}`;
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

  const message = `🚨 طلب توصيل جديد

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
    const response = await fetch(apiUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const errorMessage = await readTelegramError(response);
      logger.error({ orderId: payload.orderId, status: response.status, errorMessage }, "Telegram API error");
      return { success: false, errorMessage };
    }

    const body = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!body?.ok) {
      const errorMessage = body?.description || "Telegram API rejected the message";
      logger.error({ orderId: payload.orderId, errorMessage }, "Telegram message was rejected");
      return { success: false, errorMessage };
    }

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
}>> {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(apiUrl(token, "getUpdates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 50, allowed_updates: ["message"] }),
  });
  const body = await response.json().catch(() => null) as {
    ok?: boolean;
    result?: Array<{ message?: { chat?: { id: number; title?: string; username?: string; first_name?: string; last_name?: string } } }>;
    description?: string;
  } | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.description || `Telegram API returned HTTP ${response.status}`);
  }

  const chats = new Map<string, { chatId: string; title: string; username: string | null }>();
  for (const update of body.result || []) {
    const chat = update.message?.chat;
    if (!chat) continue;
    const title = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || chat.id.toString();
    chats.set(String(chat.id), {
      chatId: String(chat.id),
      title,
      username: chat.username ? `@${chat.username}` : null,
    });
  }

  return Array.from(chats.values()).reverse();
}