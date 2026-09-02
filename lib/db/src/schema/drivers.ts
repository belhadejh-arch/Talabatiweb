import { pgTable, text, serial, timestamp, integer, boolean, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { restaurantsTable } from "./restaurants";

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  serialNumber: text("serial_number").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  whatsappNumber: text("whatsapp_number"),
  status: text("status").notNull().default("INACTIVE"),
  address: text("address"),
  birthDate: date("birth_date", { mode: "string" }),
  profileImageUrl: text("profile_image_url"),
  vehicleType: text("vehicle_type"),
  vehiclePlate: text("vehicle_plate"),
  isActive: boolean("is_active").notNull().default(false),
  totalDeliveries: integer("total_deliveries").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  serialNumberUnique: uniqueIndex("drivers_serial_number_unique").on(table.serialNumber),
}));

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
