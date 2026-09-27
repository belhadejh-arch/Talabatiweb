import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db.mjs";
import { requireSession } from "./auth.mjs";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  try {
    const base = new URL(process.env.PUBLIC_API_URL);
    if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) return null;
    return clientId && clientSecret
      ? { clientId, clientSecret, redirectUri: new URL("/api/driver/gmail/callback", base).toString() }
      : null;
  } catch {
    return null;
  }
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

function resultPage(res, status, message) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
    <title>ربط بريد السائق</title><body style="font:18px Arial,sans-serif;padding:32px;line-height:1.8">
    <h1>${message}</h1><p>يمكنك إغلاق هذه النافذة والعودة إلى صفحة السائق لتحديث الحالة.</p></body></html>`);
}

async function callback(res, url) {
  const state = url.searchParams.get("state");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    resultPage(res, 400, "رابط الربط غير صالح.");
    return;
  }
  const used = await pool.query(
    `DELETE FROM driver_gmail_states
      WHERE state_hash=$1 AND expires_at>now() RETURNING driver_id`,
    [hash(state)],
  );
  if (!used.rowCount || url.searchParams.has("error") || !url.searchParams.get("code")) {
    resultPage(res, 400, "انتهى طلب الربط أو أُلغي. أعد المحاولة من صفحة السائق.");
    return;
  }
  const settings = config();
  if (!settings) {
    resultPage(res, 503, "إعداد Google على الخادم غير مكتمل.");
    return;
  }
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code: url.searchParams.get("code"),
        grant_type: "authorization_code",
        redirect_uri: settings.redirectUri,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Token exchange failed");
    const tokens = await response.json();
    if (!tokens.access_token) throw new Error("Missing access token");
    const profileResponse = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileResponse.ok) throw new Error("Profile check failed");
    const profile = await profileResponse.json();
    const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    if (!profile.email_verified || !/^[^@\s]+@gmail\.com$/.test(email)) {
      resultPage(res, 403, "يجب اختيار حساب Gmail صالح ومتحقق منه.");
      return;
    }
    // The serial number alone cannot redirect notifications to a different
    // mailbox: the account proven at Google must equal the admin-set address.
    const linked = await pool.query(
      `INSERT INTO driver_gmail_links (driver_id,email)
       SELECT id,$2 FROM drivers
       WHERE id=$1 AND is_active=true AND status='ACTIVE'
         AND lower(trim(email))=$2
       ON CONFLICT (driver_id) DO UPDATE SET email=EXCLUDED.email,verified_at=now()
       RETURNING driver_id`,
      [used.rows[0].driver_id, email],
    );
    resultPage(res, linked.rowCount ? 200 : 403, linked.rowCount
      ? "تم التحقق من بريد السائق وربطه بنجاح."
      : "حساب Google لا يطابق بريد السائق المسجّل في الإدارة.");
  } catch {
    // Never display OAuth codes, access tokens, or token exchange details.
    resultPage(res, 502, "تعذّر إكمال التحقق من Gmail. تحقق من إعداد Google وأعد المحاولة.");
  }
}

export async function handleDriverGmailRoutes(req, res, url, { sendJson }) {
  const path = url.pathname;
  if (!path.startsWith("/api/driver/gmail/")) return false;
  if (path === "/api/driver/gmail/callback") {
    if (req.method !== "GET") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    else await callback(res, url);
    return true;
  }
  if (path !== "/api/driver/gmail/status" && path !== "/api/driver/gmail/connect") return false;
  const session = await requireSession(req, "driver");
  const driver = (await pool.query(
    `SELECT d.email,l.email AS linked_email,l.verified_at
       FROM drivers d LEFT JOIN driver_gmail_links l ON l.driver_id=d.id
      WHERE d.id=$1`,
    [session.ownerId],
  )).rows[0];
  if (path === "/api/driver/gmail/status" && req.method === "GET") {
    const connected = Boolean(driver?.email && driver?.linked_email &&
      driver.email.trim().toLowerCase() === driver.linked_email.toLowerCase());
    sendJson(res, 200, {
      configured: Boolean(config()),
      connected,
      email: connected ? driver.linked_email : null,
      registeredEmail: driver?.email ?? null,
      verifiedAt: connected ? driver.verified_at : null,
    });
  } else if (path === "/api/driver/gmail/connect" && req.method === "POST") {
    const settings = config();
    if (!settings) {
      sendJson(res, 503, { error: "GMAIL_NOT_CONFIGURED",
        message: "إعداد Google غير مكتمل في Render." });
      return true;
    }
    if (!driver?.email || !/^[^@\s]+@gmail\.com$/i.test(driver.email.trim())) {
      sendJson(res, 409, { error: "DRIVER_EMAIL_MISSING",
        message: "اطلب من الإدارة تسجيل عنوان Gmail الخاص بك أولاً." });
      return true;
    }
    const state = randomBytes(32).toString("base64url");
    await pool.query("DELETE FROM driver_gmail_states WHERE expires_at<=now()");
    await pool.query(
      `INSERT INTO driver_gmail_states (state_hash,driver_id,expires_at)
       VALUES ($1,$2,now()+interval '10 minutes')`,
      [hash(state), session.ownerId],
    );
    const authorize = new URL(AUTH_URL);
    for (const [key, value] of Object.entries({
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      response_type: "code",
      scope: "openid email",
      prompt: "select_account",
      state,
    })) authorize.searchParams.set(key, value);
    sendJson(res, 200, { authorizationUrl: authorize.toString() });
  } else {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  return true;
}