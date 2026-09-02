import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { parseDriverOrderResponse, parseWapiWebhookMessage } from "../lib/whatsapp";
import { respondToOrderAttempt } from "../lib/driverDispatch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * WapiSender calls this backend-only endpoint for inbound driver replies.
 * Configure the webhook URL in WapiSender to point to /api/webhooks/wapisender.
 */
router.post("/webhooks/wapisender", async (req, res): Promise<void> => {
  const incoming = parseWapiWebhookMessage(req.body);
  const response = incoming ? parseDriverOrderResponse(incoming.text) : null;

  if (!incoming || !response) {
    res.status(200).json({ received: true, handled: false });
    return;
  }

  const driverResult = await pool.query<{ id: number }>(
    `SELECT id
     FROM drivers
     WHERE regexp_replace(COALESCE(whatsapp_number, ''), '[^0-9]', '', 'g') = $1
       AND is_active = true
       AND status = 'ACTIVE'
     ORDER BY id ASC
     LIMIT 1`,
    [incoming.from],
  );
  const driver = driverResult.rows[0];
  if (!driver) {
    res.status(200).json({ received: true, handled: false });
    return;
  }

  try {
    const handled = await respondToOrderAttempt(response.orderId, driver.id, response.response);
    logger.info(
      { orderId: response.orderId, driverId: driver.id, response: response.response, handled },
      "Processed WapiSender driver response",
    );
    res.status(200).json({ received: true, handled });
  } catch (error) {
    logger.error({ err: error, orderId: response.orderId, driverId: driver.id }, "Failed to process WapiSender webhook");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;