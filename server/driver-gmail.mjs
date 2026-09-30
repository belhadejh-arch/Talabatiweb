import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db.mjs";
import { requireSession } from "./auth.mjs";
import {
  parsePublicApiOrigin,
  getSafeDiagnostics,
  logSafeDiagnostics,
  cleanEnv,
  safeClientIdSnippet,
  processAdminCallback,
} from "./gmail-oauth.mjs";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function getDriverGmailCallbackUrl(raw = process.env.PUBLIC_API_URL) {
  const origin = parsePublicApiOrigin(raw);
  if (!origin) return null;
  const customPath = cleanEnv(process.env.GOOGLE_OAUTH_DRIVER_CALLBACK_PATH);
  if (customPath) {
    return `${origin}${customPath.startsWith("/") ? customPath : `/${customPath}`}`;
  }
  return `${origin}/api/driver/gmail/callback`;
}

function config() {
  const clientId = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = getDriverGmailCallbackUrl();
  if (!redirectUri) return null;
  return clientId && clientSecret
    ? { clientId, clientSecret, redirectUri }
    : null;
}

function missingConfiguration() {
  const missing = [];
  if (!cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID)) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET)) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  const origin = parsePublicApiOrigin();
  if (!origin) {
    missing.push("PUBLIC_API_URL (HTTPS origin only)");
  }
  return missing;
}

async function authorizationFor(driverId, settings, endpoint = "unknown") {
  const state = randomBytes(32).toString("base64url");
  await pool.query("DELETE FROM driver_gmail_states WHERE expires_at<=now()");
  await pool.query(
    `INSERT INTO driver_gmail_states (state_hash,driver_id,expires_at)
     VALUES ($1,$2,now()+interval '10 minutes')`,
    [hash(state), driverId],
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
  console.log(`[Driver Gmail OAuth Init] Endpoint: ${endpoint}, Driver ID: ${driverId}, redirect_uri: ${settings.redirectUri}, client_id: ${safeClientIdSnippet(settings.clientId)}, client_secret_present: ${Boolean(settings.clientSecret)}`);
  return authorize.toString();
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function resultPage(res, status, message, technicalDetails = null) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  const detailsHtml = technicalDetails ? `
    <div style="margin-top:20px;padding:12px;background:#fdf2f2;border:1px solid #f5c6cb;border-radius:6px;color:#721c24;font-size:14px;direction:ltr;text-align:left;font-family:monospace;">
      <strong>Technical Error:</strong> ${escapeHtml(technicalDetails)}
    </div>` : "";
  res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
    <title>ربط بريد السائق</title><body style="font:18px Arial,sans-serif;padding:32px;line-height:1.8">
    <h1>${message}</h1>
    <p>يمكنك إغلاق هذه النافذة والعودة إلى صفحة السائق لتحديث الحالة.</p>
    ${detailsHtml}</body></html>`);
}

export async function processDriverVerification({ res, driverId, code, redirectUri }) {
  const settings = config();
  if (!settings) {
    console.error("[Driver Gmail OAuth] Incomplete server configuration");
    resultPage(res, 503, "إعداد Google على الخادم غير مكتمل.", "Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or PUBLIC_API_URL");
    return;
  }
  const effectiveRedirectUri = redirectUri || settings.redirectUri;
  console.log(`[Driver Gmail OAuth Token Exchange] redirect_uri=${effectiveRedirectUri}, client_id=${safeClientIdSnippet(settings.clientId)}, driver_id=${driverId}`);
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: effectiveRedirectUri,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const rawBody = await response.text().catch(() => "");
      let errDetails = `HTTP ${response.status}`;
      try {
        const json = JSON.parse(rawBody);
        errDetails += ` - ${json.error || ""}: ${json.error_description || ""}`;
        console.error(`[Google Driver Token Exchange Error] HTTP ${response.status}: error="${json.error}", description="${json.error_description}", redirect_uri="${effectiveRedirectUri}"`);
      } catch {
        console.error(`[Google Driver Token Exchange Error] HTTP ${response.status}: raw="${rawBody.slice(0, 300)}"`);
        errDetails += ` - ${rawBody.slice(0, 200)}`;
      }
      const err = new Error(`Token exchange failed: ${errDetails}`);
      err.googleError = errDetails;
      throw err;
    }
    const tokens = await response.json();
    if (!tokens.access_token) {
      console.error("[Google Driver Token Exchange Error] Missing access_token in response");
      throw new Error("Missing access token in Google response");
    }
    const profileResponse = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileResponse.ok) {
      const profileErr = await profileResponse.text().catch(() => "");
      console.error(`[Google Driver UserInfo Error] HTTP ${profileResponse.status}: ${profileErr.slice(0, 200)}`);
      throw new Error(`Profile check failed (HTTP ${profileResponse.status})`);
    }
    const profile = await profileResponse.json();
    const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    if (!profile.email_verified || !/^[^@\s]+@gmail\.com$/.test(email)) {
      console.warn(`[Driver Gmail OAuth] Account unverified or non-Gmail: email="${email}", verified=${profile.email_verified}`);
      resultPage(res, 403, "يجب اختيار حساب Gmail صالح ومتحقق منه.", `Email unverified or not @gmail.com (received: ${email})`);
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
      [driverId, email],
    );
    if (!linked.rowCount) {
      console.warn(`[Driver Gmail OAuth] Authenticated email ${email} does not match driver ID ${driverId}`);
      resultPage(res, 403, "حساب Google لا يطابق بريد السائق المسجّل في الإدارة.", `Google account (${email}) does not match driver's registered email`);
      return;
    }
    console.log(`[Driver Gmail OAuth Success] Driver ID ${driverId} successfully linked to ${email}`);
    resultPage(res, 200, "تم التحقق من بريد السائق وربطه بنجاح.");
  } catch (error) {
    console.error("[Driver Gmail OAuth Callback Exception]", error?.message || error);
    const techHint = error?.googleError || error?.message || "Internal verification error";
    resultPage(res, 502, "تعذّر إكمال التحقق من Gmail. تحقق من إعداد Google وأعد المحاولة.", techHint);
  }
}

async function callback(res, url) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  console.log(`[Driver Gmail Callback] Path: ${url.pathname}, state_present=${Boolean(state)}, code_present=${Boolean(code)}, error=${errorParam || "none"}`);
  if (errorParam) {
    console.error(`[Driver Gmail Callback Error from Google] error="${errorParam}"`);
    resultPage(res, 400, "انتهى طلب الربط أو أُلغي. أعد المحاولة من صفحة السائق.", `Google error: ${errorParam}`);
    return;
  }
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    console.warn(`[Driver Gmail Callback] Invalid state parameter`);
    resultPage(res, 400, "رابط الربط غير صالح.", "Invalid state parameter");
    return;
  }
  const used = await pool.query(
    `DELETE FROM driver_gmail_states
      WHERE state_hash=$1 AND expires_at>now() RETURNING driver_id`,
    [hash(state)],
  );
  if (!used.rowCount) {
    // Check if this state was generated for admin OAuth
    const adminUsed = await pool.query(
      `DELETE FROM gmail_oauth_states
        WHERE state_hash=$1 AND expires_at>now() RETURNING state_hash`,
      [createHash("sha256").update(state).digest("hex")],
    );
    if (adminUsed.rowCount) {
      console.log(`[Driver Gmail Callback] State matches gmail_oauth_states. Routing to admin callback.`);
      await processAdminCallback({ res, code, redirectUri: getDriverGmailCallbackUrl() });
      return;
    }
    console.warn(`[Driver Gmail Callback] State not found or expired`);
    resultPage(res, 400, "انتهى طلب الربط أو أُلغي. أعد المحاولة من صفحة السائق.", "State not found or expired");
    return;
  }
  if (!code) {
    console.warn(`[Driver Gmail Callback] Missing code in query parameters`);
    resultPage(res, 400, "انتهى طلب الربط أو أُلغي. أعد المحاولة من صفحة السائق.", "Missing authorization code");
    return;
  }
  await processDriverVerification({
    res,
    driverId: used.rows[0].driver_id,
    code,
    redirectUri: getDriverGmailCallbackUrl(),
  });
}

export async function handleDriverGmailRoutes(req, res, url, { sendJson }) {
  const path = url.pathname;
  const adminConnect = path.match(/^\/api\/admin\/drivers\/(\d+)\/gmail\/connect$/);
  if (path === "/api/admin/drivers/gmail-links" || adminConnect) {
    await requireSession(req, "admin");
    if (path === "/api/admin/drivers/gmail-links" && req.method === "GET") {
      const verified = await pool.query(
        `SELECT d.id AS driver_id FROM drivers d
         JOIN driver_gmail_links l ON l.driver_id=d.id
         WHERE d.is_active=true AND d.status='ACTIVE'
           AND lower(trim(d.email))=lower(l.email)`,
      );
      sendJson(res, 200, { verifiedDriverIds: verified.rows.map((row) => row.driver_id) });
      return true;
    }
    if (adminConnect && req.method === "POST") {
      const settings = config();
      if (!settings) {
        logSafeDiagnostics("Admin Driver Gmail Connect Failed");
        sendJson(res, 503, { error: "GMAIL_NOT_CONFIGURED",
          message: `إعداد Google غير مكتمل في Render: ${missingConfiguration().join("، ")}` });
        return true;
      }
      const driver = (await pool.query(
        "SELECT email FROM drivers WHERE id=$1 AND is_active=true AND status='ACTIVE'",
        [adminConnect[1]],
      )).rows[0];
      if (!driver) {
        sendJson(res, 404, { error: "DRIVER_NOT_FOUND", message: "السائق غير نشط أو غير موجود." });
        return true;
      }
      if (!driver.email || !/^[^@\s]+@gmail\.com$/i.test(driver.email.trim())) {
        sendJson(res, 409, { error: "DRIVER_EMAIL_MISSING",
          message: "سجّل بريد Gmail صالحاً للسائق أولاً." });
        return true;
      }
      sendJson(res, 200, { authorizationUrl: await authorizationFor(Number(adminConnect[1]), settings, `/api/admin/drivers/${adminConnect[1]}/gmail/connect`) });
      return true;
    }
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return true;
  }
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
    logSafeDiagnostics("Driver Gmail Status");
    const connected = Boolean(driver?.email && driver?.linked_email &&
      driver.email.trim().toLowerCase() === driver.linked_email.toLowerCase());
    sendJson(res, 200, {
      configured: Boolean(config()),
      missingConfiguration: missingConfiguration(),
      connected,
      email: connected ? driver.linked_email : null,
      registeredEmail: driver?.email ?? null,
      verifiedAt: connected ? driver.verified_at : null,
      diagnostics: getSafeDiagnostics(),
    });
  } else if (path === "/api/driver/gmail/connect" && req.method === "POST") {
    logSafeDiagnostics("Driver Gmail Connect");
    const settings = config();
    if (!settings) {
      sendJson(res, 503, { error: "GMAIL_NOT_CONFIGURED",
        message: `إعداد Google غير مكتمل في Render: ${missingConfiguration().join("، ")}` });
      return true;
    }
    if (!driver?.email || !/^[^@\s]+@gmail\.com$/i.test(driver.email.trim())) {
      sendJson(res, 409, { error: "DRIVER_EMAIL_MISSING",
        message: "اطلب من الإدارة تسجيل عنوان Gmail الخاص بك أولاً." });
      return true;
    }
    sendJson(res, 200, { authorizationUrl: await authorizationFor(session.ownerId, settings, "/api/driver/gmail/connect") });
  } else {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  return true;
}