import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

const TABLE_NAME = "talabat_image_blobs";

export type DatabaseImage = {
  id: string;
  contentType: string;
  data: Buffer;
};

let tableReady: Promise<void> | null = null;

/**
 * Render cannot authenticate to Replit's Object Storage sidecar. This small
 * database-backed store is the portable fallback for processed menu images.
 * The table is created lazily so existing deployments do not need a separate
 * migration step before uploads start working.
 */
export async function ensureDatabaseImageTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id TEXT PRIMARY KEY,
          folder TEXT NOT NULL,
          content_type TEXT NOT NULL,
          data BYTEA NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }

  await tableReady;
}

export async function saveDatabaseImage(
  data: Buffer,
  contentType: string,
  folder: string,
): Promise<string> {
  await ensureDatabaseImageTable();
  const id = randomUUID();

  await pool.query(
    `
      INSERT INTO ${TABLE_NAME} (id, folder, content_type, data)
      VALUES ($1, $2, $3, $4)
    `,
    [id, folder, contentType, data],
  );

  return id;
}

export async function getDatabaseImage(id: string): Promise<DatabaseImage | null> {
  await ensureDatabaseImageTable();

  const result = await pool.query<{
    id: string;
    content_type: string;
    data: Buffer;
  }>(
    `
      SELECT id, content_type, data
      FROM ${TABLE_NAME}
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    contentType: row.content_type,
    data: row.data,
  };
}

export async function deleteDatabaseImage(id: string): Promise<void> {
  await ensureDatabaseImageTable();
  await pool.query(`DELETE FROM ${TABLE_NAME} WHERE id = $1`, [id]);
}