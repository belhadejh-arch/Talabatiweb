import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getTelegramBotStatus, getTelegramRecentChats } from "../lib/telegram";

const router: IRouter = Router();

router.get("/telegram/status", requireAuth, async (_req, res): Promise<void> => {
  const status = await getTelegramBotStatus();
  res.json(status);
});

/**
 * A driver can open the bot and send /start. Admins can then fetch the latest
 * chats and copy the correct Chat ID into the driver's record.
 */
router.get("/telegram/recent-chats", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json({ data: await getTelegramRecentChats() });
  } catch (error) {
    req.log.error({ err: error }, "Failed to read Telegram chats");
    res.status(502).json({ error: error instanceof Error ? error.message : "Failed to read Telegram chats" });
  }
});

export default router;