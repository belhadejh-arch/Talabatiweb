import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("PostgreSQL API HTTP integration: catalog, orders, drivers and filtered stats", {
  skip: !testDatabaseUrl
}, async () => {
  const target = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  const dedicatedTestDatabase = /(^|[-_])(test|testing)([-_]|$)/i.test(databaseName);
  const explicitlyApprovedDevelopmentFixture =
    process.env.ALLOW_DEV_DB_FIXTURE_TESTS === "1" &&
    testDatabaseUrl === process.env.DATABASE_URL &&
    !/prod|production/i.test(databaseName);
  if (!dedicatedTestDatabase && !explicitlyApprovedDevelopmentFixture) {
    throw new Error(
      "Refusing integration test: use a test-named database or explicitly opt into temporary fixtures on the development DATABASE_URL."
    );
  }

  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testDatabaseUrl;

  const { pool } = await import("../db.mjs");
  const { handleApi } = await import("../api.mjs");
  const bcrypt = (await import("bcryptjs")).default;
  const fixtures = {
    restaurants: [],
    categories: [],
    products: [],
    subscriptions: [],
    drivers: [],
    orders: [],
    admins: [],
    sessionHashes: [],
    suffix: null
  };

  let server;
  let baseline;
  let beforeOrders;
  const cleanupErrors = [];

  const requiredColumns = {
    restaurants: ["id", "name", "slug", "phone", "address", "description", "status",
      "logo_url", "cover_url", "delivery_fee"],
    categories: ["id", "restaurant_id", "name", "name_ar"],
    products: ["id", "restaurant_id", "category_id", "name", "name_ar",
      "description", "description_ar", "image_url", "price", "is_available",
      "stock_quantity", "sort_order"],
    subscriptions: ["id", "restaurant_id", "plan", "status", "start_date", "expiry_date"],
    drivers: ["id", "restaurant_id", "name", "phone", "email", "is_active",
      "status", "serial_number", "created_at"],
    admins: ["id", "username", "password_hash"],
    api_sessions: ["token_hash", "role", "owner_id", "expires_at"],
    auth_rate_limits: ["key_hash", "attempts", "reset_at"],
    orders: ["id", "restaurant_id", "customer_name", "customer_phone", "notes",
      "latitude", "longitude", "maps_url", "subtotal", "delivery_fee", "total_amount",
      "status", "order_type", "source", "reservation_date", "reservation_time",
      "party_size", "client_request_id", "client_request_hash", "driver_id", "created_at",
      "updated_at"],
    order_items: ["id", "order_id", "product_id", "product_name", "quantity",
      "unit_price", "subtotal", "size_id", "size_name"],
    order_status_history: ["id", "order_id", "status", "note"],
    order_email_dispatch_jobs: ["order_id", "state", "next_check_at", "created_at", "updated_at"],
    order_email_deliveries: ["id", "order_id", "assignment_id", "status"],
    order_driver_attempts: ["assignment_id", "order_id", "driver_id", "status"]
  };
  const countedTables = [
    "restaurants", "categories", "products", "subscriptions", "drivers", "admins",
    "api_sessions", "auth_rate_limits", "orders", "order_items", "order_status_history",
    "order_email_dispatch_jobs", "order_email_deliveries", "order_driver_attempts"
  ];

  async function inspectAndValidateSchema() {
    const result = await pool.query(
      `SELECT table_name, column_name, is_nullable, column_default, is_identity, is_generated
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])`,
      [Object.keys(requiredColumns)]
    );
    const columnsByTable = new Map();
    for (const row of result.rows) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
      columnsByTable.get(row.table_name).set(row.column_name, row);
    }
    for (const [table, required] of Object.entries(requiredColumns)) {
      const columns = columnsByTable.get(table);
      assert.ok(columns, `Required test schema table ${table} is missing.`);
      for (const name of required) {
        assert.ok(columns.has(name), `Required test schema column ${table}.${name} is missing.`);
      }
    }

    const adminColumns = columnsByTable.get("admins");
    for (const column of adminColumns.values()) {
      if (
        column.is_nullable === "NO" &&
        !column.column_default &&
        column.is_identity !== "YES" &&
        column.is_generated !== "ALWAYS" &&
        !["username", "password_hash"].includes(column.column_name)
      ) {
        throw new Error("Refusing to create a temporary admin: admins table has an unsupported required column.");
      }
    }
    const idColumn = adminColumns.get("id");
    assert.ok(
      idColumn.column_default || idColumn.is_identity === "YES",
      "Refusing to create a temporary admin without a generated ID."
    );
  }

  async function snapshotCounts() {
    const counts = {};
    for (const table of countedTables) {
      const result = await pool.query(`SELECT count(*)::integer AS count FROM ${table}`);
      counts[table] = result.rows[0].count;
    }
    return counts;
  }

  async function snapshotOrders() {
    const result = await pool.query(
      `SELECT id, status, driver_id, updated_at
         FROM orders
        ORDER BY id`
    );
    return result.rows.map((row) => [
      Number(row.id),
      row.status,
      row.driver_id == null ? null : Number(row.driver_id),
      new Date(row.updated_at).toISOString()
    ]);
  }

  async function preflightSafeDispatch() {
    const dueJobs = await pool.query(
      `SELECT count(*)::integer AS count
         FROM order_email_dispatch_jobs
        WHERE state = 'ACTIVE'`
    );
    assert.equal(
      dueJobs.rows[0].count,
      0,
      "Refusing to run: test database already has active dispatch jobs."
    );
    const existingDriverAttempts = await pool.query(
      `SELECT count(*)::integer AS count
         FROM order_driver_attempts a
         JOIN order_email_deliveries e ON e.assignment_id = a.assignment_id
        WHERE e.status IN ('PENDING', 'FAILED', 'SENDING')
          AND a.status = 'PENDING'`
    );
    assert.equal(
      existingDriverAttempts.rows[0].count,
      0,
      "Refusing to run: test database has pending email deliveries."
    );
  }

  async function request(baseUrl, path, { method = "GET", body, token, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`API returned non-JSON response (${response.status}).`);
    }
    return { status: response.status, payload };
  }

  async function startHttpServer() {
    server = createServer((req, res) => {
      Promise.resolve(handleApi(req, res)).then((handled) => {
        if (!handled && !res.writableEnded) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "NOT_FOUND" }));
        }
      }).catch(() => {
        if (!res.writableEnded) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "INTEGRATION_HANDLER_FAILURE" }));
        }
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    return `http://127.0.0.1:${address.port}`;
  }

  async function createSession(role, ownerId) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await pool.query(
      `INSERT INTO api_sessions (token_hash, role, owner_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [tokenHash, role, ownerId]
    );
    fixtures.sessionHashes.push(tokenHash);
    return token;
  }

  async function cleanup() {
    // An HTTP request can commit successfully and then fail a response assertion
    // before its ID is pushed into fixtures.orders. Recover only orders belonging
    // to this uniquely named temporary restaurant, never a pre-existing order.
    const savedOrders = await pool.query(
      "SELECT id, customer_name FROM orders WHERE restaurant_id = ANY($1::integer[])",
      [fixtures.restaurants]
    );
    for (const row of savedOrders.rows) {
      if (![
        `HTTP customer ${fixtures.suffix}`,
        `HTTP reservation ${fixtures.suffix}`
      ].includes(row.customer_name)) {
        throw new Error("Refusing fixture cleanup: unexpected order in temporary restaurant.");
      }
      if (!fixtures.orders.includes(Number(row.id))) fixtures.orders.push(Number(row.id));
    }
    const savedDrivers = await pool.query(
      "SELECT id, name FROM drivers WHERE restaurant_id = ANY($1::integer[])",
      [fixtures.restaurants]
    );
    for (const row of savedDrivers.rows) {
      if (row.name !== `HTTP driver ${fixtures.suffix}`) {
        throw new Error("Refusing fixture cleanup: unexpected driver in temporary restaurant.");
      }
      if (!fixtures.drivers.includes(Number(row.id))) fixtures.drivers.push(Number(row.id));
    }
    for (const sessionHash of fixtures.sessionHashes) {
      try {
        await pool.query("DELETE FROM api_sessions WHERE token_hash = $1", [sessionHash]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const orderId of fixtures.orders) {
      for (const [table, column] of [
        ["order_email_deliveries", "order_id"],
        ["order_driver_attempts", "order_id"],
        ["order_email_dispatch_jobs", "order_id"],
        ["order_status_history", "order_id"],
        ["order_items", "order_id"],
        ["orders", "id"]
      ]) {
        try {
          await pool.query(`DELETE FROM ${table} WHERE ${column} = $1`, [orderId]);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    for (const [table, ids] of [
      ["drivers", fixtures.drivers],
      ["products", fixtures.products],
      ["categories", fixtures.categories],
      ["subscriptions", fixtures.subscriptions],
      ["restaurants", fixtures.restaurants],
      ["admins", fixtures.admins]
    ]) {
      for (const id of ids) {
        try {
          await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
  }

  try {
    await inspectAndValidateSchema();
    await preflightSafeDispatch();
    baseline = await snapshotCounts();
    beforeOrders = await snapshotOrders();

    const baseUrl = await startHttpServer();
    const suffix = randomUUID();
    fixtures.suffix = suffix;
    const restaurant = (await pool.query(
      `INSERT INTO restaurants (name, slug, phone, address, description, status, delivery_fee)
       VALUES ($1, $2, '000-test', 'Integration fixture', 'Temporary HTTP API fixture',
               'ACTIVE', 3.250)
       RETURNING id`,
      [`HTTP fixture ${suffix}`, `http-fixture-${suffix}`]
    )).rows[0];
    fixtures.restaurants.push(Number(restaurant.id));
    const restaurantId = Number(restaurant.id);

    const category = (await pool.query(
      `INSERT INTO categories (restaurant_id, name)
       VALUES ($1, $2) RETURNING id`,
      [restaurantId, `Fixture category ${suffix}`]
    )).rows[0];
    fixtures.categories.push(Number(category.id));

    const product = (await pool.query(
      `INSERT INTO products (restaurant_id, category_id, name, price)
       VALUES ($1, $2, $3, 12.500) RETURNING id`,
      [restaurantId, Number(category.id), `Fixture product ${suffix}`]
    )).rows[0];
    fixtures.products.push(Number(product.id));
    const productId = Number(product.id);

    const subscription = (await pool.query(
      `INSERT INTO subscriptions
         (restaurant_id, plan, status, start_date, expiry_date)
       VALUES ($1, 'HTTP_TEST', 'ACTIVE', CURRENT_DATE - 1, CURRENT_DATE + 10)
       RETURNING id`,
      [restaurantId]
    )).rows[0];
    fixtures.subscriptions.push(Number(subscription.id));

    const adminUsername = `http-test-${suffix}`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const admin = (await pool.query(
      `INSERT INTO admins (username, password_hash)
       VALUES ($1, $2) RETURNING id`,
      [adminUsername, passwordHash]
    )).rows[0];
    fixtures.admins.push(Number(admin.id));

    const adminToken = await createSession("ADMIN", Number(admin.id));

    const catalog = await request(baseUrl, "/api/catalog");
    assert.equal(catalog.status, 200);
    assert.ok(catalog.payload.restaurants.some((row) => row.id === restaurantId));
    assert.ok(catalog.payload.products.some((row) => row.id === productId));
    assert.ok(catalog.payload.subscriptions.some((row) => row.restaurantName === `HTTP fixture ${suffix}`));

    const idempotencyKey = randomUUID();
    const deliveryBody = {
      restaurantId,
      customerName: `HTTP customer ${suffix}`,
      customerPhone: "555-0100",
      orderType: "DELIVERY",
      latitude: 32.8872,
      longitude: 13.1913,
      notes: "HTTP integration delivery",
      items: [{ productId, quantity: 1 }]
    };
    const deliveryHeaders = { "Idempotency-Key": idempotencyKey };
    const firstDelivery = await request(baseUrl, "/api/orders", {
      method: "POST", body: deliveryBody, headers: deliveryHeaders
    });
    assert.equal(firstDelivery.status, 201);
    assert.equal(firstDelivery.payload.order.latitude, deliveryBody.latitude);
    assert.equal(firstDelivery.payload.order.longitude, deliveryBody.longitude);
    fixtures.orders.push(firstDelivery.payload.order.id);

    const repeatedDelivery = await request(baseUrl, "/api/orders", {
      method: "POST", body: deliveryBody, headers: deliveryHeaders
    });
    assert.equal(repeatedDelivery.status, 200);
    assert.equal(repeatedDelivery.payload.order.id, firstDelivery.payload.order.id);

    const conflictingDelivery = await request(baseUrl, "/api/orders", {
      method: "POST",
      body: { ...deliveryBody, notes: "different payload on same key" },
      headers: deliveryHeaders
    });
    assert.equal(conflictingDelivery.status, 409);

    const invalidGps = await request(baseUrl, "/api/orders", {
      method: "POST",
      body: { ...deliveryBody, latitude: 91 },
      headers: { "Idempotency-Key": randomUUID() }
    });
    assert.equal(invalidGps.status, 400);

    const reservation = await request(baseUrl, "/api/orders", {
      method: "POST",
      body: {
        restaurantId,
        customerName: `HTTP reservation ${suffix}`,
        customerPhone: "555-0101",
        orderType: "RESERVATION",
        reservationDate: new Date().toISOString().slice(0, 10),
        reservationTime: "19:30",
        partySize: 3,
        items: [{ productId, quantity: 2 }]
      },
      headers: { "Idempotency-Key": randomUUID() }
    });
    assert.equal(reservation.status, 201);
    assert.equal(reservation.payload.order.orderType, "RESERVATION");
    assert.equal(reservation.payload.order.reservationTime, "19:30");
    fixtures.orders.push(reservation.payload.order.id);

    const fixtureOrderIds = fixtures.orders;
    const persistedCounts = await pool.query(
      `SELECT
         (SELECT count(*)::integer FROM orders WHERE id = ANY($1::integer[])) AS orders,
         (SELECT count(*)::integer FROM order_email_dispatch_jobs
           WHERE order_id = ANY($1::integer[])) AS jobs,
         (SELECT count(*)::integer FROM order_items WHERE order_id = ANY($1::integer[])) AS items`,
      [fixtureOrderIds]
    );
    assert.deepEqual(persistedCounts.rows[0], { orders: 2, jobs: 2, items: 2 });

    const dispatchDeadline = Date.now() + 5000;
    let dispatchSettled = false;
    while (Date.now() < dispatchDeadline) {
      const result = await pool.query(
        `SELECT count(*)::integer AS pending
           FROM order_email_dispatch_jobs
          WHERE order_id = ANY($1::integer[]) AND state = 'ACTIVE'`,
        [fixtureOrderIds]
      );
      if (result.rows[0].pending === 0) {
        dispatchSettled = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(dispatchSettled, true, "Fixture dispatch jobs did not settle before driver creation.");
    const attempts = await pool.query(
      `SELECT count(*)::integer AS count
         FROM order_driver_attempts
        WHERE order_id = ANY($1::integer[])`,
      [fixtureOrderIds]
    );
    assert.equal(attempts.rows[0].count, 0);

    const invalidDriver = await request(baseUrl, "/api/admin/drivers", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Invalid email fixture",
        phone: "555-0102",
        email: "not-an-email",
        restaurantId
      }
    });
    assert.equal(invalidDriver.status, 400);

    const addedDriver = await request(baseUrl, "/api/admin/drivers", {
      method: "POST",
      token: adminToken,
      body: {
        name: `HTTP driver ${suffix}`,
        phone: "555-0103",
        email: `driver-${suffix}@example.test`,
        restaurantId
      }
    });
    assert.equal(addedDriver.status, 201);
    const driverId = addedDriver.payload.driver.id;
    const serialNumber = addedDriver.payload.serialNumber;
    fixtures.drivers.push(driverId);

    assert.match(serialNumber, /^\d{6}$/);
    const driverToken = await createSession("DRIVER", driverId);

    const driverStats = await request(baseUrl, "/api/driver/stats", { token: driverToken });
    assert.equal(driverStats.status, 200);

    const today = new Date().toISOString().slice(0, 10);
    const filteredStats = await request(
      baseUrl,
      `/api/admin/stats?from=${today}&to=${today}&restaurantId=${restaurantId}&status=NEW&period=daily`,
      { token: adminToken }
    );
    assert.equal(filteredStats.status, 200);
    assert.equal(filteredStats.payload.summary.totalOrders, 2);

    const disabled = await request(baseUrl, `/api/admin/drivers/${driverId}`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: false }
    });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.payload.driver.isActive, false);

    const deniedDriverStats = await request(baseUrl, "/api/driver/stats", { token: driverToken });
    assert.equal(deniedDriverStats.status, 401);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (baseline && beforeOrders) {
      try {
        const afterCounts = await snapshotCounts();
        assert.deepEqual(afterCounts, baseline, "Fixture cleanup did not restore table counts.");
        assert.deepEqual(await snapshotOrders(), beforeOrders, "Pre-existing orders changed during the test.");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (previousDatabaseUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "HTTP integration test cleanup or preservation check failed.");
    }
  }
});