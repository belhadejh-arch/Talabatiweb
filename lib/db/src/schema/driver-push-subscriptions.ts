import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";

export const driverPushSubscriptionsTable = pgTable(
  "driver_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    subscription: text("subscription").notNull(),
    device: text("device"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    endpointUnique: uniqueIndex("driver_push_subscriptions_endpoint_unique").on(table.endpoint),
  }),
);

export type DriverPushSubscription = typeof driverPushSubscriptionsTable.$inferSelect;