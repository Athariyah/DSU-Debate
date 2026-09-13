import fs from "fs/promises";
import path from "path";
import { pool } from "../config/db";

export async function runMigrations(): Promise<void> {
  const candidates = [
    path.resolve(__dirname, "../../sql/migrations"),
    path.resolve(__dirname, "../../../sql/migrations"),
  ];
  let migrationsDir: string | undefined;
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      migrationsDir = candidate;
      break;
    } catch {
      // Try the next layout (source tree vs compiled Docker tree).
    }
  }
  if (!migrationsDir) throw new Error("SQL migrations directory was not found");

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const version = file.split("_")[0];
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
    if (existing.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      console.log(`[migration] applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
