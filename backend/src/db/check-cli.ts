/**
 * Проверка подключения к БД: `npm run db:check`.
 *
 * Печатает, к чему реально подключились (хост, база, пользователь), активен
 * ли TLS, версию сервера и список таблиц/миграций. Пароль в выводе никогда
 * не печатается. Нужен ненулевой код выхода при ошибке, чтобы скрипт можно
 * было использовать в CI и при настройке подключения к БД.
 */
import { inspectDatabase, pool, waitForDatabase } from "../config/db";
import { describeDatabaseConfig } from "../config/database";
import { env } from "../config/env";
import { ensureLocalDatabase, shutdownLocalDatabase } from "../localdb/ensure";

async function main(): Promise<void> {
  const target = describeDatabaseConfig(env.database);
  // eslint-disable-next-line no-console
  console.log(`[db:check] connecting to ${target} ...`);

  // Для встроенной БД это её запуск, для внешней — no-op.
  await ensureLocalDatabase();
  // Внешняя БД может просыпаться после паузы — ждём её с повторами.
  await waitForDatabase();
  const report = await inspectDatabase();

  console.log(JSON.stringify(report, null, 2));

  if (env.database.isRemote && report.tls && !report.tls.active) {
    // eslint-disable-next-line no-console
    console.warn(
      `[db:check] WARNING: connection to ${target} is NOT encrypted. ` +
        `Set DB_SSLMODE=require (or add ?sslmode=require to DATABASE_URL) for external connections.`
    );
  }
}

main()
  .then(async () => {
    await pool.end();
    await shutdownLocalDatabase();
  })
  .catch(async (error) => {
    console.error("[db:check] FAILED:", error instanceof Error ? error.message : error);
    await pool.end().catch(() => undefined);
    await shutdownLocalDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
