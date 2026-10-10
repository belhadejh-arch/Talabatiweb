import { pool } from "./db.mjs";
import { buildOrderInvoice } from "./invoice.mjs";

const ORDER_STATUSES = new Set([
  "NEW",
  "ASSIGNED",
  "CONFIRMED",
  "ACCEPTED",
  "REJECTED",
  "TIMEOUT",
  "COMPLETED",
  "CANCELLED",
  "WAITING_FOR_DRIVER",
  "DELIVERED"
]);
const ASSIGNMENT_STATUSES = new Set([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "TIMEOUT",
  "CANCELLED"
]);
const PERIODS = new Set(["day", "daily", "week", "weekly", "month", "monthly", "year", "yearly", "custom"]);

export class StatsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function parseDate(value, name) {
  if (value == null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new StatsError(`قيمة ${name} يجب أن تكون بالتنسيق YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new StatsError(`قيمة ${name} غير صالحة.`);
  }
  return value;
}

function parseId(value, name) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new StatsError(`قيمة ${name} غير صالحة.`);
  }
  return parsed;
}

export function parseStatsFilters(searchParams) {
  const from = parseDate(searchParams.get("from"), "from");
  const to = parseDate(searchParams.get("to"), "to");
  if (from && to && from > to) {
    throw new StatsError("تاريخ البداية يجب ألا يأتي بعد تاريخ النهاية.");
  }

  const rawStatus = searchParams.get("status");
  const status = rawStatus ? rawStatus.trim().toUpperCase() : null;
  if (status && !ORDER_STATUSES.has(status) && !ASSIGNMENT_STATUSES.has(status)) {
    throw new StatsError("حالة الطلب غير مدعومة.");
  }

  const rawPeriod = (searchParams.get("period") || "month").trim().toLowerCase();
  if (!PERIODS.has(rawPeriod)) {
    throw new StatsError("الفترة المطلوبة غير مدعومة.");
  }

  return {
    from,
    to,
    status,
    period: rawPeriod,
    restaurantId: parseId(searchParams.get("restaurantId"), "restaurantId"),
    driverId: parseId(searchParams.get("driverId"), "driverId")
  };
}

function appendFilters(clauses, values, filters, { allowDriverFilter = true } = {}) {
  let driverParameter = null;
  if (filters.from) {
    values.push(filters.from);
    clauses.push(`o.created_at >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`o.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (filters.restaurantId) {
    values.push(filters.restaurantId);
    clauses.push(`o.restaurant_id = $${values.length}`);
  }
  if (allowDriverFilter && filters.driverId) {
    values.push(filters.driverId);
    driverParameter = `$${values.length}`;
    if (["CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)) {
      clauses.push(`o.driver_id = ${driverParameter}`);
    } else {
      clauses.push(
        `(o.driver_id = ${driverParameter} OR EXISTS (
           SELECT 1 FROM order_driver_attempts filter_attempt
            WHERE filter_attempt.order_id = o.id
              AND filter_attempt.driver_id = ${driverParameter}
         ))`
      );
    }
  }
  if (filters.status) {
    values.push(filters.status);
    const parameter = `$${values.length}`;
    if (driverParameter && filters.status === "CANCELLED") {
      clauses.push(
        `(EXISTS (
           SELECT 1 FROM order_driver_attempts status_attempt
            WHERE status_attempt.order_id = o.id
              AND status_attempt.driver_id = ${driverParameter}
              AND status_attempt.status = ${parameter}
         ) OR (o.status = ${parameter} AND o.driver_id = ${driverParameter}))`
      );
    } else if (driverParameter && ASSIGNMENT_STATUSES.has(filters.status)) {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM order_driver_attempts status_attempt
            WHERE status_attempt.order_id = o.id
              AND status_attempt.driver_id = ${driverParameter}
              AND status_attempt.status = ${parameter}
         )`
      );
    } else {
      clauses.push(
        `(o.status = ${parameter} OR EXISTS (
           SELECT 1 FROM order_driver_attempts status_attempt
            WHERE status_attempt.order_id = o.id
              AND status_attempt.status = ${parameter}
         ))`
      );
    }
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function bucketFor(dateValue, rawPeriod) {
  const date = new Date(dateValue);
  const period = rawPeriod === "custom" || rawPeriod === "daily"
    ? "day"
    : rawPeriod.replace(/ly$/, "");
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (period === "year") return String(year);
  if (period === "month") return `${year}-${month}`;
  if (period === "week") {
    const monday = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
    const weekday = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - weekday);
    return monday.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function buildStats(
  rows,
  period,
  { payoutDriverId = null, driverScoped = false, includePayouts = true } = {}
) {
  const groupedPeriods = new Map();
  const groupedRestaurants = new Map();
  const totals = {
    totalOrders: rows.length,
    accepted: 0,
    rejected: 0,
    timeout: 0,
    cancelled: 0,
    completed: 0,
    totalOrderValue: 0,
    totalEarnings: 0,
    earningsRows: 0,
    resolvedAttempts: 0,
    acceptedAttempts: 0,
    rejectedAttempts: 0
  };

  for (const row of rows) {
    const statuses = Array.isArray(row.assignment_statuses)
      ? row.assignment_statuses
      : row.assignment_status
        ? [row.assignment_status]
        : [];
    const orderStatus = String(row.order_status || row.status || "").toUpperCase();
    const isCompleted = ["COMPLETED", "DELIVERED"].includes(orderStatus);
    const isCancelled = orderStatus === "CANCELLED";
    const assignmentCount = (status) =>
      statuses.filter((assignmentStatus) => assignmentStatus === status).length;
    const acceptedAssignments = assignmentCount("ACCEPTED") ||
      (!driverScoped && !statuses.length && ["ACCEPTED", "CONFIRMED"].includes(orderStatus) ? 1 : 0);
    const rejectedAssignments = assignmentCount("REJECTED") ||
      (!driverScoped && !statuses.length && orderStatus === "REJECTED" ? 1 : 0);
    const timeoutAssignments = assignmentCount("TIMEOUT") ||
      (!driverScoped && !statuses.length && orderStatus === "TIMEOUT" ? 1 : 0);
    const amount = Number(row.total_amount || 0);
    const payout = !includePayouts ||
      row.driver_payout_amount == null ||
      (payoutDriverId != null && Number(row.driver_id) !== Number(payoutDriverId))
      ? null
      : Number(row.driver_payout_amount);

    totals.totalOrderValue += amount;
    totals.accepted += acceptedAssignments;
    totals.rejected += rejectedAssignments;
    totals.timeout += timeoutAssignments;
    if (isCancelled) totals.cancelled += 1;
    if (isCompleted) totals.completed += 1;
    for (const status of statuses) {
      if (["ACCEPTED", "REJECTED", "TIMEOUT"].includes(status)) {
        totals.resolvedAttempts += 1;
        if (status === "ACCEPTED") totals.acceptedAttempts += 1;
        if (status === "REJECTED") totals.rejectedAttempts += 1;
      }
    }
    if (payout != null) {
      totals.totalEarnings += payout;
      totals.earningsRows += 1;
    }

    const bucket = bucketFor(row.created_at, period);
    const periodGroup = groupedPeriods.get(bucket) || {
      period: bucket,
      orders: 0,
      orderValue: 0,
      earnings: 0
    };
    periodGroup.orders += 1;
    periodGroup.orderValue += amount;
    if (payout != null) periodGroup.earnings += payout;
    groupedPeriods.set(bucket, periodGroup);

    const restaurantName = row.restaurant_name || "—";
    const restaurantGroup = groupedRestaurants.get(restaurantName) || {
      name: restaurantName,
      orders: 0,
      orderValue: 0,
      earnings: 0
    };
    restaurantGroup.orders += 1;
    restaurantGroup.orderValue += amount;
    if (payout != null) restaurantGroup.earnings += payout;
    groupedRestaurants.set(restaurantName, restaurantGroup);
  }

  const resolved = totals.resolvedAttempts;
  return {
    summary: {
      totalOrders: totals.totalOrders,
      accepted: totals.accepted,
      rejected: totals.rejected,
      timeout: totals.timeout,
      cancelled: totals.cancelled,
      completed: totals.completed,
      totalOrderValue: roundMoney(totals.totalOrderValue),
      totalEarnings: totals.earningsRows ? roundMoney(totals.totalEarnings) : null,
      averageOrderValue: rows.length
        ? roundMoney(totals.totalOrderValue / rows.length)
        : 0,
      acceptanceRate: resolved
        ? roundMoney((totals.acceptedAttempts / resolved) * 100)
        : 0,
      rejectionRate: resolved
        ? roundMoney((totals.rejectedAttempts / resolved) * 100)
        : 0
    },
    periods: [...groupedPeriods.values()]
      .map((group) => ({
        ...group,
        orderValue: roundMoney(group.orderValue),
        earnings: roundMoney(group.earnings)
      }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byRestaurant: [...groupedRestaurants.values()]
      .map((group) => ({
        ...group,
        orderValue: roundMoney(group.orderValue),
        earnings: roundMoney(group.earnings)
      }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name)),
    byDriver: []
  };
}

async function loadAdminOrderRows(filters) {
  const clauses = ["TRUE"];
  const values = [];
  appendFilters(clauses, values, filters);
  const attemptFilters = [];
  if (filters.driverId) {
    values.push(filters.driverId);
    attemptFilters.push(`a.driver_id = $${values.length}`);
  }
  if (filters.status && ASSIGNMENT_STATUSES.has(filters.status)) {
    values.push(filters.status);
    attemptFilters.push(`a.status = $${values.length}`);
  }
  const attemptsWhere = attemptFilters.length
    ? `AND ${attemptFilters.join(" AND ")}`
    : "";
  const result = await pool.query(
    `SELECT o.id, o.driver_id, o.status AS order_status, o.total_amount,
            o.driver_payout_amount, o.created_at,
            r.name AS restaurant_name,
            COALESCE(attempts.assignment_statuses, ARRAY[]::text[]) AS assignment_statuses
       FROM orders o
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(a.status::text) AS assignment_statuses
           FROM order_driver_attempts a
          WHERE a.order_id = o.id
            ${attemptsWhere}
       ) attempts ON TRUE
      WHERE ${clauses.join(" AND ")}
      ORDER BY o.created_at DESC`,
    values
  );
  return result.rows;
}

async function loadAdminDriverGroups(filters) {
  const clauses = ["TRUE"];
  const values = [];
  const earningsExpression = !filters.status ||
    ["ACCEPTED", "CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)
    ? "CASE WHEN o.driver_id = d.id THEN o.driver_payout_amount ELSE NULL END"
    : "NULL::numeric";
  if (filters.from) {
    values.push(filters.from);
    clauses.push(`o.created_at >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`o.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (filters.restaurantId) {
    values.push(filters.restaurantId);
    clauses.push(`o.restaurant_id = $${values.length}`);
  }
  if (filters.driverId) {
    values.push(filters.driverId);
    clauses.push(`a.driver_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    const parameter = `$${values.length}`;
    if (filters.status === "CANCELLED") {
      clauses.push(
        `(a.status = ${parameter} OR
          (o.status = ${parameter} AND a.driver_id = o.driver_id))`
      );
    } else if (ASSIGNMENT_STATUSES.has(filters.status)) {
      clauses.push(`a.status = ${parameter}`);
    } else {
      clauses.push(`o.status = ${parameter}`);
      if (["CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)) {
        clauses.push("a.driver_id = o.driver_id");
      }
    }
  }
  const result = await pool.query(
    `SELECT d.id AS driver_id, d.name AS driver_name,
            COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(${earningsExpression}), 0)::float8 AS earnings
       FROM order_driver_attempts a
       JOIN orders o ON o.id = a.order_id
       JOIN drivers d ON d.id = a.driver_id
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.id, d.name
      ORDER BY orders DESC, d.name`,
    values
  );
  return result.rows.map((row) => ({
    name: row.driver_name,
    orders: Number(row.orders),
    earnings: roundMoney(row.earnings)
  }));
}

export async function getAdminStats(filters) {
  const rows = await loadAdminOrderRows(filters);
  const stats = buildStats(rows, filters.period, {
    payoutDriverId: filters.driverId,
    includePayouts: !filters.status ||
      ["ACCEPTED", "CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)
  });
  stats.byDriver = await loadAdminDriverGroups(filters);
  return stats;
}

export async function getAdminRestaurantRevenues(anchorDate) {
  const today = parseDate(anchorDate, "date");
  if (!today) throw new StatsError("التاريخ مطلوب.");

  const end = new Date(`${today}T00:00:00.000Z`);
  const formatDate = (date) => date.toISOString().slice(0, 10);
  const tomorrow = new Date(end);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekStart = new Date(end);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));

  const result = await pool.query(
    `SELECT r.id AS restaurant_id,
            COUNT(o.id) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $1::date AND o.created_at < $2::date
            )::int AS daily_orders,
            COALESCE(SUM(o.total_amount) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $1::date AND o.created_at < $2::date
            ), 0)::float8 AS daily_revenue,
            COUNT(o.id) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $3::date AND o.created_at < $4::date
            )::int AS weekly_orders,
            COALESCE(SUM(o.total_amount) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $3::date AND o.created_at < $4::date
            ), 0)::float8 AS weekly_revenue,
            COUNT(o.id) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $5::date AND o.created_at < $6::date
            )::int AS monthly_orders,
            COALESCE(SUM(o.total_amount) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $5::date AND o.created_at < $6::date
            ), 0)::float8 AS monthly_revenue,
            COUNT(o.id) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $7::date AND o.created_at < $8::date
            )::int AS yearly_orders,
            COALESCE(SUM(o.total_amount) FILTER (
              WHERE o.status <> 'CANCELLED'
                AND o.created_at >= $7::date AND o.created_at < $8::date
            ), 0)::float8 AS yearly_revenue
       FROM restaurants r
       LEFT JOIN orders o ON o.restaurant_id = r.id
      GROUP BY r.id
      ORDER BY r.id`,
    [
      today, formatDate(tomorrow),
      formatDate(weekStart), formatDate(tomorrow),
      formatDate(monthStart), formatDate(tomorrow),
      formatDate(yearStart), formatDate(tomorrow)
    ]
  );

  return {
    revenues: result.rows.map((row) => ({
      restaurantId: Number(row.restaurant_id),
      dailyOrders: Number(row.daily_orders),
      dailyRevenue: roundMoney(row.daily_revenue),
      weeklyOrders: Number(row.weekly_orders),
      weeklyRevenue: roundMoney(row.weekly_revenue),
      monthlyOrders: Number(row.monthly_orders),
      monthlyRevenue: roundMoney(row.monthly_revenue),
      yearlyOrders: Number(row.yearly_orders),
      yearlyRevenue: roundMoney(row.yearly_revenue)
    }))
  };
}

async function loadDriverOrderRows(driverId, filters, limit = null) {
  const clauses = ["a.driver_id = $1"];
  const values = [driverId];
  if (filters.from) {
    values.push(filters.from);
    clauses.push(`o.created_at >= $${values.length}::date`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`o.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (filters.restaurantId) {
    values.push(filters.restaurantId);
    clauses.push(`o.restaurant_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    const parameter = `$${values.length}`;
    if (ASSIGNMENT_STATUSES.has(filters.status)) {
      if (filters.status === "CANCELLED") {
        clauses.push(
          `(a.status = ${parameter} OR
            (o.status = ${parameter} AND a.driver_id = o.driver_id))`
        );
      } else {
        clauses.push(`a.status = ${parameter}`);
      }
    } else {
      clauses.push(`o.status = ${parameter}`);
      if (["CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)) {
        clauses.push("a.driver_id = o.driver_id");
      }
    }
  }
  const limitClause = limit == null ? "" : `LIMIT $${values.push(limit)}`;
  const result = await pool.query(
    `SELECT o.*, r.name AS restaurant_name,
            a.status AS assignment_status,
            a.driver_id AS assignment_driver_id,
            a.driver_email,
            cancellation.note AS cancellation_reason,
            cancellation.created_at AS cancellation_at,
            COALESCE(order_lines.items, '[]'::json) AS items
       FROM order_driver_attempts a
       JOIN orders o ON o.id = a.order_id
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN LATERAL (
         SELECT h.note, h.created_at
           FROM order_status_history h
          WHERE h.order_id = o.id AND h.status = 'CANCELLED'
          ORDER BY h.created_at DESC, h.id DESC
          LIMIT 1
       ) cancellation ON o.status = 'CANCELLED'
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'productId', oi.product_id,
           'productName', oi.product_name,
           'quantity', oi.quantity,
           'unitPrice', oi.unit_price,
           'subtotal', oi.subtotal,
            'selectedSize', oi.size_name,
            'addons', COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'addonName', ia.addon_name,
                 'price', ia.price
               ) ORDER BY ia.id)
                 FROM order_item_addons ia
                WHERE ia.order_item_id = oi.id),
              '[]'::json
            )
         ) ORDER BY oi.id) AS items
           FROM order_items oi
          WHERE oi.order_id = o.id
       ) order_lines ON TRUE
      WHERE ${clauses.join(" AND ")}
      ORDER BY o.created_at DESC, o.id DESC
       ${limitClause}`,
    values
  );

  return result.rows;
}

function mapDriverOrderRow(row) {
  return buildOrderInvoice(
    row,
    { name: row.restaurant_name || "" },
    row.items || [],
    row.assignment_status || null
  );
}

export async function getDriverOrders(driverId, filters, { limit = null } = {}) {
  const rows = await loadDriverOrderRows(driverId, filters, limit);
  return rows.map(mapDriverOrderRow);
}

export async function getDriverStats(driverId, filters) {
  const rows = await loadDriverOrderRows(driverId, filters);
  const statsRows = rows.map((row) => ({
    id: row.id,
    driver_id: row.driver_id,
    order_status: row.status,
    assignment_status: row.assignment_status,
    total_amount: row.total_amount,
    driver_payout_amount:
      Number(row.driver_id) === Number(driverId)
        ? row.driver_payout_amount
        : null,
    created_at: row.created_at,
    restaurant_name: row.restaurant_name
  }));
  return buildStats(statsRows, filters.period, {
    payoutDriverId: driverId,
    driverScoped: true,
    includePayouts: !filters.status ||
      ["ACCEPTED", "CONFIRMED", "COMPLETED", "DELIVERED"].includes(filters.status)
  });
}