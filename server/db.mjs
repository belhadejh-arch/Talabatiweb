import pg from "pg";

const databaseUrl = process.env.TALABAT_TEST_MODE === "1"
  ? process.env.DATABASE_URL
  : process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;

export const pool = new pg.Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 10_000,
      }
    : undefined
);

pool.on("error", (error) => {
  console.error("PostgreSQL idle client error:", error.code ?? error.name);
});

// Idempotent schema guarantee for order archiving and location coordinates
if (databaseUrl) {
  pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false").catch(() => {});
  pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude double precision").catch(() => {});
  pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude double precision").catch(() => {});
  pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS opening_time time DEFAULT '08:00:00'").catch(() => {});
  pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS closing_time time DEFAULT '22:00:00'").catch(() => {});
  pool.query("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS latitude double precision").catch(() => {});
  pool.query("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS longitude double precision").catch(() => {});
  pool.query("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location_updated_at timestamptz").catch(() => {});
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}