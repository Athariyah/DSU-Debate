import { pool, waitForDatabase } from "../config/db";
import { describeDatabaseConfig } from "../config/database";
import { env } from "../config/env";
import { ensureLocalDatabase, shutdownLocalDatabase } from "../localdb/ensure";
import { runMigrations } from "./migrate";

console.log(`[migration] target: ${describeDatabaseConfig(env.database)}`);

// Для встроенной БД это её запуск, для внешней — no-op.
ensureLocalDatabase()
  .then(() => waitForDatabase())
  .then(() => runMigrations())
  .then(async () => {
    await pool.end();
    await shutdownLocalDatabase();
  })
  .catch(async (error) => {
    console.error("Database migration failed:", error);
    await pool.end().catch(() => undefined);
    await shutdownLocalDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
