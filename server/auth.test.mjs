import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db.mjs";
import {
  AuthError,
  loginDriver,
  loginRestaurant,
  requireSession
} from "./auth.mjs";

const requestWithBearerToken = {
  headers: { authorization: `Bearer ${"A".repeat(43)}` }
};

async function withMockedPoolQuery(handler, callback) {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    return handler(sql, values, calls.length);
  };
  try {
    await callback(calls);
  } finally {
    pool.query = originalQuery;
  }
}

function makeLoginDatabase(driverRows = [], restaurantRows = []) {
  const rateLimits = new Map();
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
        return { rows: [] };
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT key_hash, attempts, reset_at")) {
        return {
          rows: (values[0] || [])
            .map((key) => rateLimits.get(key))
            .filter(Boolean)
        };
      }
      if (sql.includes("INSERT INTO auth_rate_limits")) {
        const [key] = values;
        const row = rateLimits.get(key);
        if (!row || new Date(row.reset_at).getTime() <= Date.now()) {
          rateLimits.set(key, {
            key_hash: key,
            attempts: 1,
            reset_at: new Date(Date.now() + 15 * 60 * 1000)
          });
        } else {
          row.attempts += 1;
        }
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM auth_rate_limits")) {
        for (const key of values[0] || []) rateLimits.delete(key);
        return { rows: [] };
      }
      if (sql.includes("FROM drivers")) {
        return {
          rows: typeof driverRows === "function"
            ? driverRows(values[0])
            : driverRows
        };
      }
      if (sql.includes("FROM restaurants")) {
        return { rows: restaurantRows };
      }
      if (sql.startsWith("DELETE FROM api_sessions")) return { rows: [] };
      if (sql.includes("INSERT INTO api_sessions")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() {}
  };
  return { client, calls, rateLimits };
}

async function withMockedPoolConnect(client, callback) {
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  try {
    await callback();
  } finally {
    pool.connect = originalConnect;
  }
}

async function withTestSessionSecret(callback) {
  const originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-for-auth-tests-0123456789";
  try {
    await callback();
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  }
}

test("a deactivated driver's session is revoked on the next authenticated request", async () => {
  await withMockedPoolQuery((sql) => {
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "DRIVER", owner_id: 31 }] };
    }
    if (sql.includes("FROM drivers")) return { rows: [] };
    if (sql.startsWith("DELETE FROM api_sessions")) return { rowCount: 1, rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls) => {
    await assert.rejects(
      requireSession(requestWithBearerToken, "driver"),
      (error) => error instanceof AuthError && error.status === 401
    );
    assert.equal(calls.length, 3);
    assert.match(calls[1].sql, /is_active = TRUE/);
    assert.match(calls[1].sql, /status = 'ACTIVE'/);
    assert.match(calls[2].sql, /DELETE FROM api_sessions/);
  });
});

test("admin sessions verify that the admin row still exists", async () => {
  await withMockedPoolQuery((sql) => {
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "ADMIN", owner_id: 8 }] };
    }
    if (sql.includes("FROM admins")) return { rows: [] };
    if (sql.startsWith("DELETE FROM api_sessions")) return { rowCount: 1, rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls) => {
    await assert.rejects(
      requireSession(requestWithBearerToken, "admin"),
      (error) => error instanceof AuthError && error.status === 401
    );
    assert.equal(calls.length, 3);
    assert.match(calls[1].sql, /FROM admins WHERE id = \$1/);
    assert.match(calls[2].sql, /DELETE FROM api_sessions/);
  });
});

test("active driver sessions retain access to their own history after restaurant changes", async () => {
  await withMockedPoolQuery((sql) => {
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "DRIVER", owner_id: 31 }] };
    }
    if (sql.includes("FROM drivers")) {
      return { rows: [{ id: 31, restaurant_id: 99 }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls) => {
    const session = await requireSession(requestWithBearerToken, "driver");
    assert.deepEqual(session, {
      role: "driver",
      ownerId: 31,
      restaurantId: 99
    });
    assert.equal(calls.length, 2);
  });
});

test("driver login rate limits ignore X-Forwarded-For and share the IP budget across serials", async () => {
  await withTestSessionSecret(async () => {
    const { client, calls, rateLimits } = makeLoginDatabase();
    await withMockedPoolConnect(client, async () => {
      const remoteAddress = "203.0.113.17";
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const request = {
          headers: { "x-forwarded-for": `198.51.100.${attempt + 1}` },
          socket: { remoteAddress }
        };
        const serial = String(100000 + attempt);
        await assert.rejects(
          loginDriver(request, serial),
          (error) => error instanceof AuthError && error.status === 401
        );
      }

      await assert.rejects(
        loginDriver({
          headers: { "x-forwarded-for": "192.0.2.250" },
          socket: { remoteAddress }
        }, "200000"),
        (error) => error instanceof AuthError && error.status === 429
      );
    });

    const insertedKeys = calls
      .filter(({ sql }) => sql.includes("INSERT INTO auth_rate_limits"))
      .map(({ values }) => values[0]);
    assert.equal(insertedKeys.length, 60);
    assert.equal(new Set(insertedKeys.filter((_, index) => index % 2 === 0)).size, 1);
    assert.equal(new Set(insertedKeys.filter((_, index) => index % 2 === 1)).size, 30);
    assert.equal(rateLimits.size, 31);
    assert.equal(
      calls.filter(({ sql }) => sql.includes("FROM drivers")).length,
      30,
      "the thirty-first serial guess must be blocked before account lookup"
    );
    assert.equal(
      calls.filter(({ sql }) => sql.includes("pg_advisory_xact_lock")).length,
      62,
      "each transaction serializes updates to its IP and serial counters"
    );
  });
});

test("the per-serial budget remains five attempts per fifteen minutes", async () => {
  await withTestSessionSecret(async () => {
    const { client, calls, rateLimits } = makeLoginDatabase();
    await withMockedPoolConnect(client, async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await assert.rejects(
          loginDriver({
            headers: { "x-forwarded-for": `198.51.100.${attempt + 1}` },
            socket: { remoteAddress: "203.0.113.18" }
          }, "123456"),
          (error) => error instanceof AuthError && error.status === 401
        );
      }
      await assert.rejects(
        loginDriver({
          headers: { "x-forwarded-for": "192.0.2.240" },
          socket: { remoteAddress: "203.0.113.18" }
        }, "123456"),
        (error) => error instanceof AuthError && error.status === 429
      );
    });
    assert.equal(rateLimits.size, 2);
    assert.equal(
      calls.filter(({ sql }) => sql.includes("FROM drivers")).length,
      5
    );
  });
});

test("a successful driver login preserves the shared IP budget", async () => {
  await withTestSessionSecret(async () => {
    const driver = {
      id: 31,
      restaurant_id: 42,
      name: "Driver",
      phone: "0500000000",
      email: null,
      status: "ACTIVE",
      is_active: true
    };
    const { client, calls, rateLimits } = makeLoginDatabase(
      (serial) => serial === "999999" ? [driver] : []
    );
    await withMockedPoolConnect(client, async () => {
      const remoteAddress = "203.0.113.22";
      for (let attempt = 0; attempt < 29; attempt += 1) {
        await assert.rejects(
          loginDriver({
            headers: { "x-forwarded-for": `192.0.2.${attempt + 1}` },
            socket: { remoteAddress }
          }, String(300000 + attempt)),
          (error) => error instanceof AuthError && error.status === 401
        );
      }

      const successfulLogin = await loginDriver({
        headers: { "x-forwarded-for": "198.51.100.201" },
        socket: { remoteAddress }
      }, "999999");
      assert.deepEqual(successfulLogin.driver, {
        id: 31,
        restaurantId: 42,
        name: "Driver",
        phone: "0500000000",
        email: "",
        status: "ACTIVE",
        isActive: true
      });

      await assert.rejects(
        loginDriver({
          headers: { "x-forwarded-for": "198.51.100.202" },
          socket: { remoteAddress }
        }, "400000"),
        (error) => error instanceof AuthError && error.status === 429
      );
    });

    const insertedKeys = calls
      .filter(({ sql }) => sql.includes("INSERT INTO auth_rate_limits"))
      .map(({ values }) => values[0]);
    const transportKey = insertedKeys[0];
    assert.equal(insertedKeys.length, 60);
    assert.equal(
      new Set(insertedKeys.filter((_, index) => index % 2 === 0)).size,
      1
    );
    assert.equal(rateLimits.get(transportKey).attempts, 30);
    assert.equal(rateLimits.size, 30);
    const clearCall = calls.find(({ sql }) => sql.startsWith("DELETE FROM auth_rate_limits"));
    assert.deepEqual(clearCall.values, [[insertedKeys[59]]]);
  });
});

test("valid driver login still creates a session and returns the existing contract", async () => {
  await withTestSessionSecret(async () => {
    const driver = {
      id: 31,
      restaurant_id: 42,
      name: "Driver",
      phone: "0500000000",
      email: null,
      status: "ACTIVE",
      is_active: true
    };
    const { client, calls, rateLimits } = makeLoginDatabase([driver]);
    await withMockedPoolConnect(client, async () => {
      const result = await loginDriver({
        headers: { "x-forwarded-for": "198.51.100.20" },
        socket: { remoteAddress: "203.0.113.20" }
      }, "123456");
      assert.match(result.token, /^[A-Za-z0-9_-]{40,}$/);
      assert.deepEqual(result.driver, {
        id: 31,
        restaurantId: 42,
        name: "Driver",
        phone: "0500000000",
        email: "",
        status: "ACTIVE",
        isActive: true
      });
    });
    assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO api_sessions")));
    assert.equal(rateLimits.size, 1, "successful login preserves the transport-IP counter");
    assert.equal([...rateLimits.values()][0].attempts, 1);
  });
});

test("deactivated drivers cannot log in", async () => {
  await withTestSessionSecret(async () => {
    const { client, calls } = makeLoginDatabase();
    await withMockedPoolConnect(client, async () => {
      await assert.rejects(
        loginDriver({
          headers: {},
          socket: { remoteAddress: "203.0.113.21" }
        }, "123456"),
        (error) => error instanceof AuthError && error.status === 401
      );
    });
    const driverLookup = calls.find(({ sql }) => sql.includes("FROM drivers"));
    assert.match(driverLookup.sql, /is_active = TRUE/);
    assert.match(driverLookup.sql, /status = 'ACTIVE'/);
    assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO api_sessions")), false);
  });
});

test("a valid restaurant serial creates a restaurant-owned session", async () => {
  await withTestSessionSecret(async () => {
    const restaurant = {
      id: 84,
      name: "Restaurant",
      phone: "0500000000",
      address: "Test street"
    };
    const { client, calls, rateLimits } = makeLoginDatabase([], [restaurant]);
    await withMockedPoolConnect(client, async () => {
      const result = await loginRestaurant({
        headers: {},
        socket: { remoteAddress: "203.0.113.84" }
      }, "001284");
      assert.match(result.token, /^[A-Za-z0-9_-]{40,}$/);
      assert.deepEqual(result.restaurant, {
        id: 84,
        name: "Restaurant",
        phone: "0500000000",
        address: "Test street"
      });
    });
    const lookup = calls.find(({ sql }) => sql.includes("FROM restaurants"));
    assert.match(lookup.sql, /account_serial_hash=\$1/);
    assert.match(lookup.sql, /status='ACTIVE'/);
    assert.notEqual(lookup.values[0], "001284");
    assert.ok(calls.some(({ sql, values }) =>
      sql.includes("INSERT INTO api_sessions") && values[1] === "RESTAURANT" && values[2] === 84
    ));
    assert.equal(rateLimits.size, 1);
  });
});

test("restaurant sessions return their own restaurant ID and inactive accounts are revoked", async () => {
  await withMockedPoolQuery((sql) => {
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "RESTAURANT", owner_id: 84 }] };
    }
    if (sql.includes("FROM restaurants")) return { rows: [{ id: 84 }] };
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const session = await requireSession(requestWithBearerToken, "restaurant");
    assert.deepEqual(session, {
      role: "restaurant",
      ownerId: 84,
      restaurantId: 84
    });
  });
  await withMockedPoolQuery((sql) => {
    if (sql.includes("FROM api_sessions")) {
      return { rows: [{ role: "RESTAURANT", owner_id: 84 }] };
    }
    if (sql.includes("FROM restaurants")) return { rows: [] };
    if (sql.startsWith("DELETE FROM api_sessions")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    await assert.rejects(
      requireSession(requestWithBearerToken, "restaurant"),
      (error) => error instanceof AuthError && error.status === 401
    );
  });
});