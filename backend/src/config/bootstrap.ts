import { pool } from "./db";
import { env } from "./env";
import { hashPassword } from "../utils/password";

/**
 * Создаёт локального администратора один раз при первом старте.
 *
 * Учётные данные берутся из ADMIN_EMAIL/ADMIN_PASSWORD; при локальном хостинге
 * (NODE_ENV != production) они по умолчанию равны admin@dsu.local / ChangeMe123!,
 * чтобы после первого запуска можно было сразу войти в админку. В production
 * значения по умолчанию не используются — администратор создаётся вручную
 * или через контролируемую регистрацию.
 *
 * Существующий аккаунт никогда не перезаписывается.
 */
export async function ensureSeedAdmin(): Promise<void> {
  if (!env.adminEmail || !env.adminPassword) return;

  const email = env.adminEmail.toLowerCase().trim();
  const existing = await pool.query<{ id: number }>("SELECT id FROM admins WHERE email = $1", [email]);
  if (existing.rowCount && existing.rowCount > 0) return;

  const passwordHash = await hashPassword(env.adminPassword);
  await pool.query("INSERT INTO admins (email, password_hash) VALUES ($1, $2)", [email, passwordHash]);

  // eslint-disable-next-line no-console
  console.log(
    env.adminCredentialsAreDefaults
      ? `[dsu-debate-backend] создан локальный администратор ${email} ` +
          `(пароль по умолчанию: ChangeMe123! — смените его через ADMIN_PASSWORD в backend/.env)`
      : `[dsu-debate-backend] создан администратор ${email}`
  );
}
