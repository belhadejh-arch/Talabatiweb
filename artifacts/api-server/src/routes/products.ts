import { Router, type IRouter } from "express";
import { db, productsTable, addonsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  CreateProductBody,
  UpdateProductBody,
  ListProductsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// List products for a restaurant
router.get("/restaurants/:id/products", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const qp = ListProductsQueryParams.safeParse(req.query);
  const categoryId = qp.success ? qp.data.categoryId : undefined;

  const where = categoryId
    ? and(eq(productsTable.restaurantId, restaurantId), eq(productsTable.categoryId, categoryId))
    : eq(productsTable.restaurantId, restaurantId);

  const products = await db
    .select()
    .from(productsTable)
    .where(where)
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.id));

  const productIds = products.map((p) => p.id);
  let addons: any[] = [];
  if (productIds.length > 0) {
    addons = await db
      .select()
      .from(addonsTable)
      .where(eq(addonsTable.productId, productIds[0]))
      .orderBy(asc(addonsTable.id));

    if (productIds.length > 1) {
      const all = await Promise.all(
        productIds.map((pid) =>
          db.select().from(addonsTable).where(eq(addonsTable.productId, pid)).orderBy(asc(addonsTable.id))
        )
      );
      addons = all.flat();
    }
  }

  const addonsByProduct: Record<number, any[]> = {};
  for (const addon of addons) {
    if (!addonsByProduct[addon.productId]) addonsByProduct[addon.productId] = [];
    addonsByProduct[addon.productId].push({
      ...addon,
      price: parseFloat(addon.price),
    });
  }

  const data = products.map((p) => ({
    ...p,
    price: parseFloat(p.price),
    addons: addonsByProduct[p.id] ?? [],
  }));

  res.json(data);
});

// Create product
router.post("/restaurants/:id/products", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db
    .insert(productsTable)
    .values({ ...parsed.data, restaurantId, price: String(parsed.data.price) })
    .returning();

  res.status(201).json({ ...product, price: parseFloat(product.price), addons: [] });
});

// Update product
router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: any = { ...parsed.data };
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, id))
    .returning();

  if (!product) { res.status(404).json({ error: "Not found" }); return; }

  const addons = await db.select().from(addonsTable).where(eq(addonsTable.productId, id));
  res.json({
    ...product,
    price: parseFloat(product.price),
    addons: addons.map((a) => ({ ...a, price: parseFloat(a.price) })),
  });
});

// Delete product
router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.sendStatus(204);
});

// List addons for a product
router.get("/products/:id/addons", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const productId = parseInt(raw, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const addons = await db.select().from(addonsTable).where(eq(addonsTable.productId, productId));
  res.json(addons.map((a) => ({ ...a, price: parseFloat(a.price) })));
});

// Create addon
router.post("/products/:id/addons", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const productId = parseInt(raw, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = req.body;
  if (!parsed.name) { res.status(400).json({ error: "Name required" }); return; }

  const [addon] = await db
    .insert(addonsTable)
    .values({
      productId,
      name: parsed.name,
      nameAr: parsed.nameAr ?? null,
      price: String(parsed.price ?? 0),
      isAvailable: parsed.isAvailable ?? true,
    })
    .returning();

  res.status(201).json({ ...addon, price: parseFloat(addon.price) });
});

// Update addon
router.patch("/addons/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const updateData: any = { ...req.body };
  if (req.body.price !== undefined) updateData.price = String(req.body.price);

  const [addon] = await db
    .update(addonsTable)
    .set(updateData)
    .where(eq(addonsTable.id, id))
    .returning();

  if (!addon) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...addon, price: parseFloat(addon.price) });
});

// Delete addon
router.delete("/addons/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(addonsTable).where(eq(addonsTable.id, id));
  res.sendStatus(204);
});

export default router;
