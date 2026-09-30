import { readFile } from "node:fs/promises";
import { pool } from "./db.mjs";

const migrations = [
  ["001_driver_email_dispatch.sql", new URL("./migrations/001_driver_email_dispatch.sql", import.meta.url)],
  ["002_admin_settings.sql", new URL("./migrations/002_admin_settings.sql", import.meta.url)],
  ["003_gmail_oauth.sql", new URL("./migrations/003_gmail_oauth.sql", import.meta.url)],
  ["004_driver_gmail_verification.sql", new URL("./migrations/004_driver_gmail_verification.sql", import.meta.url)],
  ["005_order_archive.sql", new URL("./migrations/005_order_archive.sql", import.meta.url)]
];
const selected = process.argv[2];
if (selected && !migrations.some(([name]) => name === selected)) {
  throw new Error("Unknown migration filename");
}

try {
  for (const [name, file] of migrations) {
    if (selected && name !== selected) continue;
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