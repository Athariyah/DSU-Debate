import { pool, waitForDatabase } from "../config/db";
import { describeDatabaseConfig } from "../config/database";
import { env } from "../config/env";
import { runMigrations } from "./migrate";

console.log(`[migration] target: ${describeDatabaseConfig(env.database)}`);

waitForDatabase()
  .then(() => runMigrations())
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Database migration failed:", error);
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
