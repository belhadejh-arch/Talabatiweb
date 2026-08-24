import { Router, type IRouter } from "express";
import { db, driversTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateDriverBody,
  UpdateDriverBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// List drivers for a restaurant
router.get("/restaurants/:id/drivers", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const drivers = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.restaurantId, restaurantId))
    .orderBy(desc(driversTable.createdAt));

  res.json(drivers);
});

// Create driver
router.post("/restaurants/:id/drivers", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [driver] = await db
    .insert(driversTable)
    .values({ ...parsed.data, restaurantId })
    .returning();

  res.status(201).json(driver);
});

// Update driver
router.patch("/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [driver] = await db
    .update(driversTable)
    .set(parsed.data)
    .where(eq(driversTable.id, id))
    .returning();

  if (!driver) { res.status(404).json({ error: "Not found" }); return; }
  res.json(driver);
});

// Delete driver
router.delete("/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(driversTable).where(eq(driversTable.id, id));
  res.sendStatus(204);
});

export default router;
