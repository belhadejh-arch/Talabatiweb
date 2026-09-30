import {
  createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes,
} from "node:crypto";
import { pool } from "./db.mjs";
import { requireSession } from "./auth.mjs";
import { processDriverVerification } from "./driver-gmail.mjs";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function cleanEnv(value) {
  if (!value || typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^["']|["']$/g, "").trim();
  return cleaned || null;
}

export function safeClientIdSnippet(clientId) {
  if (!clientId || typeof clientId !== "string") return "MISSING";
  const trimmed = clientId.trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed) return "EMPTY";
  if (trimmed.length <= 16) return "[provided]";
  return `${trimmed.slice(0, 10)}...${trimmed.slice(-14)}`;
}

export function parsePublicApiOrigin(raw = process.env.PUBLIC_API_URL) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!cleaned) return null;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getSafeDiagnostics() {
  const raw = process.env.PUBLIC_API_URL;
  const hasValue = typeof raw === "string" && raw.trim().replace(/^["']|["']$/g, "").trim().length > 0;
  const origin = parsePublicApiOrigin(raw);
  return {
    hasPublicApiUrl: hasValue,
    isHttps: Boolean(origin),
  };
}

export function logSafeDiagnostics(context = "Gmail OAuth") {
  const diag = getSafeDiagnostics();
  const clientId = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  console.log(`[${context}] PUBLIC_API_URL present: ${diag.hasPublicApiUrl}, is HTTPS: ${diag.isHttps}, client_id: ${safeClientIdSnippet(clientId)}, client_secret_present: ${Boolean(clientSecret)}`);
}

export function getAdminGmailCallbackUrl(raw = process.env.PUBLIC_API_URL) {
  const origin = parsePublicApiOrigin(raw);
  if (!origin) return null;
  return `${origin}/api/admin/gmail/callback`;
}

export function oauthConfig() {
  const clientId = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const expectedEmail = cleanEnv(process.env.SMTP_USER);
  const redirectUri = getAdminGmailCallbackUrl();
  if (!redirectUri) return null;
  return clientId && clientSecret && expectedEmail
    ? { clientId, clientSecret, expectedEmail, redirectUri }
    : null;
}

export function missingOAuthConfiguration() {
  const missing = [];
  if (!cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID)) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET)) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!cleanEnv(process.env.SMTP_USER)) missing.push("SMTP_USER");
  const origin = parsePublicApiOrigin();
  if (!origin) {
    missing.push("PUBLIC_API_URL (HTTPS origin only)");
  }
  return missing;
}

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is required");
  return Buffer.from(hkdfSync("sha256", secret, "talabat-gmail-oauth", "refresh-token-v1", 32));
}

export function encryptRefreshToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptRefreshToken(value) {
  const parts = value?.split(".");
  if (parts?.length !== 3) throw new Error("Invalid Gmail credential encoding");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) {
    throw new Error("Invalid Gmail credential encoding");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function stateHash(state) {
  return createHash("sha256").update(state).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function html(res, status, message, technicalDetails = null) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "x-content-type-options": "nosniff",
  });
  const detailsHtml = technicalDetails ? `
    <div style="margin-top:20px;padding:12px;background:#fdf2f2;border:1px solid #f5c6cb;border-radius:6px;color:#721c24;font-size:14px;direction:ltr;text-align:left;font-family:monospace;">
      <strong>Technical Error:</strong> ${escapeHtml(technicalDetails)}
    </div>` : "";
  res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
    <title>ربط Gmail</title><body style="font:18px Arial,sans-serif;padding:32px;line-height:1.8">
    <h1>${message}</h1><p>أغلق هذه النافذة ثم حدّث حالة Gmail في صفحة الإعدادات.</p>${detailsHtml}</body></html>`);
}

async function tokenRequest(config, parameters) {
  const targetRedirectUri = parameters.redirect_uri || config.redirectUri;
  console.log(`[Google Token Exchange] Target: ${TOKEN_URL}, redirect_uri: ${targetRedirectUri}, grant_type: ${parameters.grant_type}`);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...parameters,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    let errDetails = `HTTP ${response.status}`;
    try {
      const json = JSON.parse(rawBody);
      errDetails += ` - ${json.error || ""}: ${json.error_description || ""}`;
      console.error(`[Google Token Exchange Error] HTTP ${response.status}: error="${json.error}", description="${json.error_description}", redirect_uri="${targetRedirectUri}"`);
    } catch {
      console.error(`[Google Token Exchange Error] HTTP ${response.status}: raw="${rawBody.slice(0, 300)}"`);
      errDetails += ` - ${rawBody.slice(0, 200)}`;
    }
    const err = new Error(`Google token exchange failed (${errDetails.trim()})`);
    err.googleError = errDetails;
    throw err;
  }
  return response.json();
}

// A token refresh takes place before the send call. Failures here cannot have
// delivered an email and can safely be retried by the existing dispatch job.
export async function gmailAccessToken() {
  let result;
  try {
    result = await pool.query(
      "SELECT email,refresh_token_ciphertext,connected_at FROM gmail_oauth_accounts WHERE id=1",
    );
  } catch (error) {
    if (error.code === "42P01") return null; // Migration not yet applied; use legacy SMTP.
    error.deliveryNotAccepted = true;
    throw error;
  }
  const config = oauthConfig();
  const account = result.rows[0];
  if (!account) {
    if (!config) return null;
    const error = new Error(
      "Central Gmail sender is not connected; link Gmail from admin settings before sending orders",
    );
    error.deliveryNotAccepted = true;
    throw error;
  }
  if (!config) {
    const error = new Error("Gmail API credentials or PUBLIC_API_URL are not configured");
    error.deliveryNotAccepted = true;
    throw error;
  }
  if (account.email.toLowerCase() !== config.expectedEmail.toLowerCase()) {
    const error = new Error("Connected Gmail account does not match SMTP_USER");
    error.deliveryNotAccepted = true;
    throw error;
  }
  try {
    const refreshed = await tokenRequest(config, {
      grant_type: "refresh_token",
      refresh_token: decryptRefreshToken(account.refresh_token_ciphertext),
    });
    if (!refreshed.access_token) throw new Error("Google did not return an access token");
    return { email: account.email, connectedAt: account.connected_at,
      accessToken: refreshed.access_token };
  } catch (error) {
    error.deliveryNotAccepted = true;
    throw error;
  }
}

export async function processAdminCallback({ res, code, redirectUri }) {
  const config = oauthConfig();
  if (!config) {
    console.error("[Admin Gmail OAuth] Incomplete server configuration");
    html(res, 503, "إعداد Gmail API على الخادم غير مكتمل.", "Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, SMTP_USER, or PUBLIC_API_URL");
    return;
  }
  const effectiveRedirectUri = redirectUri || config.redirectUri;
  console.log(`[Admin Gmail OAuth Token Exchange] redirect_uri=${effectiveRedirectUri}, client_id=${safeClientIdSnippet(config.clientId)}, expectedEmail=${config.expectedEmail}`);
  try {
    const tokens = await tokenRequest(config, {
      grant_type: "authorization_code",
      code,
      redirect_uri: effectiveRedirectUri,
    });
    if (!tokens.refresh_token || !tokens.access_token) {
      console.error("[Admin Gmail OAuth] Google did not return a refresh_token or access_token");
      throw new Error("Offline authorization did not provide a refresh token. Ensure prompt=consent and access_type=offline were requested.");
    }
    const profileResponse = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileResponse.ok) {
      const errTxt = await profileResponse.text().catch(() => "");
      console.error(`[Admin Gmail UserInfo Error] HTTP ${profileResponse.status}: ${errTxt.slice(0, 200)}`);
      throw new Error(`Google account verification failed (HTTP ${profileResponse.status})`);
    }
    const profile = await profileResponse.json();
    if (!profile.email_verified ||
        profile.email?.toLowerCase() !== config.expectedEmail.toLowerCase()) {
      console.warn(`[Admin Gmail OAuth] Email mismatch: Google returned ${profile.email}, expected SMTP_USER ${config.expectedEmail}`);
      html(res, 403, "استخدم حساب Gmail المُعدّ مسبقاً للإرسال على الخادم.", `Account (${profile.email}) does not match SMTP_USER (${config.expectedEmail})`);
      return;
    }
    await pool.query(
      `INSERT INTO gmail_oauth_accounts (id,email,refresh_token_ciphertext)
       VALUES (1,$1,$2)
       ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,
         refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,
         connected_at=now(),updated_at=now()`,
      [profile.email, encryptRefreshToken(tokens.refresh_token)],
    );
    console.log(`[Admin Gmail OAuth Success] Gmail sender account ${profile.email} linked successfully`);
    html(res, 200, "تم ربط Gmail بنجاح.");
  } catch (error) {
    console.error("[Admin Gmail OAuth Callback Exception]", error?.message || error);
    const techHint = error?.googleError || error?.message || "Internal verification error";
    html(res, 502, "تعذّر إكمال تفويض Gmail. تحقّق من إعداد Google وأعد المحاولة.", techHint);
  }
}

async function callback(res, url) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  console.log(`[Admin Gmail Callback] Path: ${url.pathname}, state_present=${Boolean(state)}, code_present=${Boolean(code)}, error=${errorParam || "none"}`);
  if (errorParam) {
    console.error(`[Admin Gmail Callback Error from Google] error="${errorParam}"`);
    if (errorParam === "access_denied") {
      html(
        res,
        403,
        "حساب Gmail غير مضاف كمستخدم اختبار لتطبيق Google.",
        "Add the SMTP_USER account to OAuth consent screen > Test users, then retry the Gmail connection.",
      );
      return;
    }
    html(res, 400, "انتهى التفويض أو تم إلغاؤه. أعد المحاولة من الإدارة.", `Google error: ${errorParam}`);
    return;
  }
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    console.warn(`[Admin Gmail Callback] Invalid state parameter`);
    html(res, 400, "رابط التفويض غير صالح.", "Invalid state parameter");
    return;
  }
  const used = await pool.query(
    `DELETE FROM gmail_oauth_states
      WHERE state_hash=$1 AND expires_at>now() RETURNING state_hash`,
    [stateHash(state)],
  );
  if (!used.rowCount) {
    // Check if this state was generated for driver verification
    const driverStateHash = createHash("sha256").update(state).digest("hex");
    const driverUsed = await pool.query(
      `DELETE FROM driver_gmail_states
        WHERE state_hash=$1 AND expires_at>now() RETURNING driver_id`,
      [driverStateHash],
    );
    if (driverUsed.rowCount) {
      console.log(`[Admin Gmail Callback] State matches driver_gmail_states for driver_id=${driverUsed.rows[0].driver_id}. Routing to driver verification.`);
      await processDriverVerification({
        res,
        driverId: driverUsed.rows[0].driver_id,
        code,
        redirectUri: getAdminGmailCallbackUrl(),
      });
      return;
    }
    console.warn(`[Admin Gmail Callback] State not found or expired`);
    html(res, 400, "انتهى التفويض أو تم إلغاؤه. أعد المحاولة من الإدارة.", "State not found or expired");
    return;
  }
  if (!code) {
    console.warn(`[Admin Gmail Callback] Missing code in query parameters`);
    html(res, 400, "انتهى التفويض أو تم إلغاؤه. أعد المحاولة من الإدارة.", "Missing authorization code");
    return;
  }
  await processAdminCallback({
    res,
    code,
    redirectUri: getAdminGmailCallbackUrl(),
  });
}

export async function handleGmailOAuthRoutes(req, res, url, { sendJson }) {
  const path = url.pathname;
  if (!path.startsWith("/api/admin/gmail/")) return false;
  if (path === "/api/admin/gmail/callback") {
    if (req.method !== "GET") sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    else await callback(res, url);
    return true;
  }
  if (!["/api/admin/gmail/status", "/api/admin/gmail/connect",
        "/api/admin/gmail/connection"].includes(path)) return false;
  await requireSession(req, "admin");
  if (path === "/api/admin/gmail/status" && req.method === "GET") {
    logSafeDiagnostics("Admin Gmail Status");
    const account = (await pool.query(
      "SELECT email,connected_at FROM gmail_oauth_accounts WHERE id=1",
    )).rows[0];
    sendJson(res, 200, {
      configured: Boolean(oauthConfig()),
      missingConfiguration: missingOAuthConfiguration(),
      connected: Boolean(account),
      email: account?.email ?? null,
      connectedAt: account?.connected_at ?? null,
      diagnostics: getSafeDiagnostics(),
    });
  } else if (path === "/api/admin/gmail/connect" && req.method === "POST") {
    logSafeDiagnostics("Admin Gmail Connect");
    const config = oauthConfig();
    if (!config) {
      sendJson(res, 503, { error: "GMAIL_NOT_CONFIGURED",
        message: `أكمل الإعداد التالي في Render: ${missingOAuthConfiguration().join("، ")}` });
      return true;
    }
    const state = randomBytes(32).toString("base64url");
    await pool.query("DELETE FROM gmail_oauth_states WHERE expires_at<=now()");
    await pool.query(
      "INSERT INTO gmail_oauth_states (state_hash,expires_at) VALUES ($1,now()+interval '10 minutes')",
      [stateHash(state)],
    );
    const authorize = new URL(AUTH_URL);
    for (const [key, value] of Object.entries({
      client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: "code", access_type: "offline", prompt: "consent",
      login_hint: config.expectedEmail,
      scope: `${SEND_SCOPE} openid email`, state,
    })) authorize.searchParams.set(key, value);
    console.log(`[Admin Gmail OAuth Init] Endpoint: /api/admin/gmail/connect, redirect_uri: ${config.redirectUri}, client_id: ${safeClientIdSnippet(config.clientId)}, client_secret_present: ${Boolean(config.clientSecret)}`);
    sendJson(res, 200, { authorizationUrl: authorize.toString() });
  } else if (path === "/api/admin/gmail/connection" && req.method === "DELETE") {
    await pool.query("DELETE FROM gmail_oauth_accounts WHERE id=1");
    sendJson(res, 200, { connected: false });
  } else {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  return true;
}