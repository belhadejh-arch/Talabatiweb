import { logger } from "./logger";

interface WhatsAppMessagePayload {
  restaurantName: string;
  orderId: number;
  customerName: string;
  customerPhone: string;
  items: string;
  total: string;
  mapsUrl: string;
  driverPhone: string;
}

export async function sendWhatsAppToDriver(payload: WhatsAppMessagePayload): Promise<boolean> {
  const { WHATSAPP_API_KEY, WHATSAPP_PHONE_ID } = process.env;

  if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_ID) {
    logger.warn("WhatsApp not configured — skipping message send");
    return false;
  }

  const message = `🚨 طلب توصيل جديد
🏪 المطعم: ${payload.restaurantName}
📦 الطلب: #${payload.orderId}
👤 العميل: ${payload.customerName}
📞 الهاتف: ${payload.customerPhone}
🍔 الطلب: ${payload.items}
💰 الإجمالي: ${payload.total}
📍 موقع العميل: ${payload.mapsUrl}`;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: payload.driverPhone,
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!response.ok) {
      logger.error({ status: response.status }, "WhatsApp API error");
      return false;
    }

    logger.info({ orderId: payload.orderId }, "WhatsApp message sent to driver");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send WhatsApp message");
    return false;
  }
}
