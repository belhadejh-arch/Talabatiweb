import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { restaurantsTable } from "./restaurants";
import { ordersTable } from "./orders";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  driverId: integer("driver_id").references(() => driversTable.id, { onDelete: "cascade" }),
  restaurantId: integer("restaurant_id").references(() => restaurantsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }),
  relatedId: integer("related_id"),
  relatedType: text("related_type"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
