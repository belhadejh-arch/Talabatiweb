import nodemailer from "nodemailer";
import { gmailAccessToken } from "./gmail-oauth.mjs";

const mimeTransport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "unix",
});

export async function sendGmailMessage(account, payload, message, sendRequest = fetch) {
  let raw;
  try {
    const composed = await mimeTransport.sendMail({
      from: { name: "طلبات السائقين", address: account.email },
      to: payload.assignment.driver_email,
      messageId: `<talabat-order-${payload.order.id}-assignment-${payload.assignment.assignment_id}@gmail.com>`,
      ...message,
    });
    raw = composed.message.toString("base64url");
  } catch (error) {
    error.deliveryNotAccepted = true;
    throw error;
  }

  let response;
  try {
    response = await sendRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Google may have accepted the message before the connection was lost.
    throw new Error("Gmail API send result unconfirmed; check Gmail Sent");
  }
  if (!response.ok) {
    const error = new Error(`Gmail API rejected the message (${response.status})`);
    // An explicit client-side rejection means Google did not accept the send.
    // Server errors are ambiguous and require checking Gmail Sent.
    if ([400, 401, 403, 404, 429].includes(response.status)) {
      error.deliveryNotAccepted = true;
    }
    throw error;
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Gmail API accepted the request but returned an unconfirmed result");
  }
  if (!result?.id) {
    throw new Error("Gmail API accepted the request without a message ID");
  }
  return true;
}

export async function sendGmailIfConnected(payload, message) {
  const account = await gmailAccessToken();
  if (!account) return false;
  if (isOlderThanGmailConnection(payload, account.connectedAt)) {
    const error = new Error("Older delivery predates Gmail connection; not sending automatically");
    error.deliveryNotAccepted = true;
    throw error;
  }
  return sendGmailMessage(account, payload, message);
}

export function isOlderThanGmailConnection(payload, connectedAt) {
  const connected = new Date(connectedAt).getTime();
  return new Date(payload.order.created_at).getTime() < connected ||
    new Date(payload.assignment.created_at).getTime() < connected;
}