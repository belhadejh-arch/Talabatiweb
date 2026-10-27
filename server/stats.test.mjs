import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.mjs";
import { getAdminStats, getDriverOrders } from "./stats.mjs";

const emptyFilters = {
  from: null,
  to: null,
  status: null,
  period: "month",
  restaurantId: null,
  driverId: null
};

test("admin status filtering uses the selected driver's matching assignment", async () => {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  };

  try {
    await getAdminStats({
      ...emptyFilters,
      status: "REJECTED",
      driverId: 19
    });
  } finally {
    pool.query = originalQuery;
  }

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].values, [19, "REJECTED", 19, "REJECTED"]);
  assert.match(
    calls[0].sql,
    /status_attempt\.driver_id = \$1\s+AND status_attempt\.status = \$2/
  );
  assert.match(calls[0].sql, /a\.driver_id = \$3 AND a\.status = \$4/);
  assert.match(calls[1].sql, /a\.driver_id = \$1/);
  assert.match(calls[1].sql, /a\.status = \$2/);
});

test("driver order history is scoped to that driver's unique attempt rows", async () => {
  const originalQuery = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [] };
  };

  try {
    await getDriverOrders(23, emptyFilters);
  } finally {
    pool.query = originalQuery;
  }

  assert.deepEqual(captured.values, [23]);
  assert.match(captured.sql, /WHERE a\.driver_id = \$1/);
  assert.match(captured.sql, /delivery\.status AS current_driver_email_status/);
  assert.match(
    captured.sql,
    /LEFT JOIN order_email_deliveries delivery\s+ON delivery\.assignment_id = a\.assignment_id/
  );
  assert.match(captured.sql, /o\.source = 'ANDROID_CUSTOMER'/);
  assert.match(captured.sql, /a\.status IN \('PENDING','ACCEPTED'\)/);
  assert.match(captured.sql, /o\.status <> 'CANCELLED'/);
  assert.match(captured.sql, /ORDER BY o\.created_at DESC, o\.id DESC\s*$/);
});

test("driver invoice feed shows pending invoices before email confirmation", async () => {
  const originalQuery = pool.query;
  const now = new Date("2026-10-27T10:00:00.000Z");
  let sql;
  pool.query = async (statement) => {
    sql = statement;
    return {
      rows: [{
        id: 12, restaurant_id: 5, restaurant_name: "Restaurant",
        order_type: "DELIVERY", status: "ASSIGNED",
        assignment_status: "PENDING", current_driver_email_status: "FAILED",
        source: "ANDROID_CUSTOMER", created_at: now, items: [],
      }],
    };
  };

  try {
    const orders = await getDriverOrders(23, emptyFilters);
    assert.match(sql, /o\.source = 'ANDROID_CUSTOMER'/);
    assert.match(sql, /o\.status <> 'CANCELLED'/);
    assert.match(sql, /a\.status IN \('PENDING','ACCEPTED'\)/);
    assert.doesNotMatch(sql, /delivery\.status = 'SENT'/);
    assert.deepEqual(orders.map((order) => order.id), [12]);
    assert.equal(orders[0].assignmentStatus, "PENDING");
    assert.equal(orders[0].currentDriverEmailStatus, "FAILED");
  } finally {
    pool.query = originalQuery;
  }
});

test("completed-order history only includes the driver currently assigned to that order", async () => {
  const originalQuery = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [] };
  };

  try {
    await getDriverOrders(23, {
      ...emptyFilters,
      status: "COMPLETED"
    });
  } finally {
    pool.query = originalQuery;
  }

  assert.deepEqual(captured.values, [23, "COMPLETED"]);
  assert.match(captured.sql, /o\.status = \$2/);
  assert.match(captured.sql, /a\.driver_id = o\.driver_id/);
});