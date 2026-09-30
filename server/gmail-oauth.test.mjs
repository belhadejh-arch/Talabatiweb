import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePublicApiOrigin,
  getSafeDiagnostics,
  getAdminGmailCallbackUrl,
  oauthConfig,
  missingOAuthConfiguration,
} from "./gmail-oauth.mjs";
import { getDriverGmailCallbackUrl } from "./driver-gmail.mjs";

test("parsePublicApiOrigin accepts valid HTTPS origins with or without path, trailing slash, or quotes", () => {
  // Standard HTTPS without path
  assert.equal(parsePublicApiOrigin("https://talabatiweb-wo8o.onrender.com"), "https://talabatiweb-wo8o.onrender.com");
  // With trailing slash
  assert.equal(parsePublicApiOrigin("https://talabatiweb-wo8o.onrender.com/"), "https://talabatiweb-wo8o.onrender.com");
  // With /api path (does not reject, extracts origin)
  assert.equal(parsePublicApiOrigin("https://talabatiweb-wo8o.onrender.com/api"), "https://talabatiweb-wo8o.onrender.com");
  // With subpath and trailing slash
  assert.equal(parsePublicApiOrigin("https://talabatiweb-wo8o.onrender.com/api/"), "https://talabatiweb-wo8o.onrender.com");
  // With surrounding double quotes (common when copied into Render env vars)
  assert.equal(parsePublicApiOrigin('"https://talabatiweb-wo8o.onrender.com"'), "https://talabatiweb-wo8o.onrender.com");
  // With surrounding single quotes
  assert.equal(parsePublicApiOrigin("'https://talabatiweb-wo8o.onrender.com/'"), "https://talabatiweb-wo8o.onrender.com");
  // With leading/trailing whitespace
  assert.equal(parsePublicApiOrigin("  https://talabatiweb-wo8o.onrender.com  \n"), "https://talabatiweb-wo8o.onrender.com");
});

test("parsePublicApiOrigin rejects non-HTTPS, invalid, or empty URLs", () => {
  assert.equal(parsePublicApiOrigin("http://talabatiweb-wo8o.onrender.com"), null);
  assert.equal(parsePublicApiOrigin("http://localhost:8080"), null);
  assert.equal(parsePublicApiOrigin("not-a-url"), null);
  assert.equal(parsePublicApiOrigin(""), null);
  assert.equal(parsePublicApiOrigin(undefined), null);
  assert.equal(parsePublicApiOrigin(null), null);
});

test("getAdminGmailCallbackUrl and getDriverGmailCallbackUrl generate exact redirect URIs", () => {
  const url = "https://talabatiweb-wo8o.onrender.com";
  assert.equal(getAdminGmailCallbackUrl(url), "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
  assert.equal(getDriverGmailCallbackUrl(url), "https://talabatiweb-wo8o.onrender.com/api/driver/gmail/callback");

  // Also when PUBLIC_API_URL has trailing slash or /api
  assert.equal(getAdminGmailCallbackUrl("https://talabatiweb-wo8o.onrender.com/"), "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
  assert.equal(getAdminGmailCallbackUrl("https://talabatiweb-wo8o.onrender.com/api"), "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
});

test("getSafeDiagnostics returns safe booleans without exposing secrets", () => {
  const original = process.env.PUBLIC_API_URL;
  try {
    process.env.PUBLIC_API_URL = "https://talabatiweb-wo8o.onrender.com";
    const diag1 = getSafeDiagnostics();
    assert.deepEqual(diag1, { hasPublicApiUrl: true, isHttps: true });

    process.env.PUBLIC_API_URL = "http://talabatiweb-wo8o.onrender.com";
    const diag2 = getSafeDiagnostics();
    assert.deepEqual(diag2, { hasPublicApiUrl: true, isHttps: false });

    process.env.PUBLIC_API_URL = "";
    const diag3 = getSafeDiagnostics();
    assert.deepEqual(diag3, { hasPublicApiUrl: false, isHttps: false });

    delete process.env.PUBLIC_API_URL;
    const diag4 = getSafeDiagnostics();
    assert.deepEqual(diag4, { hasPublicApiUrl: false, isHttps: false });
  } finally {
    if (original !== undefined) {
      process.env.PUBLIC_API_URL = original;
    } else {
      delete process.env.PUBLIC_API_URL;
    }
  }
});

test("oauthConfig and missingOAuthConfiguration validate PUBLIC_API_URL properly", () => {
  const envBackup = {
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    SMTP_USER: process.env.SMTP_USER,
  };

  try {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id-123";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret-456";
    process.env.SMTP_USER = "sender@gmail.com";
    process.env.PUBLIC_API_URL = "https://talabatiweb-wo8o.onrender.com";

    const config = oauthConfig();
    assert.ok(config);
    assert.equal(config.clientId, "client-id-123");
    assert.equal(config.clientSecret, "client-secret-456");
    assert.equal(config.expectedEmail, "sender@gmail.com");
    assert.equal(config.redirectUri, "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
    assert.deepEqual(missingOAuthConfiguration(), []);

    // Trailing slash in PUBLIC_API_URL
    process.env.PUBLIC_API_URL = "https://talabatiweb-wo8o.onrender.com/";
    const configWithSlash = oauthConfig();
    assert.ok(configWithSlash);
    assert.equal(configWithSlash.redirectUri, "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
    assert.deepEqual(missingOAuthConfiguration(), []);

    // /api in PUBLIC_API_URL
    process.env.PUBLIC_API_URL = "https://talabatiweb-wo8o.onrender.com/api";
    const configWithPath = oauthConfig();
    assert.ok(configWithPath);
    assert.equal(configWithPath.redirectUri, "https://talabatiweb-wo8o.onrender.com/api/admin/gmail/callback");
    assert.deepEqual(missingOAuthConfiguration(), []);

    // Missing PUBLIC_API_URL
    delete process.env.PUBLIC_API_URL;
    assert.equal(oauthConfig(), null);
    assert.ok(missingOAuthConfiguration().includes("PUBLIC_API_URL (HTTPS origin only)"));

    // Non-HTTPS PUBLIC_API_URL
    process.env.PUBLIC_API_URL = "http://talabatiweb-wo8o.onrender.com";
    assert.equal(oauthConfig(), null);
    assert.ok(missingOAuthConfiguration().includes("PUBLIC_API_URL (HTTPS origin only)"));
  } finally {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
  }
});
