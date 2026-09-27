import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pool } from "./db.mjs";
import { handleApi } from "./api.mjs";
import { buildStats, parseStatsFilters } from "./stats.mjs";

function responseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
    }
  };
}

function jsonRequest(path, value) {
  const body = JSON.stringify(value);
  const req = Readable.from([Buffer.from(body)]);
  req.url = path;
  req.method = "POST";
  req.headers = {
    authorization: `Bearer ${"A".repeat(43)}`,
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body))
  };
  return req;
}

const ORDER_IDEMPOTENCY_KEY = "d3f803b9-8f64-43a2-8d8a-1452ef5b3281";

function sampleOrderInput(customerName = " Ada ") {
  return {
    restaurantId: 1,
    customerName,
    customerPhone: " 123 ",
    orderType: "delivery",
    latitude: 0,
    longitude: 0,
    notes: " note ",
    items: [{ productId: 1, quantity: 1, extraPrice: 0 }]
  };
}

function sampleNormalizedOrderHash(customerName = "Ada") {
  const normalized = {
    restaurantId: 1,
    customerName,
    customerPhone: "123",
    orderType: "DELIVERY",
    latitude: 0,
    longitude: 0,
    reservationDate: null,
    reservationTime: null,
    partySize: null,
    notes: "note",
    items: [{ productId: 1, quantity: 1, selectedSize: null, extraPrice: 0 }]
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function orderRequest(input, idempotencyKey = ORDER_IDEMPOTENCY_KEY) {
  const req = jsonRequest("/api/orders", input);
  req.headers["idempotency-key"] = idempotencyKey;
  return req;
}

function fakeExistingOrderRow() {
  return {
    id: 56,
    restaurant_id: 1,
    restaurant_name: "مطعم",
    customer_name: "Ada",
    customer_phone: "123",
    order_type: "DELIVERY",
    latitude: 0,
    longitude: 0,
    reservation_date: null,
    reservation_time: null,
    party_size: null,
    notes: "note",
    subtotal: "4.000",
    delivery_fee: "0.000",
    total_amount: "4.000",
    status: "NEW",
    assignment_status: null,
    driver_id: null,
    created_at: new Date("2026-04-04T09:00:00Z")
  };
}

function fakeOrderClient(query) {
  return {
    query,
    release() {}
  };
}

test("the API leaves email action routes to the dispatch handler", async () => {
  const res = responseRecorder();
  const handled = await handleApi(
    { url: "/api/driver-action?order_id=12", method: "GET", headers: {} },
    res
  );
  assert.equal(handled, false);
  assert.equal(res.statusCode, null);
});

test("the API leaves unrelated routes untouched", async () => {
  const res = responseRecorder();
  const handled = await handleApi(
    { url: "/health", method: "GET", headers: {} },
    res
  );
  assert.equal(handled, false);
  assert.equal(res.statusCode, null);
});

test("method-not-allowed responses are reported as handled", async () => {
  const res = responseRecorder();
  const handled = await handleApi(
    { url: "/api/catalog", method: "POST", headers: {} },
    res
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 405);
});

test("oversized JSON bodies are rejected before database access", async () => {
  const res = responseRecorder();
  let drained = false;
  const req = {
    url: "/api/admin/login",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(40 * 1024)
    },
    resume() {
      drained = true;
    }
  };
  const handled = await handleApi(req, res);
  assert.equal(handled, true);
  assert.equal(drained, true);
  assert.equal(res.statusCode, 413);
  assert.equal(JSON.parse(res.body).error, "REQUEST_ERROR");
});

test("statistics filters validate ranges and normalize supported periods", () => {
  const filters = parseStatsFilters(new URLSearchParams(
    "from=2026-01-01&to=2026-01-31&status=accepted&period=weekly&restaurantId=2"
  ));
  assert.deepEqual(filters, {
    from: "2026-01-01",
    to: "2026-01-31",
    status: "ACCEPTED",
    period: "weekly",
    restaurantId: 2,
    driverId: null
  });
});

test("statistics filters reject invalid ranges and statuses", () => {
  assert.throws(
    () => parseStatsFilters(new URLSearchParams("from=2026-02-01&to=2026-01-01")),
    /تاريخ البداية/
  );
  assert.throws(
    () => parseStatsFilters(new URLSearchParams("status=ALL")),
    /حالة الطلب/
  );
});

test("admin statistics count each distinct assignment but total order value once", () => {
  const stats = buildStats([{
    id: 42,
    driver_id: 5,
    order_status: "COMPLETED",
    total_amount: "80.00",
    driver_payout_amount: "7.25",
    created_at: "2026-03-12T10:00:00.000Z",
    restaurant_name: "مطعم",
    // These statuses represent unique (order_id, driver_id) assignments.
    assignment_statuses: ["REJECTED", "TIMEOUT", "ACCEPTED"]
  }], "month");

  assert.equal(stats.summary.totalOrders, 1);
  assert.equal(stats.summary.accepted, 1);
  assert.equal(stats.summary.rejected, 1);
  assert.equal(stats.summary.timeout, 1);
  assert.equal(stats.summary.completed, 1);
  assert.equal(stats.summary.totalOrderValue, 80);
  assert.equal(stats.summary.totalEarnings, 7.25);
  assert.equal(stats.periods[0].orders, 1);
  assert.equal(stats.periods[0].earnings, 7.25);
  assert.equal(stats.byRestaurant[0].orders, 1);
  assert.equal(stats.byRestaurant[0].earnings, 7.25);
});

test("driver statistics use the driver's assignment state, not another driver's current order state", () => {
  const stats = buildStats([{
    id: 43,
    driver_id: 12,
    order_status: "ACCEPTED",
    assignment_status: "REJECTED",
    total_amount: "45.00",
    driver_payout_amount: "9.00",
    created_at: "2026-03-12T10:00:00.000Z",
    restaurant_name: "مطعم"
  }], "month", { payoutDriverId: 7, driverScoped: true });

  assert.equal(stats.summary.totalOrders, 1);
  assert.equal(stats.summary.accepted, 0);
  assert.equal(stats.summary.rejected, 1);
  assert.equal(stats.summary.totalOrderValue, 45);
  assert.equal(stats.summary.totalEarnings, null);
  assert.equal(stats.periods[0].earnings, 0);
});

test("assignment-only filters do not attribute another driver's recorded payout", () => {
  const stats = buildStats([{
    id: 44,
    driver_id: 8,
    order_status: "COMPLETED",
    total_amount: "60.00",
    driver_payout_amount: "12.00",
    created_at: "2026-03-12T10:00:00.000Z",
    restaurant_name: "مطعم",
    assignment_statuses: ["REJECTED"]
  }], "month", { includePayouts: false });

  assert.equal(stats.summary.totalOrders, 1);
  assert.equal(stats.summary.totalOrderValue, 60);
  assert.equal(stats.summary.totalEarnings, null);
  assert.equal(stats.periods[0].earnings, 0);
});

test("an exact idempotent retry returns the existing order after normalized validation", async () => {
  const originalConnect = pool.connect;
  const priorHash = sampleNormalizedOrderHash();
  let priorLookups = 0;
  pool.connect = async () => fakeOrderClient(async (sql) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("client_request_id = $1::uuid")) {
      priorLookups += 1;
      return {
        rows: [{
          id: 56,
          client_request_hash: priorHash
        }]
      };
    }
    if (sql.includes("SELECT o.*, r.name AS restaurant_name")) {
      return { rows: [fakeExistingOrderRow()] };
    }
    if (sql.includes("SELECT product_id, product_name")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const res = responseRecorder();
    const handled = await handleApi(orderRequest(sampleOrderInput()), res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(priorLookups, 1);
    assert.equal(JSON.parse(res.body).order.id, 56);
  } finally {
    pool.connect = originalConnect;
  }
});

test("invalid order input is rejected before the idempotency lookup", async () => {
  const originalConnect = pool.connect;
  let connections = 0;
  pool.connect = async () => {
    connections += 1;
    throw new Error("Database lookup must not run for invalid input");
  };

  try {
    const res = responseRecorder();
    const handled = await handleApi(
      orderRequest({ ...sampleOrderInput(), items: [] }),
      res
    );
    assert.equal(handled, true);
    assert.equal(res.statusCode, 400);
    assert.equal(connections, 0);
  } finally {
    pool.connect = originalConnect;
  }
});

test("reusing an idempotency key with a different normalized payload returns 409", async () => {
  const originalConnect = pool.connect;
  pool.connect = async () => fakeOrderClient(async (sql) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("client_request_id = $1::uuid")) {
      return {
        rows: [{
          id: 56,
          client_request_hash: sampleNormalizedOrderHash()
        }]
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const res = responseRecorder();
    const handled = await handleApi(
      orderRequest(sampleOrderInput("Bea")),
      res
    );
    assert.equal(handled, true);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error, "REQUEST_ERROR");
  } finally {
    pool.connect = originalConnect;
  }
});

test("ON CONFLICT retries persist and compare the normalized request hash", async () => {
  const originalConnect = pool.connect;
  let priorLookups = 0;
  let insertQuery;
  pool.connect = async () => fakeOrderClient(async (sql, values = []) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("client_request_id = $1::uuid")) {
      priorLookups += 1;
      return priorLookups === 1
        ? { rows: [] }
        : { rows: [{ id: 56, client_request_hash: sampleNormalizedOrderHash() }] };
    }
    if (sql.includes("FROM restaurants r")) {
      return { rows: [{ id: 1, name: "مطعم", delivery_fee: "0.000" }] };
    }
    if (sql.includes("FROM products p")) {
      return {
        rows: [{
          id: 1,
          restaurant_id: 1,
          name: "Tea",
          name_ar: null,
          price: "4.000",
          is_available: true,
          stock_quantity: null
        }]
      };
    }
    if (sql.includes("INSERT INTO orders")) {
      insertQuery = { sql, values };
      return { rows: [] };
    }
    if (sql.includes("SELECT o.*, r.name AS restaurant_name")) {
      return { rows: [fakeExistingOrderRow()] };
    }
    if (sql.includes("SELECT product_id, product_name")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const res = responseRecorder();
    const handled = await handleApi(orderRequest(sampleOrderInput()), res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).order.id, 56);
    assert.equal(priorLookups, 2);
    assert.match(insertQuery.sql, /client_request_id, client_request_hash/);
    assert.equal(insertQuery.values.at(-2), ORDER_IDEMPOTENCY_KEY);
    assert.equal(insertQuery.values.at(-1), sampleNormalizedOrderHash());
  } finally {
    pool.connect = originalConnect;
  }
});

test("an ON CONFLICT fallback rejects a different payload hash", async () => {
  const originalConnect = pool.connect;
  let priorLookups = 0;
  let insertValues;
  pool.connect = async () => fakeOrderClient(async (sql, values = []) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("client_request_id = $1::uuid")) {
      priorLookups += 1;
      return priorLookups === 1
        ? { rows: [] }
        : { rows: [{ id: 56, client_request_hash: "different-payload-hash" }] };
    }
    if (sql.includes("FROM restaurants r")) {
      return { rows: [{ id: 1, name: "مطعم", delivery_fee: "0.000" }] };
    }
    if (sql.includes("FROM products p")) {
      return {
        rows: [{
          id: 1,
          restaurant_id: 1,
          name: "Tea",
          name_ar: null,
          price: "4.000",
          is_available: true,
          stock_quantity: null
        }]
      };
    }
    if (sql.includes("INSERT INTO orders")) {
      insertValues = values;
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  try {
    const res = responseRecorder();
    const handled = await handleApi(orderRequest(sampleOrderInput()), res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 409);
    assert.equal(priorLookups, 2);
    assert.equal(insertValues.at(-1), sampleNormalizedOrderHash());
  } finally {
    pool.connect = originalConnect;
  }
});

test("admin delivery listing exposes sanitized metadata and no action tokens", async () => {
  const originalQuery = pool.query;
  const originalPass = process.env.SMTP_PASS;
  const actionToken = "b".repeat(64);
  process.env.SMTP_PASS = "smtp-password-for-test";
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "ADMIN", owner_id: 1 }] };
    }
    if (sql.includes("FROM admins")) return { rows: [{ id: 1 }] };
    if (sql.includes("FROM order_email_deliveries")) {
      return {
        rows: [{
          id: 55,
          order_id: 90,
          assignment_id: 24,
          driver_id: 6,
          driver_email: "driver@example.com",
          status: "FAILED",
          sent_at: null,
          last_attempt_at: new Date("2026-04-04T10:00:00Z"),
          next_retry_at: null,
          error: `SMTP failure ${process.env.SMTP_PASS} token=${actionToken}`,
          retry_count: 2,
          created_at: new Date("2026-04-04T09:00:00Z"),
          updated_at: new Date("2026-04-04T10:00:00Z")
        }]
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const res = responseRecorder();
    const handled = await handleApi({
      url: "/api/admin/email-deliveries?status=FAILED",
      method: "GET",
      headers: { authorization: `Bearer ${"A".repeat(43)}` }
    }, res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls.at(-1).values, ["FAILED"]);
    const payload = JSON.parse(res.body);
    assert.equal(payload.deliveries[0].status, "FAILED");
    assert.equal(payload.deliveries[0].orderId, 90);
    assert.doesNotMatch(res.body, /smtp-password-for-test/);
    assert.doesNotMatch(res.body, new RegExp(actionToken));
    assert.doesNotMatch(res.body, /actionToken|token=/i);
  } finally {
    pool.query = originalQuery;
    if (originalPass == null) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = originalPass;
  }
});

test("invalid reconciliation state returns HTTP 409 without exposing secrets", async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const queryCalls = [];
  pool.query = async (sql, values) => {
    queryCalls.push(sql);
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "ADMIN", owner_id: 1 }] };
    }
    if (sql.includes("FROM admins")) return { rows: [{ id: 1 }] };
    if (sql.includes("FROM order_email_deliveries")) {
      return { rows: [{ order_id: 90, assignment_id: 24 }] };
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  const client = {
    async query(sql) {
      queryCalls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("SELECT e.*, a.status AS attempt_status")) {
        return {
          rows: [{
            status: "FAILED",
            attempt_status: "PENDING",
            job_state: "ACTIVE",
            order_status: "ASSIGNED",
            last_attempt_at: new Date("2026-04-04T09:00:00Z")
          }]
        };
      }
      return { rows: [] };
    },
    release() {}
  };
  pool.connect = async () => client;

  try {
    const res = responseRecorder();
    const handled = await handleApi(
      jsonRequest("/api/admin/email-deliveries/55/reconcile", { result: "SENT" }),
      res
    );
    assert.equal(handled, true);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error, "RECONCILIATION_CONFLICT");
    assert.ok(queryCalls.some((sql) => sql.includes("SELECT e.*, a.status AS attempt_status")));
    assert.doesNotMatch(res.body, /token|SMTP_PASS|smtp-password/i);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }
});