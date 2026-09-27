import { readFile } from "node:fs/promises";
import { pool } from "./db.mjs";

const migrations = [
  ["001_driver_email_dispatch.sql", new URL("./migrations/001_driver_email_dispatch.sql", import.meta.url)],
  ["002_admin_settings.sql", new URL("./migrations/002_admin_settings.sql", import.meta.url)]
];

try {
  for (const [name, file] of migrations) {
    const sql = await readFile(file, "utf8");
    await pool.query(sql);
    console.log(`Migration applied: ${name}`);
  }
} catch (error) {
  console.error("Database migration failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}