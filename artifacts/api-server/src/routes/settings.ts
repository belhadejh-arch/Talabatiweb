import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

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

  const existing = await getOrCreateSettings();

  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, existing.id))
    .returning();

  res.json(updated);
});

export default router;
