import {
  db,
  pool,
  driversTable,
  ordersTable,
  orderItemsTable,
  orderStatusHistoryTable,
  restaurantsTable,
  telegramContactsTable,
} from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { logger } from "./logger";
import { ensureTelegramSchema } from "./telegramDelivery";
import { dispatchPendingOrdersForRestaurant, respondToOrderAttempt } from "./driverDispatch";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  getTelegramBotStatus,
  getTelegramUpdates,
  sendTelegramMessage,
  setTelegramCommands,
  type TelegramChat,
  type TelegramUpdate,
} from "./telegram";

const ACTIVE = "ACTIVE";
const INACTIVE = "INACTIVE";
const START_LINK_PREFIX = "driver_";
// One Telegram getUpdates consumer per database. This protects against the
// Replit preview and a second API process polling the same bot concurrently.
const TELEGRAM_POLL_LOCK_KEY = 71420391;

const driverKeyboard = {
  keyboard: [
    [{ text: "🟢 تفعيل نشاطي" }, { text: "🔴 إيقاف نشاطي" }],
    [{ text: "📦 طلباتي" }, { text: "👤 حسابي" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

let pollingPromise: Promise<void> | null = null;
let nextUpdateOffset = 0;

function chatId(chat: TelegramChat): string {
  return String(chat.id);
}

function chatTitle(chat: TelegramChat): string {
  return chat.title
    || [chat.first_name, chat.last_name].filter(Boolean).join(" ")
    || chat.username
    || String(chat.id);
}

async function rememberChat(chat: TelegramChat): Promise<void> {
  const id = chatId(chat);
  await db
    .insert(telegramContactsTable)
    .values({
      chatId: id,
      title: chatTitle(chat),
      username: chat.username ? `@${chat.username}` : null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramContactsTable.chatId,
      set: {
        title: chatTitle(chat),
        username: chat.username ? `@${chat.username}` : null,
        lastSeenAt: new Date(),
      },
    });
}

async function driverForChat(id: string) {
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.telegramChatId, id))
    .limit(1);
  return driver;
}

async function sendMenu(id: string, prefix = "اختر العملية المطلوبة:"): Promise<void> {
  await sendTelegramMessage(id, prefix, driverKeyboard);
}

async function linkDriver(id: string, parameter: string | undefined): Promise<boolean> {
  if (!parameter || !parameter.startsWith(START_LINK_PREFIX)) return false;
  const driverId = Number(parameter.slice(START_LINK_PREFIX.length));
  if (!Number.isInteger(driverId) || driverId <= 0) {
    await sendTelegramMessage(id, "رابط الربط غير صالح. اطلب رابطك من إدارة المطعم.");
    return true;
  }

  const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, driverId));
  if (!driver) {
    await sendTelegramMessage(id, "لم يتم العثور على سجل السائق. اطلب رابطًا جديدًا من الإدارة.");
    return true;
  }

  const [alreadyLinked] = await db
    .select({ id: driversTable.id, name: driversTable.name })
    .from(driversTable)
    .where(and(eq(driversTable.telegramChatId, id), ne(driversTable.id, driverId)))
    .limit(1);
  if (alreadyLinked) {
    await sendTelegramMessage(id, `هذا الحساب مرتبط بالسائق "${alreadyLinked.name}". لا يمكن ربطه بسائق آخر تلقائيًا.`);
    return true;
  }

  await db
    .update(driversTable)
    .set({ telegramChatId: id })
    .where(eq(driversTable.id, driverId));

  await sendMenu(id, `تم ربط حساب Telegram بالسائق "${driver.name}" بنجاح.\nحالتك الحالية: ${driver.status || (driver.isActive ? ACTIVE : INACTIVE)}`);
  return true;
}

async function setDriverActivity(id: string, active: boolean): Promise<void> {
  const driver = await driverForChat(id);
  if (!driver) {
    await sendTelegramMessage(id, "لم يتم ربط هذا الحساب بسائق. استخدم رابط الربط الخاص بك أولًا.");
    return;
  }

  await db
    .update(driversTable)
    .set({ isActive: active, status: active ? ACTIVE : INACTIVE })
    .where(eq(driversTable.id, driver.id));

  if (active) {
    await dispatchPendingOrdersForRestaurant(driver.restaurantId);
  }

  await sendMenu(id, active
    ? "🟢 تم تفعيل نشاطك. ستستقبل الطلبات الجديدة الخاصة بمطعمك."
    : "🔴 تم إيقاف نشاطك. لن تستقبل طلبات جديدة حتى تعيد التفعيل.");
}

async function showAccount(id: string): Promise<void> {
  const driver = await driverForChat(id);
  if (!driver) {
    await sendTelegramMessage(id, "لم يتم ربط هذا الحساب بسائق. استخدم رابط الربط الخاص بك أولًا.");
    return;
  }
  const [restaurant] = await db
    .select({ name: restaurantsTable.name })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, driver.restaurantId));
  const status = driver.status || (driver.isActive ? ACTIVE : INACTIVE);
  await sendMenu(id, `👤 حسابي

الاسم: ${driver.name}
الهاتف: ${driver.phone}
المطعم: ${restaurant?.name || "غير معروف"}
الحالة: ${status}
إجمالي التوصيلات: ${driver.totalDeliveries}`);
}

async function showOrders(id: string): Promise<void> {
  const driver = await driverForChat(id);
  if (!driver) {
    await sendTelegramMessage(id, "لم يتم ربط هذا الحساب بسائق. استخدم رابط الربط الخاص بك أولًا.");
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.driverId, driver.id), eq(ordersTable.restaurantId, driver.restaurantId)))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  if (orders.length === 0) {
    await sendMenu(id, "📦 لا توجد طلبات مسندة إليك حاليًا.");
    return;
  }

  const blocks = [];
  for (const order of orders) {
    const items = await db
      .select({ name: orderItemsTable.productName, quantity: orderItemsTable.quantity })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));
    blocks.push(`#${order.id} — ${order.status}
العميل: ${order.customerName}
الهاتف: ${order.customerPhone}
المنتجات: ${items.map((item) => `${item.name} x${item.quantity}`).join("، ") || "—"}
الإجمالي: ${order.totalAmount} د.ل`);
  }

  await sendMenu(id, `📦 طلباتي\n\n${blocks.join("\n\n")}`);
}

async function handleMessage(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.chat) return;

  const id = chatId(message.chat);
  await rememberChat(message.chat);
  const text = message.text?.trim() || "";

  if (text.startsWith("/start")) {
    const parameter = text.slice("/start".length).trim().split(/\s+/)[0] || undefined;
    const linked = await linkDriver(id, parameter);
    if (linked) return;
    const driver = await driverForChat(id);
    if (driver) {
      await sendMenu(id, "مرحبًا بعودتك. اختر العملية المطلوبة:");
    } else {
      await sendTelegramMessage(id, "مرحبًا. لربط حسابك، افتح رابط Telegram الشخصي الذي أرسله لك مدير المطعم.");
    }
    return;
  }

  const driver = await driverForChat(id);
  if (!driver) {
    await sendTelegramMessage(id, "هذا الحساب غير مربوط بسائق. استخدم رابط الربط الشخصي من الإدارة.");
    return;
  }

  if (text === "🟢 تفعيل نشاطي") return setDriverActivity(id, true);
  if (text === "🔴 إيقاف نشاطي") return setDriverActivity(id, false);
  if (text === "📦 طلباتي" || text === "/orders") return showOrders(id);
  if (text === "👤 حسابي" || text === "/account") return showAccount(id);
  await sendMenu(id);
}

async function handleOrderAction(update: TelegramUpdate): Promise<void> {
  const callback = update.callback_query;
  if (!callback) return;

  const id = String(callback.from.id);
  const data = callback.data || "";
  const match = /^(order_accept|order_reject):(\d+)$/.exec(data);
  if (!match) {
    await answerTelegramCallbackQuery(callback.id, "إجراء غير معروف", true);
    return;
  }

  const orderId = Number(match[2]);
  const driver = await driverForChat(id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

  const eligible = driver
    && order
    && (!callback.message || String(callback.message.chat.id) === id)
    && driver.isActive
    && driver.status === ACTIVE
    && driver.restaurantId === order.restaurantId
    && order.driverId === driver.id;

  if (!eligible) {
    await answerTelegramCallbackQuery(
      callback.id,
      "لا يمكن تنفيذ الإجراء: السائق غير نشط أو الطلب ليس تابعًا لمطعمك.",
      true,
    );
    return;
  }

  const isAccept = match[1] === "order_accept";
  if (isAccept) {
    if (order.status !== "NEW") {
      await answerTelegramCallbackQuery(callback.id, "هذا الطلب لم يعد قابلًا للقبول.", true);
      return;
    }
  } else {
  }

  const handled = await respondToOrderAttempt(orderId, driver.id, isAccept ? "ACCEPTED" : "REJECTED");
  if (!handled) {
    await answerTelegramCallbackQuery(callback.id, "هذا الطلب تم تحديثه من جهة أخرى.", true);
    return;
  }

  await answerTelegramCallbackQuery(callback.id, isAccept ? "تم قبول الطلب" : "تم رفض الطلب");
  if (callback.message) {
    const resultText = isAccept
      ? "✅ تم قبول الطلب من السائق."
      : "❌ تم رفض الطلب وإلغاء إسناده إليك.";
    await editTelegramMessageText(callback.message.chat.id, callback.message.message_id, `${callback.message.text || "طلب توصيل"}\n\n${resultText}`);
  }
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.message) await handleMessage(update);
  if (update.callback_query) await handleOrderAction(update);
}

async function acquirePollingLock() {
  const client = await pool.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [TELEGRAM_POLL_LOCK_KEY],
    );
    if (result.rows[0]?.locked) return client;
  } catch (error) {
    client.release();
    throw error;
  }

  client.release();
  return null;
}

async function pollTelegram(): Promise<void> {
  const lockClient = await acquirePollingLock();
  if (!lockClient) {
    logger.warn("Telegram polling is already owned by another API process");
    return;
  }

  try {
    try {
      await ensureTelegramSchema();
      await setTelegramCommands();
      logger.info("Telegram driver bot polling started");
    } catch (error) {
      logger.error({ err: error }, "Telegram bot failed to initialize");
      return;
    }

    let conflictReported = false;
    while (true) {
      try {
        const updates = await getTelegramUpdates(nextUpdateOffset, 25);
        conflictReported = false;
        for (const update of updates) {
          nextUpdateOffset = Math.max(nextUpdateOffset, update.update_id + 1);
          try {
            await processUpdate(update);
          } catch (error) {
            logger.error({ err: error, updateId: update.update_id }, "Telegram update processing failed");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.startsWith("Conflict: terminated by other getUpdates request")) {
          if (!conflictReported) {
            logger.error(
              "Telegram rejected polling because another bot instance is using getUpdates; retrying in 30 seconds",
            );
            conflictReported = true;
          }
          await new Promise((resolve) => setTimeout(resolve, 30000));
          continue;
        }
        logger.error({ err: error }, "Telegram polling failed");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [TELEGRAM_POLL_LOCK_KEY]);
    } finally {
      lockClient.release();
    }
  }
}

export function startTelegramBot(): void {
  if (pollingPromise) return;
  void getTelegramBotStatus()
    .then((status) => {
      if (!status.connected) {
        logger.warn({ error: status.error }, "Telegram bot is not configured; driver polling is disabled");
        return;
      }
      pollingPromise = pollTelegram();
    })
    .catch((error) => {
      logger.error({ err: error }, "Failed to initialize Telegram driver bot");
    });
}