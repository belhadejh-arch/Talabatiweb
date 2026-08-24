import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ListNotificationsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const qp = ListNotificationsQueryParams.safeParse(req.query);
  const page = qp.success ? (qp.data.page ?? 1) : 1;
  const limit = qp.success ? (qp.data.limit ?? 20) : 20;
  const unreadOnly = qp.success ? qp.data.unreadOnly : false;
  const offset = (page - 1) * limit;

  const where = unreadOnly ? eq(notificationsTable.isRead, false) : undefined;

  const [notifications, totalResult, unreadResult] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(notificationsTable).where(where),
    db.select({ count: count() }).from(notificationsTable).where(eq(notificationsTable.isRead, false)),
  ]);

  res.json({
    data: notifications,
    total: totalResult[0].count,
    unreadCount: unreadResult[0].count,
  });
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id));
  res.json({ ok: true });
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.isRead, false));
  res.json({ ok: true });
});

export default router;
