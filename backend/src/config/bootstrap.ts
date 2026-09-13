import { pool } from "./db";
import { env } from "./env";
import { hashPassword } from "../utils/password";

/**
 * Creates the local administrator once when both ADMIN_EMAIL and
 * ADMIN_PASSWORD are supplied. Existing installations are never overwritten.
 * Leave these variables unset in production and use the normal register route.
 */
export async function ensureSeedAdmin(): Promise<void> {
  if (!env.adminEmail || !env.adminPassword) return;

  const email = env.adminEmail.toLowerCase().trim();
  const existing = await pool.query<{ id: number }>("SELECT id FROM admins WHERE email = $1", [email]);
  if (existing.rowCount && existing.rowCount > 0) return;

  const passwordHash = await hashPassword(env.adminPassword);
  await pool.query("INSERT INTO admins (email, password_hash) VALUES ($1, $2)", [email, passwordHash]);
}
