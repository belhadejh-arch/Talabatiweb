import { Router, type IRouter } from "express";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LoginBody, ChangePasswordBody, ChangeEmailBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username));

  if (!admin) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  (req as any).session.adminId = admin.id;
  (req as any).session.adminRole = admin.role;

  res.json({
    user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
  });
});

router.post("/auth/logout", (req, res): void => {
  (req as any).session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const adminId = (req as any).session.adminId;
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, adminId));
  if (!admin) {
    res.status(401).json({ error: "Not found" });
    return;
  }
  res.json({ id: admin.id, username: admin.username, email: admin.email, role: admin.role });
});

router.patch("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const adminId = (req as any).session.adminId;
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, adminId));
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(adminsTable).set({ passwordHash: newHash }).where(eq(adminsTable.id, adminId));

  res.json({ ok: true });
});

router.patch("/auth/change-email", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangeEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const adminId = (req as any).session.adminId;
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, adminId));
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const [updated] = await db
    .update(adminsTable)
    .set({ email: parsed.data.newEmail })
    .where(eq(adminsTable.id, adminId))
    .returning();

  res.json({ id: updated.id, username: updated.username, email: updated.email, role: updated.role });
});

export default router;
