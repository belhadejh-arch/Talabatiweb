import { Router, type IRouter } from "express";
import {
  db,
  restaurantsTable,
  subscriptionsTable,
  categoriesTable,
  productsTable,
  addonsTable,
  productSizesTable,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  orderStatusHistoryTable,
  notificationsTable,
  driversTable,
} from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { PlaceOrderBody } from "@workspace/api-zod";
import { isSubscriptionActive } from "../lib/subscriptions";
import { safeNotifyDriverOnAllChannels } from "../lib/telegramDelivery";

const router: IRouter = Router();

// Get public restaurant info
router.get("/public/restaurants/:slug", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [restaurant] = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.slug, raw));

  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, restaurant.id))
    .orderBy(desc(subscriptionsTable.createdAt));

  const isAcceptingOrders =
    restaurant.status === "ACTIVE" &&
    !!subscription &&
    isSubscriptionActive(subscription.status, subscription.expiryDate);

  res.json({
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    address: restaurant.address,
    logoUrl: restaurant.logoUrl,
    coverUrl: restaurant.coverUrl,
    description: restaurant.description,
    primaryColor: restaurant.primaryColor,
    status: restaurant.status,
    isAcceptingOrders,
    deliveryFee: parseFloat(restaurant.deliveryFee),
  });
});

// Get full public menu
router.get("/public/restaurants/:slug/menu", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [restaurant] = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.slug, raw));

  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, restaurant.id))
    .orderBy(desc(subscriptionsTable.createdAt));

  const isAcceptingOrders =
    restaurant.status === "ACTIVE" &&
    !!subscription &&
    isSubscriptionActive(subscription.status, subscription.expiryDate);

  const categories = await db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.restaurantId, restaurant.id), eq(categoriesTable.isAvailable, true)))
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.id));

  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.restaurantId, restaurant.id), eq(productsTable.isAvailable, true)))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.id));

  const productIds = products.map((p) => p.id);
  let allAddons: any[] = [];
  let allSizes: any[] = [];
  if (productIds.length > 0) {
    allAddons = await db
      .select()
      .from(addonsTable)
      .where(eq(addonsTable.isAvailable, true))
      .orderBy(asc(addonsTable.id));
    allAddons = allAddons.filter((a) => productIds.includes(a.productId));

    allSizes = await db
      .select()
      .from(productSizesTable)
      .where(eq(productSizesTable.isAvailable, true))
      .orderBy(asc(productSizesTable.sortOrder), asc(productSizesTable.id));
    allSizes = allSizes.filter((s) => productIds.includes(s.productId));
  }

  const addonsByProduct: Record<number, any[]> = {};
  for (const a of allAddons) {
    if (!addonsByProduct[a.productId]) addonsByProduct[a.productId] = [];
    addonsByProduct[a.productId].push({ ...a, price: parseFloat(a.price) });
  }

  const sizesByProduct: Record<number, any[]> = {};
  for (const s of allSizes) {
    if (!sizesByProduct[s.productId]) sizesByProduct[s.productId] = [];
    sizesByProduct[s.productId].push({ ...s, price: parseFloat(s.price) });
  }

  const productsByCategory: Record<number, any[]> = {};
  for (const p of products) {
    if (!productsByCategory[p.categoryId]) productsByCategory[p.categoryId] = [];
    productsByCategory[p.categoryId].push({
      ...p,
      price: parseFloat(p.price),
      addons: addonsByProduct[p.id] ?? [],
      sizes: sizesByProduct[p.id] ?? [],
    });
  }

  const menuCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    imageUrl: c.imageUrl,
    products: productsByCategory[c.id] ?? [],
  }));

  res.json({
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      address: restaurant.address,
      logoUrl: restaurant.logoUrl,
      coverUrl: restaurant.coverUrl,
      description: restaurant.description,
      primaryColor: restaurant.primaryColor,
      status: restaurant.status,
      isAcceptingOrders,
      deliveryFee: parseFloat(restaurant.deliveryFee),
    },
    categories: menuCategories,
  });
});

// Place order (guest checkout)
router.post("/public/restaurants/:slug/orders", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [restaurant] = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.slug, raw));

  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  // Check subscription
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.restaurantId, restaurant.id))
    .orderBy(desc(subscriptionsTable.createdAt));

  if (!subscription || !isSubscriptionActive(subscription.status, subscription.expiryDate)) {
    res.status(403).json({ error: "This restaurant is not accepting orders at the moment" });
    return;
  }

  if (restaurant.status !== "ACTIVE") {
    res.status(400).json({ error: "Restaurant is not active" });
    return;
  }

  const parsed = PlaceOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { items: orderItems, latitude, longitude, ...customerInfo } = parsed.data;

  // Validate products and compute totals
  const productIds = orderItems.map((i) => i.productId);
  const allProducts = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.restaurantId, restaurant.id));

  const productMap: Record<number, any> = {};
  for (const p of allProducts) productMap[p.id] = p;

  let totalAmount = 0;
  const lineItems: Array<{
    productId: number;
    productName: string;
    sizeId: number | null;
    sizeName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    addonIds: number[];
  }> = [];

  for (const item of orderItems) {
    const product = productMap[item.productId];
    if (!product || !product.isAvailable) {
      res.status(400).json({ error: `Product ${item.productId} is not available` });
      return;
    }

    let sizeId: number | null = null;
    let sizeName: string | null = null;
    let basePrice = parseFloat(product.price);
    if (item.selectedSizeId != null) {
      const [size] = await db
        .select()
        .from(productSizesTable)
        .where(and(eq(productSizesTable.id, item.selectedSizeId), eq(productSizesTable.productId, item.productId)));
      if (!size || !size.isAvailable) {
        res.status(400).json({ error: `Size ${item.selectedSizeId} is not available for product ${item.productId}` });
        return;
      }
      sizeId = size.id;
      sizeName = size.name;
      basePrice = parseFloat(size.price);
    }

    const addonIds = item.selectedAddonIds ?? [];
    let addonTotal = 0;
    if (addonIds.length > 0) {
      const addons = await db.select().from(addonsTable).where(eq(addonsTable.productId, item.productId));
      const validAddons = addons.filter((a) => addonIds.includes(a.id) && a.isAvailable);
      addonTotal = validAddons.reduce((sum, a) => sum + parseFloat(a.price), 0);
    }

    const unitPrice = basePrice + addonTotal;
    const subtotal = unitPrice * item.quantity;
    totalAmount += subtotal;

    lineItems.push({
      productId: item.productId,
      productName: product.name,
      sizeId,
      sizeName,
      quantity: item.quantity,
      unitPrice,
      subtotal,
      addonIds,
    });
  }

  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const deliveryFee = parseFloat(restaurant.deliveryFee);
  const subtotal = totalAmount;
  const grandTotal = subtotal + deliveryFee;

  // Create order
  const [order] = await db
    .insert(ordersTable)
    .values({
      restaurantId: restaurant.id,
      customerName: customerInfo.customerName,
      customerPhone: customerInfo.customerPhone,
      notes: customerInfo.notes ?? null,
      latitude,
      longitude,
      mapsUrl,
      subtotal: String(subtotal.toFixed(2)),
      deliveryFee: String(deliveryFee.toFixed(2)),
      totalAmount: String(grandTotal.toFixed(2)),
      status: "NEW",
    })
    .returning();

  // Create order items
  for (const li of lineItems) {
    const [item] = await db
      .insert(orderItemsTable)
      .values({
        orderId: order.id,
        productId: li.productId,
        productName: li.productName,
        sizeId: li.sizeId,
        sizeName: li.sizeName,
        quantity: li.quantity,
        unitPrice: String(li.unitPrice.toFixed(2)),
        subtotal: String(li.subtotal.toFixed(2)),
      })
      .returning();

    // Create addons for this item
    if (li.addonIds.length > 0) {
      const addons = await db
        .select()
        .from(addonsTable)
        .where(eq(addonsTable.productId, li.productId));

      for (const addonId of li.addonIds) {
        const addon = addons.find((a) => a.id === addonId);
        if (addon) {
          await db.insert(orderItemAddonsTable).values({
            orderItemId: item.id,
            addonId: addon.id,
            addonName: addon.name,
            price: addon.price,
          });
        }
      }
    }
  }

  // Initial status history
  await db.insert(orderStatusHistoryTable).values({ orderId: order.id, status: "NEW" });

  // Notification for admin
  await db.insert(notificationsTable).values({
    type: "NEW_ORDER",
    message: `طلب جديد #${order.id} من ${restaurant.name} — ${customerInfo.customerName}`,
    relatedId: order.id,
    relatedType: "order",
  });

  // Auto-assign an active driver belonging to this restaurant and notify
  // them on both configured delivery channels.
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(and(
      eq(driversTable.restaurantId, restaurant.id),
      eq(driversTable.isActive, true),
      eq(driversTable.status, "ACTIVE"),
    ))
    // Prefer a driver who can actually receive Telegram notifications. This
    // prevents an older active driver without a Chat ID from silently
    // capturing every new order before a linked driver.
    .orderBy(
      sql`CASE WHEN ${driversTable.telegramChatId} IS NOT NULL AND ${driversTable.telegramChatId} <> '' THEN 0 ELSE 1 END`,
      asc(driversTable.id),
    )
    .limit(1);

  if (driver) {
    await db.update(ordersTable).set({ driverId: driver.id }).where(eq(ordersTable.id, order.id));
    await db
      .update(driversTable)
      .set({ totalDeliveries: driver.totalDeliveries + 1 })
      .where(eq(driversTable.id, driver.id));

    await db.insert(notificationsTable).values({
      type: "DRIVER_ASSIGNED",
      message: `تم تعيين السائق "${driver.name}" للطلب #${order.id}`,
      relatedId: order.id,
      relatedType: "order",
    });

    const itemsSummary = lineItems
      .map((li) => `${li.productName}${li.sizeName ? ` (${li.sizeName})` : ""} x${li.quantity}`)
      .join(", ");

    void safeNotifyDriverOnAllChannels(driver, {
      restaurantName: restaurant.name,
      restaurantId: restaurant.id,
      orderId: order.id,
      customerName: customerInfo.customerName,
      customerPhone: customerInfo.customerPhone,
      items: itemsSummary,
      total: `${grandTotal.toFixed(2)} د.ل`,
      mapsUrl,
    });
  } else {
    await db.insert(notificationsTable).values({
      type: "NO_DRIVER",
      message: `لا يوجد سائق متاح لمطعم "${restaurant.name}" لتوصيل الطلب #${order.id}`,
      relatedId: order.id,
      relatedType: "order",
    });
  }

  res.status(201).json({
    orderId: order.id,
    status: "NEW",
    message: "تم إنشاء الطلب بنجاح",
  });
});

export default router;
