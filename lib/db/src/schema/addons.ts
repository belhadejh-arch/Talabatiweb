import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const addonsTable = pgTable("addons", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAddonSchema = createInsertSchema(addonsTable).omit({ id: true, createdAt: true });
export type InsertAddon = z.infer<typeof insertAddonSchema>;
export type Addon = typeof addonsTable.$inferSelect;
