import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { driversTable } from "./drivers";

export const deliveryMessageLogsTable = pgTable("delivery_message_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  responseAt: timestamp("response_at", { withTimezone: true }),
});

export const insertDeliveryMessageLogSchema = createInsertSchema(deliveryMessageLogsTable).omit({ id: true });
export type InsertDeliveryMessageLog = z.infer<typeof insertDeliveryMessageLogSchema>;
export type DeliveryMessageLog = typeof deliveryMessageLogsTable.$inferSelect;