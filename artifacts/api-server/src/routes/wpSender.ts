import { Router, type IRouter, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  createWpSenderSession,
  extractWpSenderSessionId,
  extractWpSenderSessionIds,
  getWpSenderConfigStatus,
  getWpSenderQr,
  getWpSenderSessionDetails,
  getWpSenderSessionStatus,
  getStoredWpSenderSessionId,
  listWpSenderSessions,
  normalizeWhatsAppNumber,
  parseDriverOrderResponse,
  parseWpSenderWebhookMessage,
  reconnectWpSenderSession,
  requestWpSenderPairingCode,
  setWpSenderWebhook,
  storeWpSenderSessionId,
} from "../lib/wpSender";
import { respondToOrderAttempt } from "../lib/driverDispatch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function providerError(res: Response, error: unknown): void {
  res.status(502).json({ error: error instanceof Error ? error.message : "WP Sender request failed" });
}

router.get("/wp-sender/session", requireAuth, async (_req, res): Promise<void> => {
  const currentSessionId = await getStoredWpSenderSessionId();
  if (!currentSessionId) {
    try {
      const sessions = await listWpSenderSessions();
      const sessionIds = extractWpSenderSessionIds(sessions);
      if (sessionIds.length === 1) await storeWpSenderSessionId(sessionIds[0]);
    } catch (error) {
      logger.warn({ err: error }, "Unable to auto-discover an existing WP Sender session");
    }
  }
  res.json(await getWpSenderConfigStatus());
});

router.get("/wp-sender/sessions", requireAuth, async (_req, res): Promise<void> => {
  try {
    res.json(await listWpSenderSessions());
  } catch (error) {
    providerError(res, error);
  }
});

router.post("/wp-sender/session/create", requireAuth, async (_req, res): Promise<void> => {
  try {
    const providerResponse = await createWpSenderSession();
    const sessionId = extractWpSenderSessionId(providerResponse);
    if (!sessionId) {
      res.status(502).json({ error: "WP Sender did not return a sessionId for the new session" });
      return;
    }
    await storeWpSenderSessionId(sessionId);
    res.status(201).json({ providerResponse, sessionId });
  } catch (error) {
    providerError(res, error);
  }
});

router.get("/wp-sender/session/status", requireAuth, async (_req, res): Promise<void> => {
  const sessionId = await getStoredWpSenderSessionId();
  if (!sessionId) { res.status(400).json({ error: "No WP Sender WhatsApp session has been created" }); return; }
  try {
    res.json(await getWpSenderSessionStatus(sessionId));
  } catch (error) {
    providerError(res, error);
  }
});

router.get("/wp-sender/session/details", requireAuth, async (_req, res): Promise<void> => {
  const sessionId = await getStoredWpSenderSessionId();
  if (!sessionId) { res.status(400).json({ error: "No WP Sender WhatsApp session has been created" }); return; }
  try {
    res.json(await getWpSenderSessionDetails(sessionId));
  } catch (error) {
    providerError(res, error);
  }
});

router.post("/wp-sender/session/reconnect", requireAuth, async (_req, res): Promise<void> => {
  const sessionId = await getStoredWpSenderSessionId();
  if (!sessionId) { res.status(400).json({ error: "No WP Sender WhatsApp session has been created" }); return; }
  try {
    res.json(await reconnectWpSenderSession(sessionId));
  } catch (error) {
    providerError(res, error);
  }
});

router.get("/wp-sender/session/qr", requireAuth, async (req, res): Promise<void> => {
  const sessionId = await getStoredWpSenderSessionId();
  if (!sessionId) { res.status(400).json({ error: "No WP Sender WhatsApp session has been created" }); return; }
  const output = req.query.output === "image" || req.query.output === "raw" ? req.query.output : "base64";
  try {
    const qr = await getWpSenderQr(sessionId, output);
    res.type(qr.contentType).send(qr.body);
  } catch (error) {
    providerError(res, error);
  }
});

router.post("/wp-sender/session/pairing-code", requireAuth, async (req, res): Promise<void> => {
  const sessionId = await getStoredWpSenderSessionId();
  const phoneNumber = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber : "";
  if (!sessionId) { res.status(400).json({ error: "No WP Sender WhatsApp session has been created" }); return; }
  if (!phoneNumber.trim()) { res.status(400).json({ error: "phoneNumber is required" }); return; }
  try {
    res.json(await requestWpSenderPairingCode(sessionId, phoneNumber));
  } catch (error) {
    providerError(res, error);
  }
});

router.post("/wp-sender/session/webhook", requireAuth, async (req, res): Promise<void> => {
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  const webhookUrl = typeof req.body?.webhookUrl === "string" ? req.body.webhookUrl.trim() : "";
  if (!sessionId || !webhookUrl) { res.status(400).json({ error: "sessionId and webhookUrl are required" }); return; }
  try {
    res.json(await setWpSenderWebhook(sessionId, webhookUrl));
  } catch (error) {
    providerError(res, error);
  }
});

router.post("/webhooks/wp-sender", async (req, res): Promise<void> => {
  const incoming = parseWpSenderWebhookMessage(req.body);
  if (!incoming) { res.json({ received: true, handled: false }); return; }

  const normalizedPhone = normalizeWhatsAppNumber(incoming.from);
  const driverResult = await pool.query<{ id: number }>(
    `SELECT id FROM drivers
     WHERE is_active = true AND status = 'ACTIVE'
       AND regexp_replace(COALESCE(whatsapp_number, ''), '[^0-9]', '', 'g') = $1
     LIMIT 1`,
    [normalizedPhone],
  );
  const driver = driverResult.rows[0];
  const response = parseDriverOrderResponse(incoming.text);
  if (!driver || !response) { res.json({ received: true, handled: false }); return; }

  try {
    const handled = await respondToOrderAttempt(response.orderId, driver.id, response.response);
    logger.info({ orderId: response.orderId, driverId: driver.id, handled }, "Processed WP Sender driver response");
    res.json({ received: true, handled });
  } catch (error) {
    logger.error({ err: error, orderId: response.orderId, driverId: driver.id }, "Failed to process WP Sender webhook");
    res.status(500).json({ error: "Failed to process driver response" });
  }
});

export default router;