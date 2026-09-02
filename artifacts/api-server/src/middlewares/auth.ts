import { Request, Response, NextFunction } from "express";
import { db, driversTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  next();
}

export async function requireDriverAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = (req as any).session;
  const driverId = Number(session?.driverId);
  const restaurantId = Number(session?.driverRestaurantId);
  if (!Number.isInteger(driverId) || !Number.isInteger(restaurantId)) {
    res.status(401).json({ error: "Driver authentication required" });
    return;
  }

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.id, driverId),
      eq(driversTable.restaurantId, restaurantId),
      eq(driversTable.isActive, true),
      eq(driversTable.status, "ACTIVE"),
    ));

  if (!driver) {
    session.destroy(() => undefined);
    res.status(401).json({ error: "Driver session is no longer valid" });
    return;
  }

  (req as any).driver = driver;
  next();
}
