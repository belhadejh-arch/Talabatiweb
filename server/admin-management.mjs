import { pool, withTransaction } from "./db.mjs";
import { requireSession, updateAdminCredentials } from "./auth.mjs";

class AdminApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(message, status = 400) {
  throw new AdminApiError(status, message);
}

function id(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${label} غير صالح.`);
  return parsed;
}

function text(value, label, max, optional = false) {
  if (optional && (value == null || value === "")) return "";
  if (typeof value !== "string") fail(`${label} مطلوب.`);
  const result = value.trim();
  if (!result || result.length > max) fail(`${label} غير صالح.`);
  return result;
}

function amount(value, label) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())) fail(`${label} غير صالح.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) fail(`${label} غير صالح.`);
  return (Math.round((parsed + Number.EPSILON) * 1000) / 1000).toFixed(3);
}

function imageUrl(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") fail("صورة غير صالحة.");
  const result = value.trim();
  if (!result) return "";
  if (result.startsWith("data:image/") && result.includes(";base64,")) {
    if (result.length > 10 * 1024 * 1024) fail("حجم الصورة كبير جداً (أقصى حد 10 ميغابايت).");
    return result;
  }
  if (result.startsWith("/") && !result.startsWith("//")) return result;
  try {
    const parsed = new URL(result);
    if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) return result;
  } catch {
    // Report a stable validation error below.
  }
  fail("رابط أو ملف الصورة غير صالح.");
}

function date(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} يجب أن يكون بالتنسيق YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(`${label} غير صالح.`);
  return value;
}

function plan(value) {
  const result = text(value, "الخطة", 40).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]*$/.test(result)) fail("الخطة غير صالحة.");
  return result;
}

function days(value) {
  if (value == null) return 30;
  const result = id(value, "عدد الأيام");
  if (result > 3650) fail("عدد الأيام يتجاوز الحد المسموح.");
  return result;
}

function only(input, keys, label) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !keys.includes(key))) {
    fail(`حقول ${label} غير صالحة.`);
  }
}

function restaurantMap(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    phone: row.phone || "",
    address: row.address || "",
    description: row.description || "",
    rating: null,
    deliveryTime: null,
    deliveryFee: Number(row.delivery_fee || 0),
    imageUrl: row.logo_url || row.cover_url || "",
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    openingTime: row.opening_time ? String(row.opening_time).slice(0, 5) : "08:00",
    closingTime: row.closing_time ? String(row.closing_time).slice(0, 5) : "22:00",
    status: row.status || "INACTIVE"
  };
}

function productMap(row) {
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurant_id),
    name: row.name_ar || row.name,
    description: row.description_ar || row.description || "",
    price: Number(row.price),
    category: row.category_ar || row.category || "",
    imageUrl: row.image_url || "",
    categoryId: row.category_id == null ? null : Number(row.category_id),
    isAvailable: Boolean(row.is_available),
    stockQuantity: row.stock_quantity == null ? null : Number(row.stock_quantity)
  };
}

function categoryMap(row) {
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurant_id),
    name: row.name_ar || row.name,
    nameAr: row.name_ar || row.name,
    isAvailable: row.is_available !== false
  };
}

function subscriptionMap(row) {
  const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurant_id),
    restaurantName: row.restaurant_name || "",
    planName: row.plan || "",
    plan: row.plan || "",
    status: row.status,
    startDate: dateOnly(row.start_date),
    expiryDate: dateOnly(row.expiry_date),
    renewalDate: dateOnly(row.expiry_date)
  };
}

async function updateRestaurant(restaurantId, input) {
  only(input, ["name", "phone", "address", "description", "deliveryFee", "status", "imageUrl", "logoUrl", "latitude", "longitude", "openingTime", "closingTime"], "المطعم");
  if (!Object.keys(input).length) fail("أرسل حقلاً واحداً على الأقل للتحديث.");
  const fields = [];
  const values = [];
  const set = (column, value, cast = "") => {
    values.push(value);
    fields.push(`${column}=$${values.length}${cast}`);
  };
  if (Object.hasOwn(input, "name")) set("name", text(input.name, "اسم المطعم", 160));
  if (Object.hasOwn(input, "phone")) set("phone", text(input.phone, "رقم الهاتف", 40));
  if (Object.hasOwn(input, "address")) set("address", text(input.address, "العنوان", 300));
  if (Object.hasOwn(input, "description")) set("description", text(input.description, "الوصف", 1500, true));
  if (Object.hasOwn(input, "deliveryFee")) set("delivery_fee", amount(input.deliveryFee, "رسوم التوصيل"), "::numeric");
  if (Object.hasOwn(input, "latitude")) {
    const lat = input.latitude == null || input.latitude === "" ? null : Number(input.latitude);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) fail("خط العرض غير صالح.");
    set("latitude", lat);
  }
  if (Object.hasOwn(input, "longitude")) {
    const lng = input.longitude == null || input.longitude === "" ? null : Number(input.longitude);
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) fail("خط الطول غير صالح.");
    set("longitude", lng);
  }
  if (Object.hasOwn(input, "openingTime")) {
    const ot = text(input.openingTime, "وقت الفتح", 10);
    set("opening_time", ot, "::time");
  }
  if (Object.hasOwn(input, "closingTime")) {
    const ct = text(input.closingTime, "وقت الإغلاق", 10);
    set("closing_time", ct, "::time");
  }
  if (Object.hasOwn(input, "imageUrl") || Object.hasOwn(input, "logoUrl")) {
    const img = imageUrl(input.imageUrl ?? input.logoUrl);
    set("logo_url", img);
    set("cover_url", img);
  }
  if (Object.hasOwn(input, "status")) {
    if (!["ACTIVE", "INACTIVE", "FROZEN", "PAUSED", "ARCHIVED"].includes(input.status)) fail("حالة المطعم غير صالحة.");
    set("status", input.status);
  }
  values.push(restaurantId);
  const result = await pool.query(
    `UPDATE restaurants SET ${fields.join(",")} WHERE id=$${values.length}
     RETURNING id,name,slug,phone,address,description,status,logo_url,cover_url,delivery_fee,latitude,longitude,opening_time,closing_time`,
    values
  );
  if (!result.rows[0]) fail("المطعم غير موجود.", 404);
  return restaurantMap(result.rows[0]);
}

async function archiveRestaurant(restaurantId) {
  const result = await pool.query(
    `UPDATE restaurants SET status='ARCHIVED' WHERE id=$1
     RETURNING id,name,slug,phone,address,description,status,logo_url,cover_url,delivery_fee,latitude,longitude`,
    [restaurantId]
  );
  if (!result.rows[0]) fail("المطعم غير موجود.", 404);
  return restaurantMap(result.rows[0]);
}

async function menu(restaurantId) {
  const exists = await pool.query("SELECT id FROM restaurants WHERE id=$1", [restaurantId]);
  if (!exists.rows[0]) fail("المطعم غير موجود.", 404);
  const [cats, prods] = await Promise.all([
    pool.query("SELECT id,restaurant_id,name,name_ar,is_available FROM categories WHERE restaurant_id=$1 ORDER BY id", [restaurantId]),
    pool.query(
      `SELECT p.id,p.restaurant_id,p.category_id,p.name,p.name_ar,p.description,p.description_ar,
              p.image_url,p.price,p.is_available,p.stock_quantity,c.name AS category,c.name_ar AS category_ar
         FROM products p LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.restaurant_id=$1 ORDER BY p.sort_order,p.id`,
      [restaurantId]
    )
  ]);
  return { categories: cats.rows.map(categoryMap), products: prods.rows.map(productMap) };
}

async function saveCategory(categoryId, input) {
  only(input, categoryId == null
    ? ["restaurantId", "name"]
    : ["restaurantId", "name", "isAvailable"], "الفئة");
  if (!Object.keys(input).length) fail("أرسل حقلاً واحداً على الأقل للتحديث.");
  const name = Object.hasOwn(input, "name") ? text(input.name, "اسم الفئة", 120) : null;
  if (categoryId == null) {
    const restaurantId = id(input.restaurantId, "المطعم");
    const inserted = await pool.query(
      `INSERT INTO categories (restaurant_id,name,name_ar,is_available)
       SELECT id,$2,$2,TRUE FROM restaurants WHERE id=$1
       RETURNING id,restaurant_id,name,name_ar,is_available`,
      [restaurantId, text(input.name, "اسم الفئة", 120)]
    );
    if (!inserted.rows[0]) fail("المطعم غير موجود.", 404);
    return categoryMap(inserted.rows[0]);
  }
  const current = (await pool.query("SELECT id,restaurant_id FROM categories WHERE id=$1", [categoryId])).rows[0];
  if (!current) fail("الفئة غير موجودة.", 404);
  if (Object.hasOwn(input, "isAvailable") && typeof input.isAvailable !== "boolean") {
    fail("حالة توفر الفئة يجب أن تكون true أو false.");
  }
  const restaurantId = Object.hasOwn(input, "restaurantId") ? id(input.restaurantId, "المطعم") : Number(current.restaurant_id);
  const updated = await pool.query(
    `UPDATE categories c SET restaurant_id=$2,name=COALESCE($3,c.name),
       name_ar=COALESCE($3,c.name_ar),is_available=COALESCE($4,c.is_available)
      WHERE c.id=$1 AND EXISTS (SELECT 1 FROM restaurants r WHERE r.id=$2)
      RETURNING c.id,c.restaurant_id,c.name,c.name_ar,c.is_available`,
    [categoryId, restaurantId, name, Object.hasOwn(input, "isAvailable") ? input.isAvailable : null]
  );
  if (!updated.rows[0]) fail("المطعم المحدد غير موجود.", 404);
  return categoryMap(updated.rows[0]);
}

async function deleteCategory(categoryId) {
  const result = await pool.query(
    `UPDATE categories SET is_available=FALSE WHERE id=$1
     RETURNING id,restaurant_id,name,name_ar,is_available`,
    [categoryId]
  );
  if (!result.rows[0]) fail("الفئة غير موجودة.", 404);
  return categoryMap(result.rows[0]);
}

function validateProduct(input, partial) {
  only(input, ["restaurantId", "categoryId", "name", "description", "price", "isAvailable", "stockQuantity", "imageUrl"], "المنتج");
  if (!partial && ["restaurantId", "name", "price"].some((key) => !Object.hasOwn(input, key))) {
    fail("المطعم والاسم والسعر مطلوبة للمنتج.");
  }
  if (!partial && input.categoryId == null) fail("الفئة مطلوبة للمنتج.");
  if (!Object.keys(input).length) fail("أرسل حقلاً واحداً على الأقل للتحديث.");
  const value = {};
  if (Object.hasOwn(input, "restaurantId")) value.restaurantId = id(input.restaurantId, "المطعم");
  if (Object.hasOwn(input, "categoryId")) value.categoryId = id(input.categoryId, "الفئة");
  if (Object.hasOwn(input, "name")) value.name = text(input.name, "اسم المنتج", 160);
  if (Object.hasOwn(input, "description")) value.description = text(input.description, "الوصف", 2000, true);
  if (Object.hasOwn(input, "price")) value.price = amount(input.price, "السعر");
  if (Object.hasOwn(input, "isAvailable")) {
    if (typeof input.isAvailable !== "boolean") fail("التوفر يجب أن يكون true أو false.");
    value.isAvailable = input.isAvailable;
  }
  if (Object.hasOwn(input, "stockQuantity")) {
    if (input.stockQuantity == null) value.stockQuantity = null;
    else {
      if (typeof input.stockQuantity !== "number" && typeof input.stockQuantity !== "string") fail("المخزون غير صالح.");
      const quantity = Number(input.stockQuantity);
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1_000_000) fail("المخزون غير صالح.");
      value.stockQuantity = quantity;
    }
  }
  if (Object.hasOwn(input, "imageUrl")) value.imageUrl = imageUrl(input.imageUrl);
  return value;
}

async function saveProduct(productId, input) {
  const value = validateProduct(input, productId != null);
  if (productId == null && !Object.hasOwn(value, "isAvailable")) value.isAvailable = true;
  let current = null;
  if (productId != null) {
    current = (await pool.query("SELECT id,restaurant_id,category_id FROM products WHERE id=$1", [productId])).rows[0];
    if (!current) fail("المنتج غير موجود.", 404);
  }
  const restaurantId = value.restaurantId ?? Number(current?.restaurant_id);
  if (!(await pool.query("SELECT id FROM restaurants WHERE id=$1", [restaurantId])).rows[0]) fail("المطعم غير موجود.", 404);
  const categoryId = Object.hasOwn(value, "categoryId") ? value.categoryId : current?.category_id ?? null;
  if (categoryId != null) {
    const category = (await pool.query(
      "SELECT id,is_available FROM categories WHERE id=$1 AND restaurant_id=$2",
      [categoryId, restaurantId]
    )).rows[0];
    if (!category) fail("الفئة لا تتبع المطعم المحدد.");
    if (category.is_available === false) fail("الفئة مؤرشفة. أعد تفعيلها قبل إنشاء أو تحديث منتجاتها.");
  }
  const fields = [
    ["category_id", "categoryId"], ["name", "name"], ["description", "description"],
    ["price", "price"], ["is_available", "isAvailable"], ["stock_quantity", "stockQuantity"],
    ["image_url", "imageUrl"]
  ];
  let result;
  if (productId == null) {
    const selected = fields.filter(([, key]) => Object.hasOwn(value, key));
    const columns = ["restaurant_id", ...selected.map(([column]) => column)];
    const values = [restaurantId, ...selected.map(([, key]) => value[key])];
    const placeholders = values.map((_, index) => `$${index + 1}${index > 0 && selected[index - 1][1] === "price" ? "::numeric" : ""}`);
    result = await pool.query(
      `INSERT INTO products (${columns.join(",")}) VALUES (${placeholders.join(",")})
       RETURNING id,restaurant_id,category_id,name,name_ar,description,description_ar,image_url,price,is_available,stock_quantity`,
      values
    );
  } else {
    const sets = [];
    const values = [];
    for (const [column, key] of fields) {
      if (Object.hasOwn(value, key)) {
        values.push(value[key]);
        sets.push(`${column}=$${values.length}${key === "price" ? "::numeric" : ""}`);
        if (key === "name") sets.push(`name_ar=$${values.length}`);
        if (key === "description") sets.push(`description_ar=$${values.length}`);
      }
    }
    if (Object.hasOwn(value, "restaurantId")) {
      values.push(restaurantId);
      sets.push(`restaurant_id=$${values.length}`);
    }
    if (!sets.length) fail("أرسل حقلاً واحداً على الأقل للتحديث.");
    values.push(productId);
    result = await pool.query(
      `UPDATE products SET ${sets.join(",")} WHERE id=$${values.length}
       RETURNING id,restaurant_id,category_id,name,name_ar,description,description_ar,image_url,price,is_available,stock_quantity`,
      values
    );
  }
  return productMap(result.rows[0]);
}

async function hideProduct(productId) {
  const result = await pool.query(
    `UPDATE products SET is_available=FALSE WHERE id=$1
     RETURNING id,restaurant_id,category_id,name,name_ar,description,description_ar,image_url,price,is_available,stock_quantity`,
    [productId]
  );
  if (!result.rows[0]) fail("المنتج غير موجود.", 404);
  return productMap(result.rows[0]);
}

async function saveSubscription(subscriptionId, input) {
  if (subscriptionId == null) {
    only(input, ["restaurantId", "plan", "days"], "الاشتراك");
    const inserted = await pool.query(
      `INSERT INTO subscriptions (restaurant_id,plan,status,start_date,expiry_date)
        SELECT id,$2,'ACTIVE',CURRENT_DATE,CURRENT_DATE+$3::integer FROM restaurants WHERE id=$1
       RETURNING id,restaurant_id,plan,status,start_date,expiry_date`,
      [id(input.restaurantId, "المطعم"), plan(input.plan), days(input.days)]
    );
    if (!inserted.rows[0]) fail("المطعم غير موجود.", 404);
    return subscriptionMap(inserted.rows[0]);
  }
  only(input, ["plan", "status", "expiryDate"], "الاشتراك");
  if (!Object.keys(input).length) fail("أرسل حقلاً واحداً على الأقل للتحديث.");
  const values = [];
  const sets = [];
  if (Object.hasOwn(input, "plan")) { values.push(plan(input.plan)); sets.push(`plan=$${values.length}`); }
  if (Object.hasOwn(input, "status")) {
    if (!["ACTIVE", "INACTIVE", "CANCELLED"].includes(input.status)) fail("حالة الاشتراك غير صالحة.");
    values.push(input.status); sets.push(`status=$${values.length}`);
  }
  if (Object.hasOwn(input, "expiryDate")) {
    const expiryDate = date(input.expiryDate, "تاريخ الانتهاء");
    const current = (await pool.query("SELECT start_date FROM subscriptions WHERE id=$1", [subscriptionId])).rows[0];
    if (!current) fail("الاشتراك غير موجود.", 404);
    const startDate = current.start_date instanceof Date
      ? current.start_date.toISOString().slice(0, 10)
      : String(current.start_date).slice(0, 10);
    if (expiryDate < startDate) fail("تاريخ الانتهاء لا يمكن أن يسبق تاريخ بدء الاشتراك.");
    values.push(expiryDate); sets.push(`expiry_date=$${values.length}::date`);
  }
  values.push(subscriptionId);
  const result = await pool.query(
    `UPDATE subscriptions SET ${sets.join(",")} WHERE id=$${values.length}
     RETURNING id,restaurant_id,plan,status,start_date,expiry_date`,
    values
  );
  if (!result.rows[0]) fail("الاشتراك غير موجود.", 404);
  const row = result.rows[0];
  row.restaurant_name = (await pool.query("SELECT name FROM restaurants WHERE id=$1", [row.restaurant_id])).rows[0]?.name || "";
  return subscriptionMap(row);
}

async function renewSubscription(subscriptionId, input) {
  only(input, ["plan", "days"], "التجديد");
  const planValue = input.plan == null ? null : plan(input.plan);
  const result = await pool.query(
    `UPDATE subscriptions SET plan=COALESCE($2,plan),
        expiry_date=GREATEST(expiry_date,CURRENT_DATE)+$3::integer,status='ACTIVE'
     WHERE id=$1 RETURNING id,restaurant_id,plan,status,start_date,expiry_date`,
    [subscriptionId, planValue, days(input.days)]
  );
  if (!result.rows[0]) fail("الاشتراك غير موجود.", 404);
  const row = result.rows[0];
  row.restaurant_name = (await pool.query("SELECT name FROM restaurants WHERE id=$1", [row.restaurant_id])).rows[0]?.name || "";
  return subscriptionMap(row);
}

async function cancelSubscription(subscriptionId) {
  const result = await pool.query(
    `UPDATE subscriptions SET status='CANCELLED' WHERE id=$1
     RETURNING id,restaurant_id,plan,status,start_date,expiry_date`,
    [subscriptionId]
  );
  if (!result.rows[0]) fail("الاشتراك غير موجود.", 404);
  const row = result.rows[0];
  row.restaurant_name = (await pool.query("SELECT name FROM restaurants WHERE id=$1", [row.restaurant_id])).rows[0]?.name || "";
  return subscriptionMap(row);
}

async function deactivateDriver(driverId) {
  const result = await pool.query(
    `UPDATE drivers SET is_active=FALSE,status='ARCHIVED' WHERE id=$1
     RETURNING id,restaurant_id,name,phone,email,status,is_active`,
    [driverId]
  );
  if (!result.rows[0]) fail("السائق غير موجود.", 404);
  const row = result.rows[0];
  return {
    id: Number(row.id), name: row.name, phone: row.phone || "", email: row.email || "",
    restaurantId: Number(row.restaurant_id), isActive: false, status: row.status
  };
}

async function deleteDriverPermanently(driverId) {
  return await withTransaction(async (client) => {
    await client.query("UPDATE orders SET driver_id=NULL WHERE driver_id=$1", [driverId]);
    await client.query("DELETE FROM order_email_deliveries WHERE driver_id=$1", [driverId]);
    await client.query("DELETE FROM order_driver_attempts WHERE driver_id=$1", [driverId]);
    await client.query("DELETE FROM driver_gmail_tokens WHERE driver_id=$1", [driverId]);
    await client.query("DELETE FROM driver_gmail_states WHERE driver_id=$1", [driverId]);
    const result = await client.query(
      `DELETE FROM drivers WHERE id=$1
       RETURNING id,restaurant_id,name,phone,email,status,is_active`,
      [driverId]
    );
    if (!result.rows[0]) fail("السائق غير موجود.", 404);
    const row = result.rows[0];
    return {
      id: Number(row.id), name: row.name, phone: row.phone || "", email: row.email || "",
      restaurantId: Number(row.restaurant_id), isActive: false, status: "DELETED", deleted: true
    };
  });
}

async function settings(adminId) {
  const result = await pool.query(
    `SELECT a.username,s.dispatch_timeout_minutes
       FROM admins a CROSS JOIN admin_settings s
      WHERE a.id=$1 AND s.id=1`,
    [adminId]
  );
  if (!result.rows[0]) fail("إعدادات الإدارة غير مهيأة. طبّق server/migrations/002_admin_settings.sql.", 503);
  return { adminUsername: result.rows[0].username, dispatchTimeoutMinutes: Number(result.rows[0].dispatch_timeout_minutes) };
}

export async function handleAdminManagement(req, res, url, { readJson, sendJson }) {
  const path = url.pathname;
  const method = req.method || "GET";
  const restaurantMatch = path.match(/^\/api\/admin\/restaurants\/(\d+)$/);
  const menuMatch = path === "/api/admin/menu";
  const categories = path === "/api/admin/categories";
  const categoryMatch = path.match(/^\/api\/admin\/categories\/(\d+)$/);
  const products = path === "/api/admin/products";
  const productMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
  const subscriptions = path === "/api/admin/subscriptions";
  const subscriptionMatch = path.match(/^\/api\/admin\/subscriptions\/(\d+)(\/renew)?$/);
  const driverMatch = path.match(/^\/api\/admin\/drivers\/(\d+)$/);
  const settingsRoute = path === "/api/admin/settings";
  const credentialsRoute = path === "/api/admin/settings/credentials";
  if (!restaurantMatch && !menuMatch && !categories && !categoryMatch && !products &&
      !productMatch && !subscriptions && !subscriptionMatch && !driverMatch &&
      !settingsRoute && !credentialsRoute) return false;
  // Retain the legacy driver-edit PATCH handler in api.mjs.
  if (driverMatch && method === "PATCH") return false;

  const session = await requireSession(req, "admin");
  if (restaurantMatch) {
    const restaurantId = id(restaurantMatch[1], "المطعم");
    if (method === "PATCH") sendJson(res, 200, { restaurant: await updateRestaurant(restaurantId, await readJson(req, 10 * 1024 * 1024)) });
    else if (method === "DELETE") sendJson(res, 200, { restaurant: await archiveRestaurant(restaurantId) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (menuMatch) {
    if (method !== "GET") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    else sendJson(res, 200, await menu(id(url.searchParams.get("restaurantId"), "المطعم")));
    return true;
  }
  if (categories) {
    if (method === "POST") sendJson(res, 201, { category: await saveCategory(null, await readJson(req, 32 * 1024)) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (categoryMatch) {
    const categoryId = id(categoryMatch[1], "الفئة");
    if (method === "PATCH") sendJson(res, 200, { category: await saveCategory(categoryId, await readJson(req, 32 * 1024)) });
    else if (method === "DELETE") sendJson(res, 200, { category: await deleteCategory(categoryId) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (products) {
    if (method === "POST") sendJson(res, 201, { product: await saveProduct(null, await readJson(req, 10 * 1024 * 1024)) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (productMatch) {
    const productId = id(productMatch[1], "المنتج");
    if (method === "PATCH") sendJson(res, 200, { product: await saveProduct(productId, await readJson(req, 10 * 1024 * 1024)) });
    else if (method === "DELETE") sendJson(res, 200, { product: await hideProduct(productId) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (subscriptions) {
    if (method === "POST") sendJson(res, 201, { subscription: await saveSubscription(null, await readJson(req, 32 * 1024)) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (subscriptionMatch) {
    const subscriptionId = id(subscriptionMatch[1], "الاشتراك");
    if (subscriptionMatch[2]) {
      if (method !== "POST") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
      else sendJson(res, 200, { subscription: await renewSubscription(subscriptionId, await readJson(req, 32 * 1024)) });
    } else if (method === "PATCH") sendJson(res, 200, { subscription: await saveSubscription(subscriptionId, await readJson(req, 32 * 1024)) });
    else if (method === "DELETE") sendJson(res, 200, { subscription: await cancelSubscription(subscriptionId) });
    else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (driverMatch) {
    if (method !== "DELETE") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    else {
      const permanent = url.searchParams.get("permanent") === "true";
      if (permanent) {
        sendJson(res, 200, { driver: await deleteDriverPermanently(id(driverMatch[1], "السائق")) });
      } else {
        sendJson(res, 200, { driver: await deactivateDriver(id(driverMatch[1], "السائق")) });
      }
    }
    return true;
  }
  if (settingsRoute) {
    if (method === "GET") sendJson(res, 200, { settings: await settings(session.ownerId) });
    else if (method === "PATCH") {
      const input = await readJson(req, 32 * 1024);
      only(input, ["dispatchTimeoutMinutes"], "الإعدادات");
      const minutes = input.dispatchTimeoutMinutes;
      if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 60) fail("مهلة توزيع الطلب يجب أن تكون بين 1 و60 دقيقة.");
      const updated = await pool.query(
        `UPDATE admin_settings SET dispatch_timeout_minutes=$1,updated_at=now()
          WHERE id=1 RETURNING dispatch_timeout_minutes`,
        [minutes]
      );
      if (!updated.rows[0]) fail("إعدادات الإدارة غير مهيأة. طبّق server/migrations/002_admin_settings.sql.", 503);
      sendJson(res, 200, { settings: await settings(session.ownerId) });
    } else sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    return true;
  }
  if (credentialsRoute) {
    if (method !== "POST") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
    else {
      const input = await readJson(req, 32 * 1024);
      only(input, ["currentPassword", "newUsername", "newPassword"], "بيانات الاعتماد");
      if (typeof input.currentPassword !== "string" || !input.currentPassword) fail("كلمة المرور الحالية مطلوبة.");
      if (!Object.hasOwn(input, "newUsername") && !Object.hasOwn(input, "newPassword")) fail("أرسل اسم مستخدم جديداً أو كلمة مرور جديدة.");
      const credentials = { currentPassword: input.currentPassword };
      if (Object.hasOwn(input, "newUsername")) credentials.newUsername = text(input.newUsername, "اسم المستخدم", 80);
      if (Object.hasOwn(input, "newPassword")) {
        if (typeof input.newPassword !== "string" || input.newPassword.length < 12 || input.newPassword.length > 200) fail("كلمة المرور الجديدة يجب أن تتكون من 12 حرفاً على الأقل.");
        credentials.newPassword = input.newPassword;
      }
      sendJson(res, 200, await updateAdminCredentials(req, session.ownerId, credentials));
    }
    return true;
  }
  return false;
}