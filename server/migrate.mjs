import { readFile } from "node:fs/promises";
import { pool } from "./db.mjs";

const file = new URL("./migrations/001_driver_email_dispatch.sql", import.meta.url);
const sql = await readFile(file, "utf8");

try {
  await pool.query(sql);
  console.log("Driver email dispatch migration applied");
} catch (error) {
  console.error("Driver email dispatch migration failed:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}