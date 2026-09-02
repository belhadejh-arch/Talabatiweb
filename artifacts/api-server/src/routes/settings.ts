import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const DRIVER_TIMEOUT_OPTIONS = new Set([60, 120, 180, 300, 600]);

async function getOrCreateSettings() {
  const [settings] = await db.select().from(settingsTable);
  if (!settings) {
    const [created] = await db.insert(settingsTable).values({}).returning();
    return created;
  }
  return settings;
}

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (
    parsed.data.driverResponseTimeoutSeconds !== undefined &&
    !DRIVER_TIMEOUT_OPTIONS.has(parsed.data.driverResponseTimeoutSeconds)
  ) {
    res.status(400).json({ error: "مدة انتظار السائق يجب أن تكون 1 أو 2 أو 3 أو 5 أو 10 دقائق" });
    return;
  }

  const existing = await getOrCreateSettings();

  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, existing.id))
    .returning();

  res.json(updated);
});

export default router;
