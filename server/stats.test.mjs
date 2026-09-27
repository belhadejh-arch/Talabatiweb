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
  assert.doesNotMatch(captured.sql, /\bLIMIT\b/);
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