import { pool } from "../config/db";
import { runMigrations } from "./migrate";

runMigrations()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Database migration failed:", error);
    await pool.end();
    process.exitCode = 1;
  });
