import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { deleteDatabaseStoredImage, deleteStoredImage } from "../lib/imageUpload";

const router: IRouter = Router();

// List categories for a restaurant
router.get("/restaurants/:id/categories", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.restaurantId, restaurantId))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));

  res.json(categories);
});

// Create category
router.post("/restaurants/:id/categories", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [category] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, restaurantId })
    .returning();

  res.status(201).json(category);
});

// Update category
router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));

  const [category] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(eq(categoriesTable.id, id))
    .returning();

  if (!category) { res.status(404).json({ error: "Not found" }); return; }

  // If the image was replaced, best-effort delete the old stored object.
  if (
    parsed.data.imageUrl !== undefined &&
    existing?.imageUrl &&
    existing.imageUrl !== category.imageUrl
  ) {
    void deleteStoredImage(existing.imageUrl);
    void deleteDatabaseStoredImage(existing.imageUrl);
  }

  res.json(category);
});

// Delete category
router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, id));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  if (existing?.imageUrl) {
    void deleteStoredImage(existing.imageUrl);
    void deleteDatabaseStoredImage(existing.imageUrl);
  }
  res.sendStatus(204);
});

export default router;
