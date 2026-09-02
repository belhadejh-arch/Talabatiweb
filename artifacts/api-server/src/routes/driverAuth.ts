import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, driversTable, restaurantsTable } from "@workspace/db";
import { requireDriverAuth } from "../middlewares/auth";

const router: IRouter = Router();

function serialNumberFromBody(body: unknown): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).serialNumber : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function regenerateSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error: Error | null) => error ? reject(error) : resolve());
  });
}

router.post("/driver-auth/login", async (req, res): Promise<void> => {
  const serialNumber = serialNumberFromBody(req.body);
  if (!/^\d{6}$/.test(serialNumber)) {
    res.status(400).json({ error: "أدخل الرقم التسلسلي المكوّن من 6 أرقام" });
    return;
  }

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.serialNumber, serialNumber),
      eq(driversTable.isActive, true),
      eq(driversTable.status, "ACTIVE"),
    ));

  if (!driver) {
    res.status(401).json({ error: "الرقم التسلسلي غير صحيح أو الحساب غير مفعّل" });
    return;
  }

  const [restaurant] = await db
    .select({ id: restaurantsTable.id, name: restaurantsTable.name, logoUrl: restaurantsTable.logoUrl })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, driver.restaurantId));
  if (!restaurant) {
    res.status(401).json({ error: "لا يمكن الوصول إلى مطعم السائق" });
    return;
  }

  await regenerateSession(req);
  (req as any).session.driverId = driver.id;
  (req as any).session.driverRestaurantId = driver.restaurantId;

  res.json({
    driver: {
      id: driver.id,
      serialNumber: driver.serialNumber,
      name: driver.name,
      phone: driver.phone,
      whatsappNumber: driver.whatsappNumber,
      address: driver.address,
      birthDate: driver.birthDate,
      profileImageUrl: driver.profileImageUrl,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      isActive: driver.isActive,
      status: driver.status,
      totalDeliveries: driver.totalDeliveries,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantLogoUrl: restaurant.logoUrl,
    },
  });
});

router.post("/driver-auth/logout", requireDriverAuth, (req, res): void => {
  (req as any).session.destroy((error: Error | null) => {
    res.clearCookie("talabat.sid", { path: "/" });
    if (error) {
      res.status(500).json({ error: "تعذر إنهاء الجلسة" });
      return;
    }
    res.json({ ok: true });
  });
});

router.get("/driver-auth/me", requireDriverAuth, async (req, res): Promise<void> => {
  const driver = (req as any).driver;
  const [restaurant] = await db
    .select({ id: restaurantsTable.id, name: restaurantsTable.name, logoUrl: restaurantsTable.logoUrl })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, driver.restaurantId));

  res.json({
    ...driver,
    restaurantName: restaurant?.name ?? "",
    restaurantLogoUrl: restaurant?.logoUrl ?? null,
  });
});

export default router;