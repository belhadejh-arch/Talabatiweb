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
  let originalDispatchTimeout;
  const cleanupErrors = [];

  const requiredColumns = {
    restaurants: ["id", "name", "slug", "phone", "address", "description", "status",
      "logo_url", "cover_url", "delivery_fee"],
    categories: ["id", "restaurant_id", "name", "name_ar", "is_available"],
    products: ["id", "restaurant_id", "category_id", "name", "name_ar",
      "description", "description_ar", "image_url", "price", "is_available",
      "stock_quantity", "sort_order"],
    subscriptions: ["id", "restaurant_id", "plan", "status", "start_date", "expiry_date"],
    drivers: ["id", "restaurant_id", "name", "phone", "email", "is_active",
      "status", "serial_number", "created_at"],
    admins: ["id", "username", "password_hash"],
    admin_settings: ["id", "dispatch_timeout_minutes", "updated_at"],
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
    "order_email_dispatch_jobs", "order_email_deliveries", "order_driver_attempts",
    "admin_settings"
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
    const snapshots = {};
    for (const [table, query] of [
      ["orders", "SELECT * FROM orders ORDER BY id"],
      ["order_items", "SELECT * FROM order_items ORDER BY id"],
      ["order_status_history", "SELECT * FROM order_status_history ORDER BY id"],
      ["order_driver_attempts", "SELECT * FROM order_driver_attempts ORDER BY id"],
      ["order_email_dispatch_jobs", "SELECT * FROM order_email_dispatch_jobs ORDER BY order_id"]
    ]) {
      snapshots[table] = (await pool.query(query)).rows;
    }
    return snapshots;
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
    if (response.status >= 500) console.error(`HTTP fixture request failed: ${method} ${path} (${response.status})`);
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
    const legacyBefore = (await pool.query(
      `SELECT o.id,o.status,o.total_amount,i.product_name,h.note,
              EXISTS (SELECT 1 FROM order_email_dispatch_jobs j WHERE j.order_id=o.id) AS has_job
         FROM orders o
         JOIN order_items i ON i.order_id=o.id
         JOIN order_status_history h ON h.order_id=o.id
        WHERE o.source='LEGACY' AND o.customer_name='Historical customer'`
    )).rows[0];
    if (legacyBefore) {
      assert.equal(legacyBefore.status, "COMPLETED");
      assert.equal(Number(legacyBefore.total_amount), 14);
      assert.equal(legacyBefore.product_name, "Historical dish");
      assert.equal(legacyBefore.note, "Pre-migration timeline");
      assert.equal(legacyBefore.has_job, false);
    }
    baseline = await snapshotCounts();
    beforeOrders = await snapshotOrders();

    const baseUrl = await startHttpServer();
    const suffix = randomUUID();
    fixtures.suffix = suffix;
    // Seed only the temporary admin directly; exercise restaurant creation via HTTP.
    const adminUsername = `http-test-${suffix}`;
    const adminPassword = randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = (await pool.query(
      `INSERT INTO admins (username, password_hash)
       VALUES ($1, $2) RETURNING id`,
      [adminUsername, passwordHash]
    )).rows[0];
    fixtures.admins.push(Number(admin.id));
    const adminToken = await createSession("ADMIN", Number(admin.id));
    const otherAdminToken = await createSession("ADMIN", Number(admin.id));
    const createdRestaurant = await request(baseUrl, "/api/admin/restaurants", {
      method: "POST", token: adminToken,
      body: {
        name: `HTTP fixture ${suffix}`, phone: "000-test",
        address: "Integration fixture", description: "Temporary HTTP API fixture"
      }
    });
    assert.equal(createdRestaurant.status, 201);
    const restaurantId = createdRestaurant.payload.restaurant.id;
    fixtures.restaurants.push(restaurantId);
    assert.equal((await pool.query("SELECT name FROM restaurants WHERE id=$1", [restaurantId])).rows[0].name, `HTTP fixture ${suffix}`);

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

    originalDispatchTimeout = Number((await pool.query(
      "SELECT dispatch_timeout_minutes FROM admin_settings WHERE id=1"
    )).rows[0]?.dispatch_timeout_minutes);
    assert.ok(Number.isInteger(originalDispatchTimeout), "admin_settings singleton row is required.");

    const initialSettings = await request(baseUrl, "/api/admin/settings", { token: adminToken });
    assert.equal(initialSettings.status, 200);
    assert.equal(initialSettings.payload.settings.adminUsername, adminUsername);
    const changedSettings = await request(baseUrl, "/api/admin/settings", {
      method: "PATCH", token: adminToken, body: { dispatchTimeoutMinutes: 12 }
    });
    assert.equal(changedSettings.status, 200);
    assert.equal(changedSettings.payload.settings.dispatchTimeoutMinutes, 12);
    assert.equal(Number((await pool.query("SELECT dispatch_timeout_minutes FROM admin_settings WHERE id=1")).rows[0].dispatch_timeout_minutes), 12);
    const renamedUsername = `http-renamed-${suffix}`;
    const newPassword = `${randomBytes(20).toString("hex")}aA1!`;
    assert.equal((await request(baseUrl, "/api/admin/settings/credentials", {
      method: "POST", token: adminToken,
      body: { currentPassword: "incorrect", newUsername: renamedUsername }
    })).status, 401);
    const changedCredentials = await request(baseUrl, "/api/admin/settings/credentials", {
      method: "POST", token: adminToken,
      body: {
        currentPassword: adminPassword,
        newUsername: renamedUsername,
        newPassword
      }
    });
    assert.deepEqual(changedCredentials.payload, { ok: true });
    assert.equal(changedCredentials.status, 200);
    assert.equal((await request(baseUrl, "/api/admin/settings", { token: adminToken })).payload.settings.adminUsername, renamedUsername);
    assert.equal((await request(baseUrl, "/api/admin/settings", { token: otherAdminToken })).status, 401);
    const newLogin = await request(baseUrl, "/api/admin/login", {
      method: "POST", body: { username: renamedUsername, password: newPassword }
    });
    assert.equal(newLogin.status, 200);
    fixtures.sessionHashes.push(createHash("sha256").update(newLogin.payload.token).digest("hex"));

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
    assert.equal(typeof filteredStats.payload.periods[0].orderValue, "number");
    assert.equal(typeof filteredStats.payload.byRestaurant[0].orderValue, "number");

    const editedRestaurant = await request(baseUrl, `/api/admin/restaurants/${restaurantId}`, {
      method: "PATCH", token: adminToken,
      body: { description: "Edited by admin", deliveryFee: 4.125 }
    });
    assert.equal(editedRestaurant.status, 200);
    assert.equal(editedRestaurant.payload.restaurant.description, "Edited by admin");
    assert.equal(editedRestaurant.payload.restaurant.deliveryFee, 4.125);
    assert.equal(Number((await pool.query("SELECT delivery_fee FROM restaurants WHERE id=$1", [restaurantId])).rows[0].delivery_fee), 4.125);

    const createdCategory = await request(baseUrl, "/api/admin/categories", {
      method: "POST", token: adminToken, body: { restaurantId, name: `Managed category ${suffix}` }
    });
    assert.equal(createdCategory.status, 201);
    const managedCategoryId = createdCategory.payload.category.id;
    fixtures.categories.push(managedCategoryId);
    const editedCategory = await request(baseUrl, `/api/admin/categories/${managedCategoryId}`, {
      method: "PATCH", token: adminToken, body: { name: `Managed category edited ${suffix}` }
    });
    assert.equal(editedCategory.status, 200);
    assert.equal((await pool.query("SELECT name FROM categories WHERE id=$1", [managedCategoryId])).rows[0].name, `Managed category edited ${suffix}`);
    const categoryRequired = await request(baseUrl, "/api/admin/products", {
      method: "POST", token: adminToken,
      body: { restaurantId, name: "Missing category", price: 1 }
    });
    assert.equal(categoryRequired.status, 400);
    const createdProduct = await request(baseUrl, "/api/admin/products", {
      method: "POST", token: adminToken,
      body: {
        restaurantId, categoryId: managedCategoryId, name: `Managed product ${suffix}`,
        description: "Temporary product", price: 8.250, isAvailable: true, stockQuantity: 7
      }
    });
    assert.equal(createdProduct.status, 201);
    const managedProductId = createdProduct.payload.product.id;
    fixtures.products.push(managedProductId);
    const editedProduct = await request(baseUrl, `/api/admin/products/${managedProductId}`, {
      method: "PATCH", token: adminToken, body: { price: 9.125, stockQuantity: 5 }
    });
    assert.equal(editedProduct.status, 200);
    assert.equal(editedProduct.payload.product.price, 9.125);
    assert.equal(Number((await pool.query("SELECT price FROM products WHERE id=$1", [managedProductId])).rows[0].price), 9.125);
    const archivedCategory = await request(baseUrl, `/api/admin/categories/${managedCategoryId}`, {
      method: "DELETE", token: adminToken
    });
    assert.equal(archivedCategory.status, 200);
    assert.equal(archivedCategory.payload.category.isAvailable, false);
    assert.equal((await request(baseUrl, `/api/admin/categories/${managedCategoryId}`, {
      method: "PATCH", body: { isAvailable: true }
    })).status, 401);
    assert.equal((await request(baseUrl, `/api/admin/categories/${managedCategoryId}`, {
      method: "PATCH", token: adminToken, body: { isAvailable: "true" }
    })).status, 400);
    const archivedCategoryMenu = await request(baseUrl, `/api/admin/menu?restaurantId=${restaurantId}`, { token: adminToken });
    assert.ok(archivedCategoryMenu.payload.categories.some((row) => row.id === managedCategoryId && !row.isAvailable));
    assert.ok(archivedCategoryMenu.payload.products.some((row) => row.id === managedProductId && row.isAvailable));
    const createInArchivedCategory = await request(baseUrl, "/api/admin/products", {
      method: "POST", token: adminToken,
      body: { restaurantId, categoryId: managedCategoryId, name: "Archived category product", price: 2 }
    });
    assert.equal(createInArchivedCategory.status, 400);
    const updateInArchivedCategory = await request(baseUrl, `/api/admin/products/${managedProductId}`, {
      method: "PATCH", token: adminToken, body: { price: 10 }
    });
    assert.equal(updateInArchivedCategory.status, 400);
    const restoredCategory = await request(baseUrl, `/api/admin/categories/${managedCategoryId}`, {
      method: "PATCH", token: adminToken, body: { isAvailable: true }
    });
    assert.equal(restoredCategory.status, 200);
    assert.equal(restoredCategory.payload.category.isAvailable, true);
    const restoredCatalog = await request(baseUrl, "/api/catalog");
    assert.ok(restoredCatalog.payload.products.some((row) => row.id === managedProductId));
    const deletedManagedProduct = await request(baseUrl, `/api/admin/products/${managedProductId}`, {
      method: "DELETE", token: adminToken
    });
    assert.equal(deletedManagedProduct.status, 200);
    assert.equal(deletedManagedProduct.payload.product.isAvailable, false);
    const menu = await request(baseUrl, `/api/admin/menu?restaurantId=${restaurantId}`, { token: adminToken });
    assert.equal(menu.status, 200);
    assert.ok(menu.payload.products.some((row) => row.id === managedProductId && !row.isAvailable));
    const restoredProduct = await request(baseUrl, `/api/admin/products/${managedProductId}`, {
      method: "PATCH", token: adminToken, body: { isAvailable: true }
    });
    assert.equal(restoredProduct.status, 200);
    assert.equal(restoredProduct.payload.product.isAvailable, true);
    assert.equal((await request(baseUrl, `/api/admin/products/${productId}`, {
      method: "DELETE", token: adminToken
    })).payload.product.isAvailable, false);
    const historicItems = await pool.query(
      "SELECT count(*)::integer AS count FROM order_items WHERE product_id=$1",
      [productId]
    );
    assert.equal(historicItems.rows[0].count, 2);
    const emptyCategory = await request(baseUrl, "/api/admin/categories", {
      method: "POST", token: adminToken, body: { restaurantId, name: `Empty category ${suffix}` }
    });
    assert.equal(emptyCategory.status, 201);
    fixtures.categories.push(emptyCategory.payload.category.id);
    assert.equal((await request(baseUrl, `/api/admin/categories/${emptyCategory.payload.category.id}`, {
      method: "DELETE", token: adminToken
    })).status, 200);

    const createdSubscription = await request(baseUrl, "/api/admin/subscriptions", {
      method: "POST", token: adminToken, body: { restaurantId, plan: "BASIC", days: 20 }
    });
    assert.equal(createdSubscription.status, 201);
    const managedSubscriptionId = createdSubscription.payload.subscription.id;
    fixtures.subscriptions.push(managedSubscriptionId);
    const renewedSubscription = await request(baseUrl, `/api/admin/subscriptions/${managedSubscriptionId}/renew`, {
      method: "POST", token: adminToken, body: { plan: "PREMIUM", days: 10 }
    });
    assert.equal(renewedSubscription.status, 200);
    assert.equal(renewedSubscription.payload.subscription.plan, "PREMIUM");
    assert.ok(renewedSubscription.payload.subscription.expiryDate > createdSubscription.payload.subscription.expiryDate);
    assert.equal((await pool.query("SELECT plan FROM subscriptions WHERE id=$1", [managedSubscriptionId])).rows[0].plan, "PREMIUM");
    assert.equal((await request(baseUrl, `/api/admin/subscriptions/${managedSubscriptionId}`, {
      method: "PATCH", token: adminToken, body: { status: "ACTIVE", expiryDate: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10) }
    })).status, 200);
    const cancelledSubscription = await request(baseUrl, `/api/admin/subscriptions/${managedSubscriptionId}`, {
      method: "DELETE", token: adminToken
    });
    assert.equal(cancelledSubscription.status, 200);
    assert.equal(cancelledSubscription.payload.subscription.status, "CANCELLED");

    const disabled = await request(baseUrl, `/api/admin/drivers/${driverId}`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: false }
    });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.payload.driver.isActive, false);
    assert.equal((await pool.query("SELECT is_active FROM drivers WHERE id=$1", [driverId])).rows[0].is_active, false);

    const deniedDriverStats = await request(baseUrl, "/api/driver/stats", { token: driverToken });
    assert.equal(deniedDriverStats.status, 401);
    const reenabled = await request(baseUrl, `/api/admin/drivers/${driverId}`, {
      method: "PATCH", token: adminToken, body: { isActive: true }
    });
    assert.equal(reenabled.status, 200);
    assert.equal(reenabled.payload.driver.isActive, true);
    const removedDriver = await request(baseUrl, `/api/admin/drivers/${driverId}`, {
      method: "DELETE", token: adminToken
    });
    assert.equal(removedDriver.status, 200);
    assert.equal(removedDriver.payload.driver.isActive, false);
    assert.equal(removedDriver.payload.driver.status, "ARCHIVED");
    const restoredDriver = await request(baseUrl, `/api/admin/drivers/${driverId}`, {
      method: "PATCH", token: adminToken, body: { isActive: true }
    });
    assert.equal(restoredDriver.status, 200);
    assert.equal(restoredDriver.payload.driver.status, "ACTIVE");
    assert.equal((await pool.query("SELECT status FROM drivers WHERE id=$1", [driverId])).rows[0].status, "ACTIVE");
    const archivedRestaurant = await request(baseUrl, `/api/admin/restaurants/${restaurantId}`, {
      method: "DELETE", token: adminToken
    });
    assert.equal(archivedRestaurant.status, 200);
    assert.equal(archivedRestaurant.payload.restaurant.status, "ARCHIVED");
    const retainedOrders = await pool.query("SELECT count(*)::integer AS count FROM orders WHERE restaurant_id=$1", [restaurantId]);
    assert.equal(retainedOrders.rows[0].count, 2);
    assert.equal((await request(baseUrl, "/api/catalog")).payload.restaurants.some((row) => row.id === restaurantId), false);
    const restoredRestaurant = await request(baseUrl, `/api/admin/restaurants/${restaurantId}`, {
      method: "PATCH", token: adminToken, body: { status: "ACTIVE" }
    });
    assert.equal(restoredRestaurant.status, 200);
    assert.equal(restoredRestaurant.payload.restaurant.status, "ACTIVE");
    assert.equal((await pool.query("SELECT count(*)::integer AS count FROM orders WHERE restaurant_id=$1", [restaurantId])).rows[0].count, 2);
    if (legacyBefore) {
      const legacyAfter = (await pool.query(
        `SELECT o.id,o.status,o.total_amount,i.product_name,h.note,
                EXISTS (SELECT 1 FROM order_email_dispatch_jobs j WHERE j.order_id=o.id) AS has_job
           FROM orders o
           JOIN order_items i ON i.order_id=o.id
           JOIN order_status_history h ON h.order_id=o.id
          WHERE o.id=$1`,
        [legacyBefore.id]
      )).rows[0];
      assert.deepEqual(legacyAfter, legacyBefore, "Pre-migration order, item, timeline or dispatch state changed.");
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (originalDispatchTimeout != null) {
      try {
        await pool.query(
          "UPDATE admin_settings SET dispatch_timeout_minutes=$1,updated_at=now() WHERE id=1",
          [originalDispatchTimeout]
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
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