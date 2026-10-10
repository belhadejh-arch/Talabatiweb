import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  randomInt
} from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "./db.mjs";

const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_HOURS = 12;
const DRIVER_SESSION_DAYS = 30;
const RESTAURANT_SESSION_HOURS = 12;
const RATE_LIMIT = 5;
const DRIVER_IP_RATE_LIMIT = 30;
const RATE_WINDOW_MINUTES = 15;

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function keyedHash(value) {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function restaurantSerialHash(serial) {
  return keyedHash(`restaurant-serial:${serial}`);
}

function encryptionKey() {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return createHash("sha256").update(SESSION_SECRET).digest();
}

function encryptRestaurantSerial(serial) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(serial, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptRestaurantSerial(value) {
  const [ivText, tagText, encryptedText] = String(value || "").split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Restaurant serial credential is not valid encrypted data.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export async function createRestaurantAccountSerial(client, restaurantId) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-serial-allocation', 0))"
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const serial = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = restaurantSerialHash(serial);
    const used = await client.query(
      "SELECT 1 FROM restaurants WHERE account_serial_hash=$1 LIMIT 1",
      [hash]
    );
    if (used.rows[0]) continue;
    const updated = await client.query(
      `UPDATE restaurants
          SET account_serial_hash=$2, account_serial_encrypted=$3
        WHERE id=$1
        RETURNING id`,
      [restaurantId, hash, encryptRestaurantSerial(serial)]
    );
    if (!updated.rows[0]) throw new AuthError(404, "المطعم غير موجود.");
    return serial;
  }
  throw new Error("Could not allocate a unique restaurant serial number.");
}

export async function readRestaurantAccountSerial(restaurantId) {
  const result = await pool.query(
    `SELECT id, account_serial_encrypted
       FROM restaurants
      WHERE id=$1
      LIMIT 1`,
    [restaurantId]
  );
  const row = result.rows[0];
  if (!row) throw new AuthError(404, "المطعم غير موجود.");
  if (!row.account_serial_encrypted) {
    const serial = await withTransaction(async (client) =>
      createRestaurantAccountSerial(client, restaurantId)
    );
    return { serialNumber: serial };
  }
  return { serialNumber: decryptRestaurantSerial(row.account_serial_encrypted) };
}

export async function ensureRestaurantAccountSerials() {
  return withTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('restaurant-serial-allocation', 0))"
    );
    const missing = await client.query(
      `SELECT id
         FROM restaurants
        WHERE account_serial_hash IS NULL
        ORDER BY id
        FOR UPDATE`
    );
    for (const restaurant of missing.rows) {
      await createRestaurantAccountSerial(client, Number(restaurant.id));
    }
    return missing.rowCount;
  });
}

export async function regenerateRestaurantAccountSerial(restaurantId) {
  return withTransaction(async (client) => {
    await client.query("SELECT id FROM restaurants WHERE id=$1 FOR UPDATE", [restaurantId]);
    const serialNumber = await createRestaurantAccountSerial(client, restaurantId);
    await client.query(
      "DELETE FROM api_sessions WHERE role='RESTAURANT' AND owner_id=$1",
      [restaurantId]
    );
    return { serialNumber };
  });
}

function requestIp(req) {
  const remoteAddress = req.socket?.remoteAddress;
  return typeof remoteAddress === "string" && remoteAddress
    ? remoteAddress
    : "unknown";
}

function rateLimitKeys(req, kind, identifier) {
  const ip = requestIp(req);
  return [
    keyedHash(`${kind}:ip:${ip}`),
    keyedHash(`${kind}:account:${String(identifier).trim().toLowerCase()}`)
  ];
}

async function checkAndIncrementRateLimit(client, keys, limits = []) {
  // rateLimitKeys orders the transport-IP key before the account key.
  for (const key of keys) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [key]
    );
  }

  const rows = await client.query(
    `SELECT key_hash, attempts, reset_at
       FROM auth_rate_limits
      WHERE key_hash = ANY($1::text[])
      FOR UPDATE`,
    [keys]
  );
  const limitByKey = new Map(
    keys.map((key, index) => [key, limits[index] ?? RATE_LIMIT])
  );
  if (rows.rows.some((row) =>
    new Date(row.reset_at).getTime() > Date.now() &&
    Number(row.attempts) >= limitByKey.get(row.key_hash)
  )) {
    return false;
  }

  for (const key of keys) {
    await client.query(
      `INSERT INTO auth_rate_limits (key_hash, attempts, reset_at)
       VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 minute'))
       ON CONFLICT (key_hash) DO UPDATE SET
         attempts = CASE
           WHEN auth_rate_limits.reset_at <= NOW() THEN 1
           ELSE auth_rate_limits.attempts + 1
         END,
         reset_at = CASE
           WHEN auth_rate_limits.reset_at <= NOW()
             THEN NOW() + ($2 * INTERVAL '1 minute')
           ELSE auth_rate_limits.reset_at
         END`,
      [key, RATE_WINDOW_MINUTES]
    );
  }
  return true;
}

async function clearRateLimit(client, keys) {
  await client.query(
    "DELETE FROM auth_rate_limits WHERE key_hash = ANY($1::text[])",
    [keys]
  );
}

async function createSession(client, role, ownerId, lifetimeSeconds) {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  await client.query("DELETE FROM api_sessions WHERE expires_at <= NOW()");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await client.query(
    `INSERT INTO api_sessions (token_hash, role, owner_id, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 second'))`,
    [tokenHash, role, ownerId, lifetimeSeconds]
  );
  return token;
}

export async function loginAdmin(req, username, password) {
  const cleanUsername = typeof username === "string" ? username.trim() : "";
  if (!cleanUsername || typeof password !== "string" || !password) {
    throw new AuthError(400, "أدخل اسم المستخدم وكلمة المرور.");
  }

  const keys = rateLimitKeys(req, "admin", cleanUsername);
  const result = await withTransaction(async (client) => {
    const allowed = await checkAndIncrementRateLimit(client, keys);
    if (!allowed) return { error: "rate-limit" };

    const found = await client.query(
      `SELECT id, password_hash
         FROM admins
        WHERE username = $1
        LIMIT 1`,
      [cleanUsername]
    );
    const account = found.rows[0];
    const valid = account
      ? await bcrypt.compare(password, account.password_hash)
      : false;

    if (!valid) {
      return { error: "invalid" };
    }

    await clearRateLimit(client, keys);
    const token = await createSession(
      client,
      "ADMIN",
      account.id,
      SESSION_HOURS * 60 * 60
    );
    return { token };
  });

  if (result.error === "rate-limit") {
    throw new AuthError(429, "محاولات كثيرة. حاول مجدداً بعد فترة.");
  }
  if (result.error) {
    throw new AuthError(401, "بيانات تسجيل الدخول غير صحيحة.");
  }
  return { token: result.token };
}

export async function loginDriver(req, serialNumber) {
  const serial = typeof serialNumber === "string" ? serialNumber.trim() : "";
  if (!/^\d{6}$/.test(serial)) {
    throw new AuthError(400, "أدخل الرقم التعريفي المكوّن من ستة أرقام.");
  }

  const keys = rateLimitKeys(req, "driver", serial);
  const result = await withTransaction(async (client) => {
    const allowed = await checkAndIncrementRateLimit(client, keys, [
      DRIVER_IP_RATE_LIMIT,
      RATE_LIMIT
    ]);
    if (!allowed) return { error: "rate-limit" };

    const found = await client.query(
      `SELECT id, restaurant_id, name, phone, email, status, is_active
         FROM drivers
        WHERE serial_number = $1
          AND is_active = TRUE
          AND status = 'ACTIVE'
        LIMIT 1`,
      [serial]
    );
    const driver = found.rows[0];
    if (!driver) {
      return { error: "invalid" };
    }

    await clearRateLimit(client, [keys[1]]);
    const token = await createSession(
      client,
      "DRIVER",
      driver.id,
      DRIVER_SESSION_DAYS * 24 * 60 * 60
    );
    return { token, driver };
  });

  if (result.error === "rate-limit") {
    throw new AuthError(429, "محاولات كثيرة. حاول مجدداً بعد فترة.");
  }
  if (result.error) {
    throw new AuthError(401, "الرقم التعريفي غير صحيح أو الحساب غير نشط.");
  }
  return {
    token: result.token,
    driver: {
      id: result.driver.id,
      restaurantId: result.driver.restaurant_id,
      name: result.driver.name,
      phone: result.driver.phone,
      email: result.driver.email || "",
      status: result.driver.status,
      isActive: result.driver.is_active
    }
  };
}

export async function loginRestaurant(req, serialNumber) {
  const serial = typeof serialNumber === "string" ? serialNumber.trim() : "";
  if (!/^\d{6}$/.test(serial)) {
    throw new AuthError(400, "أدخل الرقم التسلسلي المكوّن من ستة أرقام.");
  }

  const keys = rateLimitKeys(req, "restaurant", serial);
  const result = await withTransaction(async (client) => {
    const allowed = await checkAndIncrementRateLimit(client, keys, [
      DRIVER_IP_RATE_LIMIT,
      RATE_LIMIT
    ]);
    if (!allowed) return { error: "rate-limit" };
    const found = await client.query(
      `SELECT id, name, phone, address, status
         FROM restaurants
        WHERE account_serial_hash=$1
          AND status='ACTIVE'
        LIMIT 1`,
      [restaurantSerialHash(serial)]
    );
    const restaurant = found.rows[0];
    if (!restaurant) return { error: "invalid" };
    await clearRateLimit(client, [keys[1]]);
    const token = await createSession(
      client,
      "RESTAURANT",
      restaurant.id,
      RESTAURANT_SESSION_HOURS * 60 * 60
    );
    return { token, restaurant };
  });

  if (result.error === "rate-limit") {
    throw new AuthError(429, "محاولات كثيرة. حاول مجدداً بعد فترة.");
  }
  if (result.error) {
    throw new AuthError(401, "الرقم التسلسلي غير صحيح أو المطعم غير نشط.");
  }
  return {
    token: result.token,
    restaurant: {
      id: Number(result.restaurant.id),
      name: result.restaurant.name,
      phone: result.restaurant.phone || "",
      address: result.restaurant.address || ""
    }
  };
}

export async function requireSession(req, requiredRole) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)
    : null;
  if (!match) {
    throw new AuthError(401, "يلزم تسجيل الدخول للمتابعة.");
  }

  const result = await pool.query(
    `SELECT role, owner_id
       FROM api_sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      LIMIT 1`,
    [hashToken(match[1])]
  );
  const session = result.rows[0];
  if (!session) {
    throw new AuthError(401, "انتهت الجلسة. يرجى تسجيل الدخول مجدداً.");
  }

  const tokenHash = hashToken(match[1]);
  let account;
  if (session.role === "DRIVER") {
    account = (await pool.query(
      `SELECT id, restaurant_id
         FROM drivers
        WHERE id = $1
          AND is_active = TRUE
          AND status = 'ACTIVE'
        LIMIT 1`,
      [session.owner_id]
    )).rows[0];
  } else if (session.role === "ADMIN") {
    account = (await pool.query(
      "SELECT id FROM admins WHERE id = $1 LIMIT 1",
      [session.owner_id]
    )).rows[0];
  } else if (session.role === "RESTAURANT") {
    account = (await pool.query(
      `SELECT id
         FROM restaurants
        WHERE id=$1
          AND status='ACTIVE'
        LIMIT 1`,
      [session.owner_id]
    )).rows[0];
  }

  if (!account) {
    await pool.query("DELETE FROM api_sessions WHERE token_hash = $1", [tokenHash]);
    throw new AuthError(401, "الحساب غير نشط أو انتهت صلاحيته.");
  }
  if (session.role !== String(requiredRole).toUpperCase()) {
    throw new AuthError(403, "ليس لديك صلاحية لتنفيذ هذا الإجراء.");
  }
  return {
    role: session.role.toLowerCase(),
    ownerId: Number(session.owner_id),
    restaurantId: session.role === "DRIVER"
      ? Number(account.restaurant_id)
      : session.role === "RESTAURANT"
        ? Number(account.id)
        : null
  };
}

export async function updateAdminCredentials(req, adminId, {
  currentPassword,
  newUsername,
  newPassword
}) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)
    : null;
  if (!match) throw new AuthError(401, "يلزم تسجيل الدخول للمتابعة.");
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new AuthError(400, "كلمة المرور الحالية مطلوبة.");
  }
  const tokenHash = hashToken(match[1]);
  return withTransaction(async (client) => {
    await client.query("LOCK TABLE admins IN SHARE ROW EXCLUSIVE MODE");
    const found = await client.query(
      "SELECT id, username, password_hash FROM admins WHERE id=$1 FOR UPDATE",
      [adminId]
    );
    const admin = found.rows[0];
    if (!admin || !await bcrypt.compare(currentPassword, admin.password_hash)) {
      throw new AuthError(401, "كلمة المرور الحالية غير صحيحة.");
    }
    if (newUsername !== undefined) {
      const collision = await client.query(
        "SELECT id FROM admins WHERE LOWER(username)=LOWER($1) AND id<>$2 LIMIT 1",
        [newUsername, adminId]
      );
      if (collision.rows[0]) throw new AuthError(409, "اسم المستخدم مستخدم بالفعل.");
    }
    const username = newUsername ?? admin.username;
    const passwordHash = newPassword === undefined
      ? admin.password_hash
      : await bcrypt.hash(newPassword, 12);
    await client.query(
      "UPDATE admins SET username=$2, password_hash=$3 WHERE id=$1",
      [adminId, username, passwordHash]
    );
    await client.query(
      "DELETE FROM api_sessions WHERE role='ADMIN' AND owner_id=$1 AND token_hash<>$2",
      [adminId, tokenHash]
    );
    return { ok: true };
  });
}

export async function revokeSession(req) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)
    : null;
  if (!match) return;
  await pool.query(
    "DELETE FROM api_sessions WHERE token_hash = $1",
    [hashToken(match[1])]
  );
}