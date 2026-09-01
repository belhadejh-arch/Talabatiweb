import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const telegramContactsTable = pgTable("telegram_contacts", {
  chatId: text("chat_id").primaryKey(),
  title: text("title").notNull(),
  username: text("username"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TelegramContact = typeof telegramContactsTable.$inferSelect;