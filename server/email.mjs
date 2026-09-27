import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { sendGmailIfConnected } from "./gmail-api.mjs";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const money = (value) =>
  `${Number(value ?? 0).toFixed(2)} د.ل`;

const formattedDate = (value) =>
  new Intl.DateTimeFormat("ar-LY", {
    timeZone: "Africa/Tripoli",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));

const dateOnly = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "غير محدد").slice(0, 10);

const timeOnly = (value) =>
  value ? String(value).slice(0, 5) : "غير محدد";

function signingSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET (at least 32 characters) is required for email actions");
  }
  return secret;
}

export function actionToken(assignment) {
  const data = `driver-email-v1:${assignment.order_id}:${assignment.assignment_id}:${assignment.driver_id}:${new Date(assignment.created_at).toISOString()}`;
  return createHmac("sha256", signingSecret()).update(data).digest("hex");
}

export function validActionToken(assignment, provided) {
  if (typeof provided !== "string" || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  const actual = Buffer.from(actionToken(assignment), "hex");
  const expected = Buffer.from(provided, "hex");
  return timingSafeEqual(actual, expected);
}

function linkFor(baseUrl, assignment, decision) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseUrl)) {
    throw new Error("PUBLIC_API_URL must be an HTTPS URL (localhost HTTP is allowed for development)");
  }
  const url = new URL("/api/driver-action", baseUrl);
  url.searchParams.set("order_id", assignment.order_id);
  url.searchParams.set("assignment_id", assignment.assignment_id);
  url.searchParams.set("driver_id", assignment.driver_id);
  url.searchParams.set("token", actionToken(assignment));
  url.searchParams.set("decision", decision);
  return url.toString();
}

export function buildAssignmentEmail({ order, restaurant, items, assignment, baseUrl }) {
  if (order.order_type === "DELIVERY" &&
      (order.latitude == null || order.longitude == null)) {
    throw new Error("A delivery email requires real coordinates");
  }
  const acceptUrl = linkFor(baseUrl, assignment, "ACCEPTED");
  const rejectUrl = linkFor(baseUrl, assignment, "REJECTED");
  const isDelivery = order.order_type === "DELIVERY";
  const mapUrl = isDelivery
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${order.latitude},${order.longitude}`)}`
    : null;
  const rows = items.map((item) => {
    const label = `${item.product_name}${item.size_name ? ` (${item.size_name})` : ""}`;
    const addons = item.addons?.length
      ? ` — ${item.addons.map((addon) => `${addon.addon_name} (${money(addon.price)})`).join("، ")}`
      : "";
    return {
      text: `${label}${addons} ×${item.quantity} — ${money(item.unit_price)} = ${money(item.subtotal)}`,
      html: `<li>${escapeHtml(label)}${escapeHtml(addons)} ×${item.quantity} — ${escapeHtml(money(item.unit_price))} = ${escapeHtml(money(item.subtotal))}</li>`,
    };
  });
  const extra = isDelivery
    ? [
        `Latitude: ${order.latitude}`,
        `Longitude: ${order.longitude}`,
        `Google Maps: ${mapUrl}`,
      ]
    : [
        `تاريخ الحجز: ${dateOnly(order.reservation_date)}`,
        `وقت الحجز: ${timeOnly(order.reservation_time)}`,
        `عدد الأشخاص: ${order.party_size ?? "غير محدد"}`,
      ];
  const extraHtml = isDelivery
    ? `<p>Latitude: ${escapeHtml(order.latitude)}<br>Longitude: ${escapeHtml(order.longitude)}<br><a href="${escapeHtml(mapUrl)}">Google Maps</a></p>`
    : `<p>تاريخ الحجز: ${escapeHtml(dateOnly(order.reservation_date))}<br>وقت الحجز: ${escapeHtml(timeOnly(order.reservation_time))}<br>عدد الأشخاص: ${escapeHtml(order.party_size ?? "غير محدد")}</p>`;
  const lines = [
    `طلب #${order.id} — ${isDelivery ? "توصيل" : "حجز"}`,
    `المطعم: ${restaurant.name}`,
    `الزبون: ${order.customer_name}`,
    `الهاتف: ${order.customer_phone}`,
    ...rows.map((row) => row.text),
    `الإجمالي: ${money(order.total_amount)}`,
    `الملاحظات: ${order.notes || "لا توجد"}`,
    `تاريخ ووقت الطلب: ${formattedDate(order.created_at)}`,
    ...extra,
    `قبول الطلب: ${acceptUrl}`,
    `رفض الطلب: ${rejectUrl}`,
  ];
  return {
    subject: `طلب ${isDelivery ? "توصيل" : "حجز"} #${order.id} — ${restaurant.name}`,
    text: lines.join("\n"),
    html: `<div lang="ar" dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.8">
      <h2>طلب #${order.id} — ${isDelivery ? "توصيل" : "حجز"}</h2>
      <p><strong>المطعم:</strong> ${escapeHtml(restaurant.name)}<br>
      <strong>الزبون:</strong> ${escapeHtml(order.customer_name)}<br>
      <strong>الهاتف:</strong> ${escapeHtml(order.customer_phone)}</p>
      <h3>المنتجات</h3><ul>${rows.map((row) => row.html).join("")}</ul>
      <p><strong>الإجمالي:</strong> ${escapeHtml(money(order.total_amount))}<br>
      <strong>الملاحظات:</strong> ${escapeHtml(order.notes || "لا توجد")}<br>
      <strong>تاريخ ووقت الطلب:</strong> ${escapeHtml(formattedDate(order.created_at))}</p>
      ${extraHtml}
      <p><a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:10px 16px;background:#166534;color:white;text-decoration:none">قبول الطلب</a>
      &nbsp; <a href="${escapeHtml(rejectUrl)}" style="display:inline-block;padding:10px 16px;background:#991b1b;color:white;text-decoration:none">رفض الطلب</a></p>
      <p>الروابط تفتح صفحة تأكيد؛ تنتهي صلاحيتها بعد خمس دقائق من إرسال الرسالة.</p>
    </div>`,
  };
}

let transport;
export async function sendAssignmentEmail(payload) {
  let message;
  try {
    message = buildAssignmentEmail(payload);
  } catch (error) {
    error.deliveryNotAccepted = true;
    throw error;
  }
  // Gmail API uses HTTPS and works on hosts that block SMTP egress. A linked
  // Gmail account always takes precedence; never fall back to SMTP on an
  // unconfirmed API result, which could send the same order twice.
  if (await sendGmailIfConnected(payload, message)) return;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = process.env.SMTP_SECURE || "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  try {
    if (host !== "smtp.gmail.com" || port !== 465 || secure !== "true") {
      throw new Error("Gmail SMTP must use smtp.gmail.com:465 with SMTP_SECURE=true");
    }
    if (!user || !pass || !/^[^@\s]+@gmail\.com$/i.test(user)) {
      throw new Error("SMTP_USER must be a Gmail address and SMTP_PASS must be a Gmail App Password");
    }
    if (!transport) {
      transport = nodemailer.createTransport({
        host,
        port,
        secure: true,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
  } catch (error) {
    // All validation/transport-construction errors happen before any SMTP I/O.
    error.smtpNotStarted = true;
    throw error;
  }
  const result = await transport.sendMail({
    from: { name: "طلبات السائقين", address: user },
    to: payload.assignment.driver_email,
    messageId: `<talabat-order-${payload.order.id}-assignment-${payload.assignment.assignment_id}@gmail.com>`,
    ...message,
  });
  if (!result.accepted?.some((address) =>
    address.toLowerCase() === payload.assignment.driver_email.toLowerCase())) {
    throw new Error("SMTP did not confirm the selected driver as a recipient");
  }
}