import { createHash, randomInt, randomUUID } from "node:crypto";
import { pool, withTransaction } from "./db.mjs";
import { kickDispatch, reconcileEmailDelivery } from "./dispatch.mjs";
import { handleAdminManagement } from "./admin-management.mjs";
import { handleGmailOAuthRoutes } from "./gmail-oauth.mjs";
import { handleDriverGmailRoutes } from "./driver-gmail.mjs";
import { buildOrderInvoice } from "./invoice.mjs";
import {
  AuthError,
  createRestaurantAccountSerial,
  ensureRestaurantAccountSerials,
  loginAdmin,
  loginDriver,
  loginRestaurant,
  readRestaurantAccountSerial,
  regenerateRestaurantAccountSerial,
  revokeSession,
  requireSession
} from "./auth.mjs";
import {
  StatsError,
  getAdminRestaurantRevenues,
  getAdminStats,
  getDriverOrders,
  getDriverStats,
  parseStatsFilters
} from "./stats.mjs";

const MAX_JSON_BYTES = 256 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVER_ATTEMPT_STATUSES = new Set([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "TIMEOUT",
  "CANCELLED"
]);
const RECONCILABLE_DELIVERY_STATUSES = new Set(["SENDING", "FAILED"]);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, value) {
  if (res.writableEnded) return;
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(payload);
}

async function readJson(req, maxBytes = MAX_JSON_BYTES) {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength > maxBytes) {
    req.resume();
    throw new ApiError(413, "حجم البيانات أكبر من المسموح.");
  }
  if (!String(req.headers["content-type"] || "")
    .toLowerCase()
    .startsWith("application/json")) {
    req.resume();
    throw new ApiError(415, "يجب إرسال البيانات بصيغة JSON.");
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        req.resume();
        reject(new ApiError(413, "حجم البيانات أكبر من المسموح."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        reject(new ApiError(400, "جسم الطلب مطلوب."));
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          reject(new ApiError(400, "جسم الطلب يجب أن يكون كائناً JSON."));
          return;
        }
        resolve(value);
      } catch {
        reject(new ApiError(400, "تعذر قراءة بيانات JSON."));
      }
    });
    req.on("error", () => {
      if (settled) return;
      settled = true;
      reject(new ApiError(400, "تعذر قراءة جسم الطلب."));
    });
  });
}

function requiredText(value, label, maxLength, { minLength = 1 } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} مطلوب.`);
  }
  const result = value.trim();
  if (result.length < minLength || result.length > maxLength) {
    throw new ApiError(400, `${label} غير صالح.`);
  }
  return result;
}

function optionalText(value, label, maxLength) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ApiError(400, `${label} غير صالح.`);
  }
  return value.trim();
}

function positiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${label} غير صالح.`);
  }
  return parsed;
}

function optionalBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${label} يجب أن يكون true أو false.`);
  }
  return value;
}

function validEmail(value) {
  const email = requiredText(value, "البريد الإلكتروني", 254);
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "البريد الإلكتروني غير صالح.");
  }
  return email.toLowerCase();
}

function readIdempotencyKey(req) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !UUID_PATTERN.test(key)) {
    throw new ApiError(400, "مفتاح Idempotency-Key بصيغة UUID مطلوب.");
  }
  return key.toLowerCase();
}

function parseDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} يجب أن يكون بالتنسيق YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${label} غير صالح.`);
  }
  return value;
}

function lyD(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(400, "السعر في قائمة المنتجات غير صالح.");
  }
  return (Math.round((amount + Number.EPSILON) * 1000) / 1000).toFixed(3);
}

function isRestaurantOpen(row) {
  if (row.status !== "ACTIVE") return false;
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const open = (row.opening_time || '08:00:00').slice(0, 5);
  const close = (row.closing_time || '22:00:00').slice(0, 5);
  if (open <= close) {
    return currentTimeStr >= open && currentTimeStr < close;
  } else {
    return currentTimeStr >= open || currentTimeStr < close;
  }
}

function mapRestaurant(row) {
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
    isOpen: isRestaurantOpen(row),
    status: row.status || "ACTIVE"
  };
}

function mapProduct(row) {
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

function mapSubscription(row) {
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurant_id),
    restaurantName: row.restaurant_name || "",
    planName: row.plan || "",
    plan: row.plan || "",
    status: row.status,
    startDate: dateOnly(row.start_date),
    expiryDate: dateOnly(row.expiry_date),
    renewalDate: row.expiry_date instanceof Date
      ? row.expiry_date.toISOString().slice(0, 10)
      : String(row.expiry_date || "").slice(0, 10)
  };
}

function dateOnly(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value || "").slice(0, 10);
}

function mapDriver(row) {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    serialNumber: row.serial_number || "",
    restaurantId: Number(row.restaurant_id),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    locationUpdatedAt: row.location_updated_at ? new Date(row.location_updated_at).toISOString() : null,
    isActive: Boolean(row.is_active) && row.status === "ACTIVE",
    status: row.status || "INACTIVE"
  };
}

function sanitizeDeliveryError(value) {
  if (value == null || value === "") return null;
  let message = String(value).replace(/[\r\n\t]+/g, " ");
  for (const key of [
    "SMTP_PASS",
    "SMTP_USER",
    "DATABASE_URL",
    "EXTERNAL_DATABASE_URL",
    "SESSION_SECRET"
  ]) {
    const secret = process.env[key];
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message
    .replace(/([?&]token=)[^&\s]+/gi, "[redacted token]")
    .replace(/\btoken\s*[:=]\s*[^&\s]+/gi, "[redacted token]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[redacted]")
    .slice(0, 1000);
}

function mapEmailDelivery(row) {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    assignmentId: Number(row.assignment_id),
    driverId: Number(row.driver_id),
    driverEmail: row.driver_email,
    status: row.status,
    sentAt: row.sent_at,
    lastAttemptAt: row.last_attempt_at,
    nextRetryAt: row.next_retry_at,
    error: sanitizeDeliveryError(row.error),
    retryCount: Number(row.retry_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrder(row, items = []) {
  return buildOrderInvoice(
    row,
    { name: row.restaurant_name || "" },
    items,
    row.assignment_status || null
  );
}

async function loadOrder(client, id) {
  const result = await client.query(
    `SELECT o.*, r.name AS restaurant_name,
            last_attempt.status AS assignment_status,
            cancellation.note AS cancellation_reason,
            cancellation.created_at AS cancellation_at
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN LATERAL (
         SELECT a.status
           FROM order_driver_attempts a
          WHERE a.order_id = o.id
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1
       ) last_attempt ON TRUE
        LEFT JOIN LATERAL (
          SELECT h.note, h.created_at
            FROM order_status_history h
           WHERE h.order_id = o.id AND h.status = 'CANCELLED'
           ORDER BY h.created_at DESC, h.id DESC
           LIMIT 1
        ) cancellation ON o.status = 'CANCELLED'
      WHERE o.id = $1
      LIMIT 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;

  const itemResult = await client.query(
    `SELECT oi.product_id, oi.product_name, oi.quantity, oi.unit_price,
            oi.subtotal, oi.size_name,
            COALESCE(addon_rows.addons, '[]'::json) AS addons
       FROM order_items oi
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'addonName', ia.addon_name,
                  'price', ia.price
                ) ORDER BY ia.id) AS addons
           FROM order_item_addons ia
          WHERE ia.order_item_id = oi.id
       ) addon_rows ON TRUE
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
    [id]
  );
  const items = itemResult.rows.map((item) => ({
    productId: Number(item.product_id),
    productName: item.product_name,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    subtotal: Number(item.subtotal),
    selectedSize: item.size_name || null,
    addons: item.addons || []
  }));
  return mapOrder(row, items);
}

async function getCatalog() {
  const restaurantsResult = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.address, r.description, r.status,
            r.logo_url, r.cover_url, r.delivery_fee, r.latitude, r.longitude,
            r.opening_time, r.closing_time
       FROM restaurants r
      WHERE r.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1
            FROM subscriptions s
           WHERE s.restaurant_id = r.id
             AND s.status = 'ACTIVE'
             AND s.start_date <= CURRENT_DATE
             AND s.expiry_date >= CURRENT_DATE
        )
      ORDER BY r.name, r.id`
  );
  const restaurantIds = restaurantsResult.rows.map((row) => Number(row.id));
  if (!restaurantIds.length) {
    return { restaurants: [], products: [], subscriptions: [] };
  }

  const [productsResult, subscriptionsResult] = await Promise.all([
    pool.query(
      `SELECT p.id, p.restaurant_id, p.category_id, p.name, p.name_ar,
              p.description, p.description_ar, p.image_url, p.price,
              p.is_available, p.stock_quantity,
              c.name AS category, c.name_ar AS category_ar, c.is_available AS category_is_available
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.restaurant_id = ANY($1::int[])
          AND p.is_available = TRUE
          AND COALESCE(c.is_available, TRUE) = TRUE
        ORDER BY p.sort_order, p.id`,
      [restaurantIds]
    ),
    pool.query(
      `SELECT s.id, s.restaurant_id, s.plan, s.status, s.start_date, s.expiry_date,
              r.name AS restaurant_name
         FROM subscriptions s
         JOIN restaurants r ON r.id = s.restaurant_id
        WHERE s.restaurant_id = ANY($1::int[])
          AND s.status = 'ACTIVE'
          AND s.start_date <= CURRENT_DATE
          AND s.expiry_date >= CURRENT_DATE
        ORDER BY r.name, s.id`,
      [restaurantIds]
    )
  ]);
  return {
    restaurants: restaurantsResult.rows.map(mapRestaurant),
    products: productsResult.rows.map(mapProduct),
    subscriptions: subscriptionsResult.rows.map(mapSubscription)
  };
}

function normalizeOrderInput(input) {
  const restaurantId = positiveInt(input.restaurantId, "المطعم");
  const customerName = requiredText(input.customerName, "اسم الزبون", 120);
  const customerPhone = requiredText(input.customerPhone, "رقم الهاتف", 40, {
    minLength: 3
  });
  const orderType = typeof input.orderType === "string"
    ? input.orderType.trim().toUpperCase()
    : "";
  if (!["DELIVERY", "RESERVATION"].includes(orderType)) {
    throw new ApiError(400, "نوع الطلب غير مدعوم.");
  }
  const notes = optionalText(input.notes, "ملاحظات الطلب", 2000);

  let latitude = null;
  let longitude = null;
  let reservationDate = null;
  let reservationTime = null;
  let partySize = null;
  if (orderType === "DELIVERY") {
    if (
      typeof input.latitude !== "number" ||
      typeof input.longitude !== "number" ||
      !Number.isFinite(input.latitude) ||
      !Number.isFinite(input.longitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new ApiError(400, "موقع التوصيل مطلوب ويجب أن يحتوي على إحداثيات صحيحة.");
    }
    latitude = input.latitude;
    longitude = input.longitude;
  } else {
    reservationDate = parseDate(input.reservationDate, "تاريخ الحجز");
    if (
      typeof input.reservationTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reservationTime)
    ) {
      throw new ApiError(400, "وقت الحجز مطلوب ويجب أن يكون بالتنسيق HH:MM.");
    }
    reservationTime = input.reservationTime;
    partySize = positiveInt(input.partySize, "عدد الأشخاص");
    if (partySize > 100) {
      throw new ApiError(400, "عدد الأشخاص يتجاوز الحد المسموح.");
    }
  }

  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
    throw new ApiError(400, "يجب أن يحتوي الطلب على منتجات صالحة.");
  }
  const items = input.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, "أحد عناصر الطلب غير صالح.");
    }
    const productId = positiveInt(item.productId, "المنتج");
    const quantity = positiveInt(item.quantity, "الكمية");
    if (quantity > 99) {
      throw new ApiError(400, "الكمية تتجاوز الحد المسموح.");
    }
    const selectedSize = optionalText(item.selectedSize, "الحجم", 80);
    const extraPrice = item.extraPrice == null ? 0 : Number(item.extraPrice);
    if (!Number.isFinite(extraPrice) || extraPrice < 0) {
      throw new ApiError(400, "السعر الإضافي غير صالح.");
    }
    if (!selectedSize && extraPrice !== 0) {
      throw new ApiError(400, "السعر الإضافي غير مدعوم؛ اختر حجماً مسجلاً في قائمة المطعم.");
    }
    return { productId, quantity, selectedSize, extraPrice };
  });
  return {
    restaurantId,
    customerName,
    customerPhone,
    orderType,
    latitude,
    longitude,
    reservationDate,
    reservationTime,
    partySize,
    notes,
    items
  };
}

function hashOrderPayload(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function assertMatchingOrderPayload(row, payloadHash) {
  if (row.client_request_hash !== payloadHash) {
    throw new ApiError(409, "مفتاح Idempotency-Key مستخدم لبيانات طلب مختلفة.");
  }
}

async function createOrder(input, idempotencyKey) {
  const data = normalizeOrderInput(input);
  const payloadHash = hashOrderPayload(data);
  return withTransaction(async (client) => {
    const prior = await client.query(
      `SELECT id, client_request_hash
         FROM orders
        WHERE source = 'ANDROID_CUSTOMER'
          AND client_request_id = $1::uuid
        LIMIT 1`,
      [idempotencyKey]
    );
    if (prior.rows[0]) {
      assertMatchingOrderPayload(prior.rows[0], payloadHash);
      const existing = await loadOrder(client, Number(prior.rows[0].id));
      return { order: existing, created: false };
    }

    const restaurantResult = await client.query(
      `SELECT r.id, r.name, r.delivery_fee, r.opening_time, r.closing_time, r.status
         FROM restaurants r
         JOIN subscriptions s ON s.restaurant_id = r.id
        WHERE r.id = $1
          AND r.status = 'ACTIVE'
          AND s.status = 'ACTIVE'
          AND s.start_date <= CURRENT_DATE
          AND s.expiry_date >= CURRENT_DATE
        LIMIT 1
        FOR SHARE OF r, s`,
      [data.restaurantId]
    );
    const restaurant = restaurantResult.rows[0];
    if (!restaurant) {
      throw new ApiError(409, "المطعم غير متاح أو لا يملك عضوية نشطة.");
    }
    const open = (restaurant.opening_time || '08:00:00').slice(0, 5);
    const close = (restaurant.closing_time || '22:00:00').slice(0, 5);
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const isOpen = open <= close ? (currentTimeStr >= open && currentTimeStr < close) : (currentTimeStr >= open || currentTimeStr < close);
    if (!isOpen) {
      throw new ApiError(409, "المطعم مغلق حالياً ولا يمكن استقبال طلبات في هذا الوقت.");
    }
    if (data.reservationDate) {
      const validDate = await client.query(
        "SELECT $1::date >= CURRENT_DATE AS valid",
        [data.reservationDate]
      );
      if (!validDate.rows[0]?.valid) {
        throw new ApiError(400, "تاريخ الحجز لا يمكن أن يكون في الماضي.");
      }
    }

    const productIds = [...new Set(data.items.map((item) => item.productId))];
    const productsResult = await client.query(
      `SELECT p.id, p.restaurant_id, p.name, p.name_ar, p.price,
              p.is_available, p.stock_quantity
         FROM products p
         JOIN categories c ON c.id=p.category_id AND COALESCE(c.is_available,TRUE)=TRUE
        WHERE p.id = ANY($1::int[])
          AND p.restaurant_id = $2
          AND p.is_available = TRUE
        FOR SHARE`,
      [productIds, data.restaurantId]
    );
    const products = new Map(
      productsResult.rows.map((product) => [Number(product.id), product])
    );
    if (products.size !== productIds.length) {
      throw new ApiError(409, "يوجد منتج غير متاح أو لا يتبع المطعم المحدد.");
    }

    const quantityByProduct = new Map();
    for (const item of data.items) {
      quantityByProduct.set(
        item.productId,
        (quantityByProduct.get(item.productId) || 0) + item.quantity
      );
    }
    for (const [productId, quantity] of quantityByProduct) {
      const product = products.get(productId);
      if (product.stock_quantity != null && quantity > Number(product.stock_quantity)) {
        throw new ApiError(409, "كمية أحد المنتجات غير متوفرة حالياً.");
      }
    }

    const pricedItems = [];
    let subtotalMilli = 0;
    for (const item of data.items) {
      const product = products.get(item.productId);
      let unitPrice = Number(product.price);
      let sizeId = null;
      let sizeName = null;
      if (item.selectedSize) {
        const sizeResult = await client.query(
          `SELECT id, name, name_ar, price
             FROM product_sizes
            WHERE product_id = $1
              AND is_available = TRUE
              AND (LOWER(name) = LOWER($2) OR LOWER(name_ar) = LOWER($2))
            LIMIT 1`,
          [item.productId, item.selectedSize]
        );
        const size = sizeResult.rows[0];
        if (!size) {
          throw new ApiError(409, "الحجم المحدد غير متاح لهذا المنتج.");
        }
        unitPrice = Number(size.price);
        sizeId = Number(size.id);
        sizeName = size.name_ar || size.name;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new ApiError(409, "سعر أحد المنتجات غير صالح.");
      }
      const unitMilli = Math.round((unitPrice + Number.EPSILON) * 1000);
      subtotalMilli += unitMilli * item.quantity;
      pricedItems.push({
        ...item,
        productName: product.name_ar || product.name,
        unitMilli,
        sizeId,
        sizeName
      });
    }

    const subtotal = (subtotalMilli / 1000).toFixed(3);
    const deliveryFee = data.orderType === "DELIVERY"
      ? lyD(restaurant.delivery_fee)
      : "0.000";
    const totalAmount = (
      subtotalMilli + Math.round(Number(deliveryFee) * 1000)
    );
    const mapsUrl = data.orderType === "DELIVERY"
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${data.latitude},${data.longitude}`)}`
      : null;

    const inserted = await client.query(
      `INSERT INTO orders (
         restaurant_id, customer_name, customer_phone, notes,
         latitude, longitude, maps_url, subtotal, delivery_fee,
         total_amount, status, order_type, source, reservation_date,
          reservation_time, party_size, client_request_id, client_request_hash
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric,
         $10::numeric, 'NEW', $11, 'ANDROID_CUSTOMER', $12::date,
          $13::time, $14, $15::uuid, $16
       )
       ON CONFLICT (source, client_request_id)
         WHERE client_request_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        data.restaurantId,
        data.customerName,
        data.customerPhone,
        data.notes,
        data.latitude,
        data.longitude,
        mapsUrl,
        subtotal,
        deliveryFee,
        (totalAmount / 1000).toFixed(3),
        data.orderType,
        data.reservationDate,
        data.reservationTime,
        data.partySize,
        idempotencyKey,
        payloadHash
      ]
    );
    if (!inserted.rows[0]) {
      const duplicate = await client.query(
        `SELECT id, client_request_hash
           FROM orders
          WHERE source = 'ANDROID_CUSTOMER'
            AND client_request_id = $1::uuid
          LIMIT 1`,
        [idempotencyKey]
      );
      if (!duplicate.rows[0]) {
        throw new ApiError(409, "تعذر إتمام الطلب. أعد المحاولة بمفتاح جديد.");
      }
      assertMatchingOrderPayload(duplicate.rows[0], payloadHash);
      return {
        order: await loadOrder(client, Number(duplicate.rows[0].id)),
        created: false
      };
    }

    const orderId = Number(inserted.rows[0].id);
    for (const item of pricedItems) {
      const itemSubtotal = (item.unitMilli * item.quantity / 1000).toFixed(3);
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, product_name, quantity,
           unit_price, subtotal, size_id, size_name
         )
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8)`,
        [
          orderId,
          item.productId,
          item.productName,
          item.quantity,
          (item.unitMilli / 1000).toFixed(3),
          itemSubtotal,
          item.sizeId,
          item.sizeName
        ]
      );
    }
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'NEW', 'Order saved from Android customer app')`,
      [orderId]
    );
    await client.query(
      `INSERT INTO order_email_dispatch_jobs (order_id, state, created_at, updated_at)
       VALUES ($1, 'ACTIVE', NOW(), NOW())`,
      [orderId]
    );
    return { order: await loadOrder(client, orderId), created: true };
  });
}

function routeFailureStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.code === "23505") return 409;
  if (error?.code === "23503" || error?.code === "23514") return 400;
  if (error?.code === "42P01" || error?.code === "42703") return 503;
  return 500;
}

function routeFailureMessage(error, status) {
  if (error instanceof ApiError || error instanceof AuthError || error instanceof StatsError) {
    return error.message;
  }
  if (Number.isInteger(error?.status) && status < 500 && typeof error.message === "string") {
    return error.message;
  }
  if (error?.code === "42P01" || error?.code === "42703") {
    return "تحديث قاعدة البيانات المطلوب غير مطبق بعد. تحقّق من ترحيلات server/migrations.";
  }
  if (status === 409) return "توجد بيانات متعارضة. تحقق من الطلب وأعد المحاولة.";
  if (status === 400) return "البيانات المرسلة غير صالحة.";
  if (status === 503) return "تحديث قاعدة البيانات المطلوب غير مطبق بعد.";
  return "تعذر إكمال الطلب بسبب خطأ داخلي.";
}

function mapDatabaseError(error) {
  const status = routeFailureStatus(error);
  return {
    status,
    message: routeFailureMessage(error, status)
  };
}

async function handleCreateOrder(req, res) {
  const input = await readJson(req);
  const result = await createOrder(input, readIdempotencyKey(req));
  if (result.created) {
    Promise.resolve()
      .then(() => kickDispatch())
      .catch(() => {
        // The committed dispatch job remains durable for the backend worker.
      });
  }
  sendJson(res, result.created ? 201 : 200, { order: result.order });
}

async function listAdminOrders(limit = 250, restaurantId = null) {
  const result = await pool.query(
    `SELECT o.*, r.name AS restaurant_name,
            last_attempt.status AS assignment_status,
            cancellation.note AS cancellation_reason,
            cancellation.created_at AS cancellation_at,
            COALESCE(order_lines.items, '[]'::json) AS items
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN LATERAL (
         SELECT a.status
           FROM order_driver_attempts a
          WHERE a.order_id = o.id
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1
       ) last_attempt ON TRUE
       LEFT JOIN LATERAL (
         SELECT h.note, h.created_at
           FROM order_status_history h
          WHERE h.order_id = o.id AND h.status = 'CANCELLED'
          ORDER BY h.created_at DESC, h.id DESC
          LIMIT 1
       ) cancellation ON o.status = 'CANCELLED'
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'productId', oi.product_id,
           'productName', oi.product_name,
           'quantity', oi.quantity,
           'unitPrice', oi.unit_price,
           'subtotal', oi.subtotal,
            'selectedSize', oi.size_name,
            'addons', COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'addonName', ia.addon_name,
                 'price', ia.price
               ) ORDER BY ia.id)
                 FROM order_item_addons ia
                WHERE ia.order_item_id = oi.id),
              '[]'::json
            )
         ) ORDER BY oi.id) AS items
           FROM order_items oi
          WHERE oi.order_id = o.id
       ) order_lines ON TRUE
      WHERE ($2::integer IS NULL OR o.restaurant_id = $2)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $1`,
    [limit, restaurantId]
  );
  return result.rows.map((row) => mapOrder(row, row.items || []));
}

async function getRestaurantPortal(restaurantId) {
  const [restaurantResult, orders, totalsResult] = await Promise.all([
    pool.query(
      `SELECT id, name, phone, address, status
         FROM restaurants
        WHERE id=$1
        LIMIT 1`,
      [restaurantId]
    ),
    listAdminOrders(500, restaurantId),
    pool.query(
      `SELECT COUNT(*)::integer AS total_orders,
              COUNT(*) FILTER (WHERE is_archived=FALSE)::integer AS active_orders,
              COUNT(*) FILTER (WHERE is_archived=TRUE)::integer AS archived_orders,
              COUNT(*) FILTER (WHERE status<>'CANCELLED')::integer AS payable_orders,
              COALESCE(SUM(total_amount) FILTER (WHERE status<>'CANCELLED'), 0)::numeric AS revenue
         FROM orders
        WHERE restaurant_id=$1`,
      [restaurantId]
    )
  ]);
  const restaurant = restaurantResult.rows[0];
  if (!restaurant) throw new AuthError(404, "المطعم غير موجود.");
  const totals = totalsResult.rows[0];
  return {
    restaurant: {
      id: Number(restaurant.id),
      name: restaurant.name,
      phone: restaurant.phone || "",
      address: restaurant.address || ""
    },
    orders,
    summary: {
      totalOrders: Number(totals.total_orders),
      activeOrders: Number(totals.active_orders),
      archivedOrders: Number(totals.archived_orders),
      payableOrders: Number(totals.payable_orders),
      revenue: Number(totals.revenue)
    }
  };
}

async function listAdminDrivers() {
  const result = await pool.query(
    `SELECT d.id, d.restaurant_id, d.name, d.phone, d.email, d.status, d.is_active, d.serial_number,
            d.latitude, d.longitude, d.location_updated_at
       FROM drivers d
      ORDER BY d.created_at DESC, d.id DESC`
  );
  return result.rows.map(mapDriver);
}

async function listRestaurants({ activeOnly = false } = {}) {
  const result = await pool.query(
    `SELECT r.id, r.name, r.slug, r.phone, r.address, r.description, r.status,
            r.logo_url, r.cover_url, r.delivery_fee, r.latitude, r.longitude,
            r.opening_time, r.closing_time
       FROM restaurants r
      ${activeOnly ? "WHERE r.status = 'ACTIVE'" : ""}
      ORDER BY r.name, r.id`
  );
  return result.rows.map(mapRestaurant);
}

async function listAdminSubscriptions() {
  const result = await pool.query(
    `SELECT s.id, s.restaurant_id, s.plan, s.status, s.start_date, s.expiry_date,
            r.name AS restaurant_name
       FROM subscriptions s
       JOIN restaurants r ON r.id = s.restaurant_id
      ORDER BY s.expiry_date DESC, s.id DESC`
  );
  return result.rows.map(mapSubscription);
}

async function listAdminEmailDeliveries(status) {
  const result = await pool.query(
    `SELECT id, order_id, assignment_id, driver_id, driver_email, status,
            sent_at, last_attempt_at, next_retry_at, error, retry_count,
            created_at, updated_at
       FROM order_email_deliveries
      WHERE status = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 500`,
    [status]
  );
  return result.rows.map(mapEmailDelivery);
}

async function getAdminOverview() {
  const filters = {
    from: null,
    to: null,
    status: null,
    period: "month",
    restaurantId: null,
    driverId: null
  };
  const [orders, drivers, subscriptions, restaurants, stats] = await Promise.all([
    listAdminOrders(),
    listAdminDrivers(),
    listAdminSubscriptions(),
    listRestaurants(),
    getAdminStats(filters)
  ]);
  return { orders, drivers, subscriptions, restaurants, stats };
}

async function ensureUniqueDriverEmail(client, email, ignoredId = null) {
  const values = [email];
  const ignoreClause = ignoredId == null ? "" : "AND id <> $2";
  if (ignoredId != null) values.push(ignoredId);
  const found = await client.query(
    `SELECT id
       FROM drivers
      WHERE LOWER(email) = LOWER($1)
        AND email IS NOT NULL
        ${ignoreClause}
      LIMIT 1`,
    values
  );
  if (found.rows.length) {
    throw new ApiError(409, "هذا البريد الإلكتروني مستخدم لسائق آخر.");
  }
}

async function createDriver(input) {
  const name = requiredText(input.name, "اسم السائق", 120);
  const phone = requiredText(input.phone, "رقم الهاتف", 40, { minLength: 3 });
  const email = validEmail(input.email);
  const restaurantId = positiveInt(input.restaurantId, "المطعم");
  const isActive = input.isActive == null ? true : optionalBoolean(input.isActive, "الحالة");

  return withTransaction(async (client) => {
    await client.query("LOCK TABLE drivers IN SHARE ROW EXCLUSIVE MODE");
    const restaurant = await client.query(
      "SELECT id FROM restaurants WHERE id = $1 LIMIT 1",
      [restaurantId]
    );
    if (!restaurant.rows[0]) {
      throw new ApiError(404, "المطعم المحدد غير موجود.");
    }
    await ensureUniqueDriverEmail(client, email);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const serialNumber = String(randomInt(100000, 1000000));
      const inserted = await client.query(
        `INSERT INTO drivers (
           restaurant_id, name, phone, email, is_active, status, serial_number
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (serial_number) DO NOTHING
         RETURNING id, restaurant_id, name, phone, email, status, is_active`,
        [
          restaurantId,
          name,
          phone,
          email,
          isActive,
          isActive ? "ACTIVE" : "INACTIVE",
          serialNumber
        ]
      );
      if (inserted.rows[0]) {
        return {
          driver: mapDriver(inserted.rows[0]),
          serialNumber
        };
      }
    }
    throw new ApiError(503, "تعذر إنشاء رقم تعريف فريد للسائق.");
  });
}

async function updateDriver(id, input) {
  const driverId = positiveInt(id, "السائق");
  const allowed = new Set(["name", "phone", "email", "restaurantId", "isActive"]);
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !allowed.has(key))) {
    throw new ApiError(400, "حقول تحديث السائق غير صالحة.");
  }

  const updates = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  };
  if (Object.hasOwn(input, "name")) add("name", requiredText(input.name, "اسم السائق", 120));
  if (Object.hasOwn(input, "phone")) {
    add("phone", requiredText(input.phone, "رقم الهاتف", 40, { minLength: 3 }));
  }
  if (Object.hasOwn(input, "email")) add("email", validEmail(input.email));
  if (Object.hasOwn(input, "restaurantId")) {
    const restaurantId = positiveInt(input.restaurantId, "المطعم");
    const found = await pool.query("SELECT id FROM restaurants WHERE id = $1 LIMIT 1", [restaurantId]);
    if (!found.rows[0]) throw new ApiError(404, "المطعم المحدد غير موجود.");
    add("restaurant_id", restaurantId);
  }
  if (Object.hasOwn(input, "isActive")) {
    const isActive = optionalBoolean(input.isActive, "الحالة");
    add("is_active", isActive);
    add("status", isActive ? "ACTIVE" : "INACTIVE");
  }
  if (!updates.length) throw new ApiError(400, "لم يتم إرسال حقول لتحديثها.");

  return withTransaction(async (client) => {
    await client.query("LOCK TABLE drivers IN SHARE ROW EXCLUSIVE MODE");
    const current = await client.query(
      "SELECT id, email FROM drivers WHERE id = $1 FOR UPDATE",
      [driverId]
    );
    if (!current.rows[0]) throw new ApiError(404, "السائق غير موجود.");
    if (Object.hasOwn(input, "email")) {
      await ensureUniqueDriverEmail(client, validEmail(input.email), driverId);
    }
    if (
      input.isActive === true &&
      !Object.hasOwn(input, "email") &&
      !current.rows[0].email
    ) {
      throw new ApiError(400, "أضف بريداً إلكترونياً صالحاً قبل تفعيل السائق.");
    }

    values.push(driverId);
    const result = await client.query(
      `UPDATE drivers
          SET ${updates.join(", ")}
        WHERE id = $${values.length}
        RETURNING id, restaurant_id, name, phone, email, status, is_active, serial_number`,
      values
    );
    return mapDriver(result.rows[0]);
  });
}

function slugBase(value) {
  const normalized = value.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || `restaurant-${randomUUID().slice(0, 8)}`;
}

async function createRestaurant(input) {
  const name = requiredText(input.name, "اسم المطعم", 160);
  const phone = requiredText(input.phone, "رقم الهاتف", 40, { minLength: 3 });
  const address = requiredText(input.address, "العنوان", 300);
  const description = optionalText(input.description, "الوصف", 1500) || "";
  const imageUrl = input.imageUrl ? String(input.imageUrl).trim() : (input.logoUrl ? String(input.logoUrl).trim() : "");
  const deliveryFee = input.deliveryFee != null ? Math.max(0, Number(input.deliveryFee) || 0) : 0;
  const lat = input.latitude == null || input.latitude === "" ? null : Number(input.latitude);
  const latitude = (lat != null && Number.isFinite(lat) && lat >= -90 && lat <= 90) ? lat : null;
  const lng = input.longitude == null || input.longitude === "" ? null : Number(input.longitude);
  const longitude = (lng != null && Number.isFinite(lng) && lng >= -180 && lng <= 180) ? lng : null;
  const openingTime = input.openingTime ? String(input.openingTime).trim() : '08:00';
  const closingTime = input.closingTime ? String(input.closingTime).trim() : '22:00';
  const base = slugBase(name);

  return withTransaction(async (client) => {
    let slug = base;
    for (let index = 0; index < 8; index += 1) {
      const exists = await client.query("SELECT 1 FROM restaurants WHERE slug = $1 LIMIT 1", [slug]);
      if (!exists.rows[0]) break;
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }
    const inserted = await client.query(
      `INSERT INTO restaurants (name, slug, phone, address, description, logo_url, cover_url, delivery_fee, latitude, longitude, opening_time, closing_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10::time, $11::time, 'ACTIVE')
       RETURNING id, name, slug, phone, address, description,
                 logo_url, cover_url, delivery_fee, latitude, longitude, opening_time, closing_time, status`,
      [name, slug, phone, address, description, imageUrl, deliveryFee, latitude, longitude, openingTime, closingTime]
    );
    const accountSerialNumber = await createRestaurantAccountSerial(
      client,
      Number(inserted.rows[0].id)
    );
    return { restaurant: mapRestaurant(inserted.rows[0]), accountSerialNumber };
  });
}

async function completeDriverOrder(driverId, orderId) {
  const id = positiveInt(orderId, "الطلب");
  const result = await withTransaction(async (client) => {
    const found = await client.query(
      `SELECT id, driver_id, status
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [id]
    );
    const order = found.rows[0];
    if (!order || Number(order.driver_id) !== driverId) {
      throw new ApiError(404, "الطلب غير موجود في سجل هذا السائق.");
    }
    if (["COMPLETED", "DELIVERED"].includes(order.status)) {
      return { orderId: id, changed: false };
    }
    if (!["CONFIRMED", "ACCEPTED"].includes(order.status)) {
      throw new ApiError(409, "لا يمكن إكمال طلب لم يقبله هذا السائق.");
    }

    await client.query(
      `UPDATE orders
          SET status = 'COMPLETED',
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [id]
    );
    await client.query(
      "UPDATE drivers SET total_deliveries = total_deliveries + 1 WHERE id = $1",
      [driverId]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note)
       VALUES ($1, 'COMPLETED', 'Completed by the assigned driver')`,
      [id]
    );
    return { orderId: id, changed: true };
  });
  const order = await loadOrder(pool, result.orderId);
  return { order };
}

async function cancelAdminOrder(orderId, reason) {
  const id = positiveInt(orderId, "الطلب");
  const cancellationReason = requiredText(reason, "سبب الإلغاء", 500, { minLength: 3 });
  const result = await withTransaction(async (client) => {
    // Match the dispatcher and driver-response lock order to prevent stale accepts.
    await client.query(
      "SELECT order_id FROM order_email_dispatch_jobs WHERE order_id=$1 FOR UPDATE",
      [id]
    );
    const order = (await client.query(
      "SELECT id,status FROM orders WHERE id=$1 FOR UPDATE",
      [id]
    )).rows[0];
    if (!order) throw new ApiError(404, "الطلب غير موجود.");
    if (order.status === "CANCELLED") {
      return { changed: false };
    }
    if (["COMPLETED", "DELIVERED"].includes(order.status)) {
      throw new ApiError(409, "لا يمكن إلغاء طلب مكتمل.");
    }

    await client.query(
      `UPDATE order_driver_attempts
          SET status='CANCELLED',responded_at=now(),response_at=now(),cancelled_at=now()
        WHERE order_id=$1 AND status='PENDING'`,
      [id]
    );
    await client.query(
      `UPDATE order_email_dispatch_jobs
          SET state='DONE',updated_at=now()
        WHERE order_id=$1`,
      [id]
    );
    const cancelled = await client.query(
      `UPDATE orders
          SET status='CANCELLED',cancelled_at=now(),updated_at=now()
        WHERE id=$1 AND status NOT IN ('COMPLETED','DELIVERED','CANCELLED')
        RETURNING id`,
      [id]
    );
    if (!cancelled.rowCount) {
      throw new ApiError(409, "تغيّرت حالة الطلب. حدّث البيانات ثم أعد المحاولة.");
    }
    await client.query(
      `INSERT INTO order_status_history (order_id,status,note)
       VALUES ($1,'CANCELLED',$2)`,
      [id, cancellationReason]
    );
    return { changed: true };
  });
  return { ok: true, changed: result.changed, order: await loadOrder(pool, id) };
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "طريقة الطلب غير مدعومة." });
  return true;
}

async function routeApi(req, res, url) {
  const path = url.pathname;
  const method = req.method || "GET";

  if (await handleGmailOAuthRoutes(req, res, url, { sendJson })) return true;
  if (await handleDriverGmailRoutes(req, res, url, { sendJson })) return true;
  if (await handleAdminManagement(req, res, url, { readJson, sendJson })) return true;

  if (path.startsWith("/api/storage/db-images/")) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(res);
    const id = path.slice("/api/storage/db-images/".length);
    if (!UUID_PATTERN.test(id)) {
      sendJson(res, 404, { error: "IMAGE_NOT_FOUND" });
      return true;
    }
    // Only expose images belonging to public catalog items, not private driver uploads.
    const result = await pool.query(
      `SELECT b.data, b.content_type
         FROM talabat_image_blobs b
        WHERE b.id = $1
          AND b.content_type = 'image/webp'
          AND (
            (b.folder = 'restaurants' AND EXISTS (
              SELECT 1 FROM restaurants r WHERE r.logo_url = $2 OR r.cover_url = $2
            ))
            OR (b.folder = 'products' AND EXISTS (
              SELECT 1 FROM products p WHERE p.image_url = $2
            ))
          )
        LIMIT 1`,
      [id.toLowerCase(), `/api/storage/db-images/${id.toLowerCase()}`]
    );
    const image = result.rows[0];
    if (!image) {
      sendJson(res, 404, { error: "IMAGE_NOT_FOUND" });
      return true;
    }
    res.writeHead(200, {
      "content-type": image.content_type,
      "content-length": image.data.length,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff"
    });
    res.end(method === "HEAD" ? undefined : image.data);
    return true;
  }
  if (path === "/api/catalog") {
    if (method !== "GET") return methodNotAllowed(res);
    sendJson(res, 200, await getCatalog());
    return true;
  }
  if (path === "/api/orders") {
    if (method !== "POST") return methodNotAllowed(res);
    await handleCreateOrder(req, res);
    return true;
  }
  if (path === "/api/admin/login") {
    if (method !== "POST") return methodNotAllowed(res);
    const input = await readJson(req, 32 * 1024);
    const result = await loginAdmin(req, input.username, input.password);
    sendJson(res, 200, result);
    return true;
  }
  if (path === "/api/driver/login") {
    if (method !== "POST") return methodNotAllowed(res);
    const input = await readJson(req, 32 * 1024);
    const result = await loginDriver(req, input.serialNumber);
    sendJson(res, 200, result);
    return true;
  }
  if (path === "/api/restaurant/login") {
    if (method !== "POST") return methodNotAllowed(res);
    const input = await readJson(req, 1024);
    sendJson(res, 200, await loginRestaurant(req, input.serialNumber));
    return true;
  }
  if (path === "/api/restaurant/overview") {
    if (method !== "GET") return methodNotAllowed(res);
    const session = await requireSession(req, "restaurant");
    sendJson(res, 200, await getRestaurantPortal(session.restaurantId));
    return true;
  }
  if (path === "/api/restaurant/logout") {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "restaurant");
    await revokeSession(req);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (path === "/api/admin/overview") {
    if (method !== "GET") return methodNotAllowed(res);
    await requireSession(req, "admin");
    await ensureRestaurantAccountSerials();
    sendJson(res, 200, await getAdminOverview());
    return true;
  }
  if (path === "/api/admin/stats") {
    if (method !== "GET") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const filters = parseStatsFilters(url.searchParams);
    sendJson(res, 200, await getAdminStats(filters));
    return true;
  }
  if (path === "/api/admin/restaurant-revenues") {
    if (method !== "GET") return methodNotAllowed(res);
    await requireSession(req, "admin");
    sendJson(res, 200, await getAdminRestaurantRevenues(url.searchParams.get("date")));
    return true;
  }
  if (path === "/api/admin/email-deliveries") {
    if (method !== "GET") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const status = (url.searchParams.get("status") || "").trim().toUpperCase();
    if (!RECONCILABLE_DELIVERY_STATUSES.has(status)) {
      throw new ApiError(400, "حالة التسليم يجب أن تكون SENDING أو FAILED.");
    }
    sendJson(res, 200, { deliveries: await listAdminEmailDeliveries(status) });
    return true;
  }
  const reconcileDeliveryMatch = path.match(
    /^\/api\/admin\/email-deliveries\/(\d+)\/reconcile$/
  );
  if (reconcileDeliveryMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const input = await readJson(req, 32 * 1024);
    if (
      Object.keys(input).some((key) => key !== "result") ||
      !["NOT_SENT", "SENT"].includes(input.result)
    ) {
      throw new ApiError(400, "نتيجة المصالحة يجب أن تكون NOT_SENT أو SENT.");
    }
    const id = positiveInt(reconcileDeliveryMatch[1], "التسليم");
    const outcome = await reconcileEmailDelivery({ id, result: input.result });
    if (!outcome?.ok) {
      const missing = outcome?.reason === "Delivery not found";
      sendJson(res, missing ? 404 : 409, {
        error: missing ? "DELIVERY_NOT_FOUND" : "RECONCILIATION_CONFLICT",
        message: missing
          ? "سجل التسليم غير موجود."
          : "حالة التسليم لا تسمح بإجراء المصالحة الآن."
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      delivery: {
        id,
        status: input.result === "SENT" ? "SENT" : "FAILED",
        result: input.result,
        dispatchQueued: Boolean(outcome.advance)
      }
    });
    return true;
  }
  if (path === "/api/admin/drivers") {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const input = await readJson(req, 32 * 1024);
    const result = await createDriver(input);
    sendJson(res, 201, result);
    return true;
  }
  if (path === "/api/admin/restaurants") {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const input = await readJson(req, 10 * 1024 * 1024);
    sendJson(res, 201, await createRestaurant(input));
    return true;
  }
  const restaurantAccountMatch = path.match(
    /^\/api\/admin\/restaurants\/(\d+)\/account$/
  );
  if (restaurantAccountMatch) {
    if (method !== "GET" && method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const restaurantId = positiveInt(restaurantAccountMatch[1], "المطعم");
    if (method === "GET") {
      sendJson(res, 200, await readRestaurantAccountSerial(restaurantId));
    } else {
      sendJson(res, 200, await regenerateRestaurantAccountSerial(restaurantId));
    }
    return true;
  }
  if (path === "/api/admin/orders/archive-all") {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const result = await pool.query(
      "UPDATE orders SET is_archived = true WHERE is_archived = false RETURNING id"
    );
    sendJson(res, 200, { ok: true, count: result.rowCount });
    return true;
  }
  const cancelOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/cancel$/);
  if (cancelOrderMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const input = await readJson(req, 2048);
    sendJson(res, 200, await cancelAdminOrder(cancelOrderMatch[1], input?.reason));
    return true;
  }
  const restoreOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/restore$/);
  if (restoreOrderMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const orderId = positiveInt(restoreOrderMatch[1], "الطلب");
    await pool.query("UPDATE orders SET is_archived = false WHERE id = $1", [orderId]);
    sendJson(res, 200, { ok: true, id: orderId });
    return true;
  }
  const driverMatch = path.match(/^\/api\/admin\/drivers\/(\d+)$/);
  if (driverMatch) {
    if (method !== "PATCH") return methodNotAllowed(res);
    await requireSession(req, "admin");
    const input = await readJson(req, 32 * 1024);
    sendJson(res, 200, { driver: await updateDriver(driverMatch[1], input) });
    return true;
  }
  if (path === "/api/driver/orders") {
    if (method !== "GET") return methodNotAllowed(res);
    const session = await requireSession(req, "driver");
    const filters = parseStatsFilters(url.searchParams);
    sendJson(res, 200, {
      orders: await getDriverOrders(session.ownerId, filters)
    });
    return true;
  }
  if (path === "/api/driver/location") {
    if (method !== "POST") return methodNotAllowed(res);
    const session = await requireSession(req, "driver");
    const input = await readJson(req, 1024);
    const lat = Number(input?.latitude);
    const lng = Number(input?.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new ApiError(400, "إحداثيات الموقع غير صالحة.");
    }
    await pool.query(
      `UPDATE drivers
          SET latitude = $1, longitude = $2, location_updated_at = NOW()
        WHERE id = $3`,
      [lat, lng, session.ownerId]
    );
    sendJson(res, 200, { ok: true, latitude: lat, longitude: lng });
    return true;
  }
  const driverRespondMatch = path.match(/^\/api\/driver\/orders\/(\d+)\/respond$/);
  if (driverRespondMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    const session = await requireSession(req, "driver");
    const orderId = positiveInt(driverRespondMatch[1], "الطلب");
    const input = await readJson(req, 1024);
    const decision = input?.decision;
    if (!["ACCEPTED", "REJECTED"].includes(decision)) {
      throw new ApiError(400, "قرار السائق غير صالح.");
    }

    const outcome = await withTransaction(async (client) => {
      const job = (await client.query(
        "SELECT state FROM order_email_dispatch_jobs WHERE order_id=$1 FOR UPDATE",
        [orderId]
      )).rows[0];
      if (job && job.state !== "ACTIVE") {
        throw new ApiError(409, "تمت معالجة الطلب بالفعل.");
      }
      const order = (await client.query(
        `SELECT id,restaurant_id,status,driver_id
           FROM orders
          WHERE id=$1
          FOR UPDATE`,
        [orderId]
      )).rows[0];
      if (!order) throw new ApiError(404, "الطلب غير موجود.");
      if (order.status !== "ASSIGNED" || order.driver_id != null) {
        throw new ApiError(409, "لم يعد الطلب بانتظار قرار سائق.");
      }
      const attempt = (await client.query(
        `SELECT id, assignment_id, status, timeout_at FROM order_driver_attempts
          WHERE order_id=$1 AND driver_id=$2 AND status='PENDING'
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [orderId, session.ownerId]
      )).rows[0];
      if (!attempt) {
        throw new ApiError(404, "لا يوجد طلب قيد الانتظار لهذا السائق.");
      }
      const driver = (await client.query(
        `SELECT id FROM drivers
          WHERE id=$1 AND restaurant_id=$2 AND is_active=true AND status='ACTIVE'
          FOR UPDATE`,
        [session.ownerId, order.restaurant_id]
      )).rows[0];
      if (!driver) {
        throw new ApiError(409, "لم يعد السائق مؤهلاً لاستلام هذا الطلب.");
      }
      if (attempt.timeout_at && new Date(attempt.timeout_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE order_driver_attempts
              SET status='TIMEOUT',responded_at=now(),response_at=now(),timed_out_at=now()
            WHERE id=$1 AND status='PENDING'`,
          [attempt.id]
        );
        await client.query(
          `UPDATE orders SET status='TIMEOUT',updated_at=now()
            WHERE id=$1 AND status='ASSIGNED' AND driver_id IS NULL`,
          [orderId]
        );
        await client.query(
          `INSERT INTO order_status_history (order_id,status,note)
           VALUES ($1,'TIMEOUT',$2)`,
          [orderId, `انتهت مهلة رد السائق #${session.ownerId}`]
        );
        await client.query(
          `UPDATE order_email_dispatch_jobs
              SET state='ACTIVE',next_check_at=now(),updated_at=now()
            WHERE order_id=$1`,
          [orderId]
        );
        return { ok: false, decision, advance: true, reason: "انتهت مهلة الرد." };
      }
      if (decision === "ACCEPTED") {
        const confirmed = await client.query(
          `UPDATE orders SET status='CONFIRMED',driver_id=$2,updated_at=now()
            WHERE id=$1 AND status='ASSIGNED' AND driver_id IS NULL
            RETURNING id`,
          [orderId, session.ownerId]
        );
        if (!confirmed.rowCount) {
          throw new ApiError(409, "سبق لسائق آخر تأكيد الطلب.");
        }
        const acceptedAttempt = await client.query(
          `UPDATE order_driver_attempts
              SET status='ACCEPTED',responded_at=now(),response_at=now(),accepted_at=now()
            WHERE id=$1 AND status='PENDING'
            RETURNING id`,
          [attempt.id]
        );
        if (!acceptedAttempt.rowCount) {
          throw new ApiError(409, "تم تسجيل قرار السائق مسبقاً.");
        }
        await client.query(
          `INSERT INTO order_status_history (order_id,status,note)
           VALUES ($1,'CONFIRMED',$2)`,
          [orderId, `أكد السائق #${session.ownerId} الطلب`]
        );
        await client.query(
          `UPDATE order_email_dispatch_jobs SET state='DONE', updated_at=now() WHERE order_id=$1`,
          [orderId]
        );
      } else {
        const rejectedAttempt = await client.query(
          `UPDATE order_driver_attempts
              SET status='REJECTED',responded_at=now(),response_at=now(),rejected_at=now()
            WHERE id=$1 AND status='PENDING'
            RETURNING id`,
          [attempt.id]
        );
        if (!rejectedAttempt.rowCount) {
          throw new ApiError(409, "تم تسجيل قرار السائق مسبقاً.");
        }
        const rejected = await client.query(
          `UPDATE orders SET status='REJECTED',updated_at=now()
            WHERE id=$1 AND status='ASSIGNED' AND driver_id IS NULL
            RETURNING id`,
          [orderId]
        );
        if (!rejected.rowCount) {
          throw new ApiError(409, "سبق لسائق آخر معالجة الطلب.");
        }
        await client.query(
          `INSERT INTO order_status_history (order_id,status,note)
           VALUES ($1,'REJECTED',$2)`,
          [orderId, `رفض السائق #${session.ownerId} الطلب`]
        );
        await client.query(
          `UPDATE order_email_dispatch_jobs
              SET state='ACTIVE', next_check_at=now(), updated_at=now()
            WHERE order_id=$1`,
          [orderId]
        );
      }
      return {
        ok: true,
        decision,
        status: decision === "ACCEPTED" ? "CONFIRMED" : "REJECTED",
        advance: decision === "REJECTED"
      };
    });
    if (outcome.advance) kickDispatch();
    sendJson(res, outcome.ok ? 200 : 409, outcome);
    return true;
  }
  if (path === "/api/driver/stats") {
    if (method !== "GET") return methodNotAllowed(res);
    const session = await requireSession(req, "driver");
    const filters = parseStatsFilters(url.searchParams);
    sendJson(res, 200, await getDriverStats(session.ownerId, filters));
    return true;
  }
  const completeMatch = path.match(/^\/api\/driver\/orders\/(\d+)\/complete$/);
  if (completeMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    const session = await requireSession(req, "driver");
    sendJson(res, 200, await completeDriverOrder(session.ownerId, completeMatch[1]));
    return true;
  }
  return false;
}

export async function handleApi(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    sendJson(res, 400, { error: "BAD_REQUEST", message: "عنوان الطلب غير صالح." });
    return true;
  }
  if (
    url.pathname === "/api/driver-action" ||
    url.pathname === "/api/driver-action/" ||
    !url.pathname.startsWith("/api/")
  ) {
    return false;
  }

  const requestId = randomUUID();
  try {
    return await routeApi(req, res, url);
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped.status >= 500) {
      const code = typeof error?.code === "string" ? error.code : "INTERNAL";
      console.error("[api] request failed", requestId, mapped.status, code);
    }
    sendJson(res, mapped.status, {
      error: mapped.status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message: mapped.message,
      requestId
    });
    return true;
  }
}