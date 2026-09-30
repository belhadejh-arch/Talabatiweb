import test from "node:test";
import assert from "node:assert/strict";
import { encryptRefreshToken, decryptRefreshToken } from "./gmail-oauth.mjs";
import { isOlderThanGmailConnection, sendGmailMessage } from "./gmail-api.mjs";

const account = { email: "sender@gmail.com", accessToken: "test-access-token" };
const payload = {
  order: { id: 401 },
  assignment: { assignment_id: 901, driver_email: "driver@example.com" },
};
const message = {
  subject: "طلب جديد",
  text: "نص الطلب",
  html: "<p>نص الطلب</p>",
};

test("Gmail refresh tokens are encrypted and authenticated at rest", () => {
  const encrypted = encryptRefreshToken("refresh-token-test-only");
  assert.doesNotMatch(encrypted, /refresh-token-test-only/);
  assert.equal(decryptRefreshToken(encrypted), "refresh-token-test-only");
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptRefreshToken(parts.join(".")));
});

test("pre-connection orders and assignments cannot be mailed as new deliveries", () => {
  const createdBefore = "2026-09-27T10:00:00Z";
  const connectedAt = "2026-09-27T11:00:00Z";
  const createdAfter = "2026-09-27T12:00:00Z";
  assert.equal(isOlderThanGmailConnection({
    order: { created_at: createdBefore }, assignment: { created_at: createdAfter },
  }, connectedAt), true);
  assert.equal(isOlderThanGmailConnection({
    order: { created_at: createdAfter }, assignment: { created_at: createdBefore },
  }, connectedAt), true);
  assert.equal(isOlderThanGmailConnection({
    order: { created_at: createdAfter }, assignment: { created_at: createdAfter },
  }, connectedAt), false);
});

test("Gmail API sends MIME only to the assigned driver's saved address", async () => {
  let calls = 0;
  const sent = await sendGmailMessage(account, payload, message, async (url, options) => {
    calls++;
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, "Bearer test-access-token");
    const mime = Buffer.from(JSON.parse(options.body).raw, "base64url").toString("utf8");
    assert.match(mime, /To: driver@example\.com/i);
    assert.match(mime, /From: .*sender@gmail\.com/i);
    assert.match(mime, /talabat-order-401-assignment-901@gmail\.com/i);
    assert.match(mime, /multipart\/alternative/i);
    return { ok: true, json: async () => ({ id: "gmail-message-id" }) };
  });
  assert.equal(calls, 1);
  assert.equal(sent, true);
});

test("explicit Gmail rejection is retryable, but an unconfirmed result is not", async () => {
  await assert.rejects(
    sendGmailMessage(account, payload, message, async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({
        error: {
          status: "PERMISSION_DENIED",
          message: "Gmail API has not been enabled",
          errors: [{ reason: "forbidden" }],
        },
      }),
    })),
    (error) => error.deliveryNotAccepted === true &&
      /PERMISSION_DENIED: Gmail API has not been enabled: forbidden/.test(error.message),
  );
  await assert.rejects(
    sendGmailMessage(account, payload, message, async () => ({ ok: false, status: 503 })),
    (error) => error.deliveryNotAccepted !== true,
  );
  await assert.rejects(
    sendGmailMessage(account, payload, message, async () => ({ ok: false, status: 408 })),
    (error) => error.deliveryNotAccepted !== true,
  );
  await assert.rejects(
    sendGmailMessage(account, payload, message, async () => { throw new Error("socket closed"); }),
    (error) => error.deliveryNotAccepted !== true && !/socket closed/.test(error.message),
  );
  await assert.rejects(
    sendGmailMessage(account, payload, message, async () => ({ ok: true, json: async () => ({}) })),
    (error) => error.deliveryNotAccepted !== true,
  );
});