import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { adminsTable, restaurantsTable, subscriptionsTable, settingsTable } from "./schema";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const { Pool } = pg;

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log("🌱 Seeding database...");

  // Create super admin
  const existingAdmin = await db.select().from(adminsTable).where(eq(adminsTable.username, "admin"));
  if (existingAdmin.length === 0) {
    const hash = await bcrypt.hash("admin123", 12);
    await db.insert(adminsTable).values({
      username: "admin",
      passwordHash: hash,
      role: "super_admin",
    });
    console.log("✅ Created admin user: admin / admin123");
  } else {
    console.log("ℹ️  Admin user already exists");
  }

  // Create platform settings
  const existingSettings = await db.select().from(settingsTable);
  if (existingSettings.length === 0) {
    await db.insert(settingsTable).values({
      platformName: "TALABAT",
      defaultCurrency: "SAR",
    });
    console.log("✅ Created platform settings");
  }

  // Create demo restaurant
  const existingRestaurant = await db.select().from(restaurantsTable).where(eq(restaurantsTable.slug, "demo-restaurant"));
  let restaurantId: number;

  if (existingRestaurant.length === 0) {
    const now = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 30);

    const [restaurant] = await db.insert(restaurantsTable).values({
      name: "مطعم الوليمة",
      slug: "demo-restaurant",
      phone: "+966500000000",
      address: "الرياض، حي العليا، شارع التخصصي",
      description: "مطعم عربي أصيل يقدم أشهى الأطباق التراثية والعصرية",
      primaryColor: "#FF6B35",
      status: "ACTIVE",
    }).returning();

    restaurantId = restaurant.id;

    await db.insert(subscriptionsTable).values({
      restaurantId,
      plan: "MONTHLY",
      status: "ACTIVE",
      startDate: now.toISOString().slice(0, 10),
      expiryDate: expiry.toISOString().slice(0, 10),
    });

    console.log(`✅ Created demo restaurant: "${restaurant.name}" (slug: ${restaurant.slug})`);
  } else {
    restaurantId = existingRestaurant[0].id;
    console.log("ℹ️  Demo restaurant already exists");
  }

  await pool.end();
  console.log("✅ Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
