import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { driversTable } from "./drivers";
import { restaurantsTable } from "./restaurants";

export const orderDriverAttemptsTable = pgTable(
  "order_driver_attempts",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
    restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    responseAt: timestamp("response_at", { withTimezone: true }),
    timeoutAt: timestamp("timeout_at", { withTimezone: true }).notNull(),
    notificationStatus: text("notification_status").notNull().default("PENDING"),
    notificationAttemptedAt: timestamp("notification_attempted_at", { withTimezone: true }),
    notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
    notificationResponseStatus: integer("notification_response_status"),
    notificationResponse: text("notification_response"),
    notificationError: text("notification_error"),
  },
  (table) => ({
    orderDriverAttemptUnique: uniqueIndex("order_driver_attempt_order_driver_idx").on(table.orderId, table.driverId),
  }),
);

export type OrderDriverAttempt = typeof orderDriverAttemptsTable.$inferSelect;