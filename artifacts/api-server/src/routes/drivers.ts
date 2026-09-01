import { Router, type IRouter } from "express";
import { db, pool, driversTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateDriverBody,
  UpdateDriverBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Platform-wide driver list with assignment outcome counters.
router.get("/drivers", requireAuth, async (_req, res): Promise<void> => {
  const result = await pool.query(`
    SELECT
      d.*,
      r.name AS restaurant_name,
      COUNT(a.id) FILTER (WHERE a.status = 'ACCEPTED')::int AS accepted_count,
      COUNT(a.id) FILTER (WHERE a.status = 'REJECTED')::int AS rejected_count,
      COUNT(a.id) FILTER (WHERE a.status = 'TIMEOUT')::int AS timeout_count
    FROM drivers d
    JOIN restaurants r ON r.id = d.restaurant_id
    LEFT JOIN order_driver_attempts a ON a.driver_id = d.id
    GROUP BY d.id, r.name
    ORDER BY d.created_at DESC, d.id DESC
  `);

  res.json(result.rows.map((driver) => ({
    id: driver.id,
    restaurantId: driver.restaurant_id,
    name: driver.name,
    phone: driver.phone,
    telegramChatId: driver.telegram_chat_id,
    address: driver.address,
    vehicleType: driver.vehicle_type,
    vehiclePlate: driver.vehicle_plate,
    isActive: driver.is_active,
    status: driver.status,
    totalDeliveries: driver.total_deliveries,
    createdAt: driver.created_at,
    restaurantName: driver.restaurant_name,
    acceptedCount: driver.accepted_count,
    rejectedCount: driver.rejected_count,
    timeoutCount: driver.timeout_count,
  })));
});

// List drivers for a restaurant
router.get("/restaurants/:id/drivers", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const drivers = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.restaurantId, restaurantId))
    .orderBy(desc(driversTable.createdAt));

  res.json(drivers);
});

// Create driver
router.post("/restaurants/:id/drivers", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = parseInt(raw, 10);
  if (isNaN(restaurantId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [driver] = await db
    .insert(driversTable)
    .values({
      ...parsed.data,
      restaurantId,
      isActive: false,
      status: "INACTIVE",
    })
    .returning();

  res.status(201).json(driver);
});

// Update driver
router.patch("/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.isActive === true) {
    res.status(400).json({ error: "يجب على السائق تفعيل نشاطه من Telegram" });
    return;
  }

  const updateValues = {
    ...parsed.data,
    ...(parsed.data.isActive !== undefined
      ? { status: parsed.data.isActive ? "ACTIVE" : "INACTIVE" }
      : {}),
  };

  const [driver] = await db
    .update(driversTable)
    .set(updateValues)
    .where(eq(driversTable.id, id))
    .returning();

  if (!driver) { res.status(404).json({ error: "Not found" }); return; }
  res.json(driver);
});

// Detailed assignment history for one driver.
router.get("/drivers/:id/history", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const result = await pool.query(
    `SELECT
       a.id,
       a.order_id AS "orderId",
       a.driver_id AS "driverId",
       a.status,
       a.sent_at AS "sentAt",
       a.responded_at AS "respondedAt",
       a.timeout_at AS "timeoutAt",
       o.customer_name AS "customerName",
       o.customer_phone AS "customerPhone",
       o.total_amount AS "totalAmount",
       o.status AS "orderStatus",
       o.created_at AS "orderCreatedAt"
     FROM order_driver_attempts a
     JOIN orders o ON o.id = a.order_id
     WHERE a.driver_id = $1
     ORDER BY a.sent_at DESC, a.id DESC`,
    [id],
  );
  res.json(result.rows.map((row) => ({ ...row, totalAmount: Number(row.totalAmount) })));
});

// Delete driver
router.delete("/drivers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(driversTable).where(eq(driversTable.id, id));
  res.sendStatus(204);
});

export default router;
