import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  platformName: text("platform_name").notNull().default("TALABAT"),
  whatsappApiKey: text("whatsapp_api_key"),
  whatsappPhoneId: text("whatsapp_phone_id"),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  defaultCurrency: text("default_currency").notNull().default("LYD"),
  mapsApiKey: text("maps_api_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
