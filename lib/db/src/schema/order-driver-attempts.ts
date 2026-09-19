import { pgTable, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { driversTable } from "./drivers";
import { restaurantsTable } from "./restaurants";

export const orderDriverAttemptsTable = pgTable(
  "order_driver_attempts",
  {
    assignmentId: integer("assignment_id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
    restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    responseAt: timestamp("response_at", { withTimezone: true }),
    onesignalStatus: text("onesignal_status").notNull().default("PENDING"),
    onesignalResponse: text("onesignal_response"),
    onesignalError: text("onesignal_error"),
  },
  (table) => ({
    orderDriverAttemptUnique: uniqueIndex("order_driver_attempt_order_driver_idx").on(table.orderId, table.driverId),
  }),
);

export type OrderDriverAttempt = typeof orderDriverAttemptsTable.$inferSelect;