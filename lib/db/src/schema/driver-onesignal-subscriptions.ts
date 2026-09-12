import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";

export const driverOneSignalSubscriptionsTable = pgTable(
  "driver_onesignal_subscriptions",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id").notNull().references(() => driversTable.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    externalId: text("external_id").notNull(),
    optedIn: boolean("opted_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionUnique: uniqueIndex("driver_onesignal_subscriptions_subscription_unique").on(table.subscriptionId),
  }),
);

export type DriverOneSignalSubscription = typeof driverOneSignalSubscriptionsTable.$inferSelect;