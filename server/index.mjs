import http from "node:http";
import { pool } from "./db.mjs";
import { handleApi } from "./api.mjs";
import { previewEmailAction, respondToEmailAction, startDispatchWorker } from "./dispatch.mjs";

function reply(res, status, contentType, content) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(content);
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

function page(message, body = "") {
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>الرد على الطلب</title><body style="font:18px Arial,sans-serif;max-width:550px;margin:60px auto;padding:20px;line-height:1.8">
  <h1>${escapeHtml(message)}</h1>${body}</body></html>`;
}

function actionInput(params) {
  return {
    orderId: params.get("order_id"),
    assignmentId: params.get("assignment_id"),
    driverId: params.get("driver_id"),
    token: params.get("token"),
    decision: params.get("decision"),
  };
}

async function readForm(req) {
  if (!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) {
    throw new Error("Invalid form content type");
  }
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8_192) throw new Error("Form too large");
  }
  return new URLSearchParams(body);
}

async function emailAction(req, res, url) {
  if (req.method === "GET") {
    const input = actionInput(url.searchParams);
    const preview = await previewEmailAction(input);
    if (!preview.ok) {
      reply(res, 410, "text/html; charset=utf-8", page("رابط الطلب غير صالح أو انتهت صلاحيته"));
      return;
    }
    // GET never changes state: email security scanners often open links automatically.
    const title = input.decision === "ACCEPTED" ? "تأكيد قبول الطلب" : "تأكيد رفض الطلب";
    const hidden = [
      ["order_id", input.orderId],
      ["assignment_id", input.assignmentId],
      ["driver_id", input.driverId],
      ["token", input.token],
      ["decision", input.decision],
    ].map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
    reply(res, 200, "text/html; charset=utf-8", page(title,
      `<p>الطلب #${preview.orderId}. اضغط للتأكيد. لا يمكن التراجع عن الرد.</p>
       <form method="post" action="/api/driver-action">${hidden}
       <button style="padding:12px 20px;font:inherit" type="submit">${title}</button></form>`));
    return;
  }
  if (req.method === "POST") {
    let input;
    try {
      input = actionInput(await readForm(req));
    } catch {
      reply(res, 400, "text/html; charset=utf-8", page("طلب غير صالح"));
      return;
    }
    const outcome = await respondToEmailAction(input);
    reply(res, outcome.ok ? 200 : 410, "text/html; charset=utf-8",
      page(outcome.ok
        ? (outcome.decision === "ACCEPTED" ? "تم قبول الطلب" : "تم رفض الطلب")
        : outcome.reason));
    return;
  }
  reply(res, 405, "text/html; charset=utf-8", page("طريقة الطلب غير مدعومة"));
}

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters");
}
const initialized = (await pool.query(
  "SELECT to_regclass('public.order_email_dispatch_jobs') AS jobs, to_regclass('public.order_email_deliveries') AS deliveries",
)).rows[0];
if (!initialized.jobs || !initialized.deliveries) {
  throw new Error("Apply server/migrations/001_driver_email_dispatch.sql before starting the API");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://internal.invalid");
    if (url.pathname === "/health" || url.pathname === "/api/healthz") {
      await pool.query("SELECT 1");
      reply(res, 200, "application/json; charset=utf-8", JSON.stringify({ status: "ok" }));
    } else if (url.pathname === "/api/driver-action") {
      await emailAction(req, res, url);
    } else if (!await handleApi(req, res)) {
      reply(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    console.error("API request failed:", error.code ?? error.name);
    if (!res.headersSent) {
      reply(res, 500, "application/json; charset=utf-8", JSON.stringify({ error: "Server error" }));
    } else {
      res.end();
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
  startDispatchWorker();
});
process.on("SIGTERM", () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});