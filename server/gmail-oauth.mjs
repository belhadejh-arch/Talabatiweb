import {
  createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes,
} from "node:crypto";
import { pool } from "./db.mjs";
import { requireSession } from "./auth.mjs";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function oauthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const expectedEmail = process.env.SMTP_USER;
  let redirectUri;
  try {
    const base = new URL(process.env.PUBLIC_API_URL);
    if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
      throw new Error("Invalid API origin");
    }
    redirectUri = new URL("/api/admin/gmail/callback", base).toString();
  } catch {
    return null;
  }
  return clientId && clientSecret && expectedEmail
    ? { clientId, clientSecret, expectedEmail, redirectUri }
    : null;
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

function html(res, status, message) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    "x-content-type-options": "nosniff",
  });
  res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
    <title>ربط Gmail</title><body style="font:18px Arial,sans-serif;padding:32px;line-height:1.8">
    <h1>${message}</h1><p>أغلق هذه النافذة ثم حدّث حالة Gmail في صفحة الإعدادات.</p></body></html>`);
}

async function tokenRequest(config, parameters) {
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
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
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
  const account = result.rows[0];
  if (!account) return null;
  const config = oauthConfig();
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

async function callback(res, url) {
  const state = url.searchParams.get("state");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    html(res, 400, "رابط التفويض غير صالح.");
    return;
  }
  const used = await pool.query(
    `DELETE FROM gmail_oauth_states
      WHERE state_hash=$1 AND expires_at>now() RETURNING state_hash`,
    [stateHash(state)],
  );
  if (!used.rowCount || url.searchParams.has("error") ||
      !url.searchParams.get("code")) {
    html(res, 400, "انتهى التفويض أو تم إلغاؤه. أعد المحاولة من الإدارة.");
    return;
  }
  const config = oauthConfig();
  if (!config) {
    html(res, 503, "إعداد Gmail API على الخادم غير مكتمل.");
    return;
  }
  try {
    const tokens = await tokenRequest(config, {
      grant_type: "authorization_code",
      code: url.searchParams.get("code"),
      redirect_uri: config.redirectUri,
    });
    if (!tokens.refresh_token || !tokens.access_token) {
      throw new Error("Offline authorization did not provide a refresh token");
    }
    const profileResponse = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileResponse.ok) throw new Error("Google account verification failed");
    const profile = await profileResponse.json();
    if (!profile.email_verified ||
        profile.email?.toLowerCase() !== config.expectedEmail.toLowerCase()) {
      html(res, 403, "استخدم حساب Gmail المُعدّ مسبقاً للإرسال على الخادم.");
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
    html(res, 200, "تم ربط Gmail بنجاح.");
  } catch {
    // OAuth codes and token responses must not be logged or shown to the browser.
    html(res, 502, "تعذّر إكمال تفويض Gmail. تحقّق من إعداد Google وأعد المحاولة.");
  }
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
    const account = (await pool.query(
      "SELECT email,connected_at FROM gmail_oauth_accounts WHERE id=1",
    )).rows[0];
    sendJson(res, 200, {
      configured: Boolean(oauthConfig()),
      connected: Boolean(account),
      email: account?.email ?? null,
      connectedAt: account?.connected_at ?? null,
    });
  } else if (path === "/api/admin/gmail/connect" && req.method === "POST") {
    const config = oauthConfig();
    if (!config) {
      sendJson(res, 503, { error: "GMAIL_NOT_CONFIGURED",
        message: "اضبط GOOGLE_OAUTH_CLIENT_ID وGOOGLE_OAUTH_CLIENT_SECRET وPUBLIC_API_URL وSMTP_USER في Render." });
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
      scope: `${SEND_SCOPE} openid email`, state,
    })) authorize.searchParams.set(key, value);
    sendJson(res, 200, { authorizationUrl: authorize.toString() });
  } else if (path === "/api/admin/gmail/connection" && req.method === "DELETE") {
    await pool.query("DELETE FROM gmail_oauth_accounts WHERE id=1");
    sendJson(res, 200, { connected: false });
  } else {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  return true;
}