/**
 * Управление администраторами: посмотреть список, добавить или сменить пароль.
 *
 *   npm run admin:list
 *   npm run admin:reset -- --email=admin@dsu.local --password=НовыйПароль123
 *   npm run admin:add   -- --email=second@dsu.local --password=ЕщёОдинПароль1
 *
 * Зачем: администратор создаётся автоматически только один раз — при первом
 * старте на пустой базе (см. config/bootstrap.ts). Если пароль забыт или в
 * ADMIN_EMAIL/ADMIN_PASSWORD когда-то были другие значения, эти команды
 * позволяют посмотреть список и задать новый пароль, не трогая данные дебатов.
 *
 * Backend поднимать не нужно: команда сама запустит локальную БД, если
 * приложение настроено на неё.
 */
import { hashPassword } from "../utils/password";
import { env } from "../config/env";
import { describeDatabaseConfig } from "../config/database";
import { pool, waitForDatabase } from "../config/db";
import { describeLocalDatabaseError, LocalDatabaseError } from "../localdb/errors";
import { localLog } from "../localdb/log";
import { ensureLocalDatabase, shutdownLocalDatabase } from "../localdb/ensure";

type AdminCommand = "list" | "add" | "reset";

interface CliArgs {
  command: AdminCommand;
  email?: string;
  password?: string;
}

const USAGE = [
  "Использование:",
  "  npm run admin:list",
  "  npm run admin:add   -- --email=<email> --password=<пароль>",
  "  npm run admin:reset -- --email=<email> --password=<пароль>",
].join("\n");

/** Разбор `--key=value` из аргументов npm-скрипта. */
function parseArgs(argv: string[]): CliArgs {
  const flags = new Map<string, string>();
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [rawName, ...rest] = arg.slice(2).split("=");
      flags.set(rawName.toLowerCase(), rest.join("="));
    } else if (arg.trim() !== "") {
      positional.push(arg);
    }
  }

  const command = (positional[0] ?? "list").toLowerCase();
  if (command !== "list" && command !== "add" && command !== "reset") {
    throw new LocalDatabaseError(`Неизвестная команда: ${positional[0] ?? ""}`, USAGE);
  }

  const normalized: CliArgs = {
    command,
    email: flags.get("email") || undefined,
    password: flags.get("password") || undefined,
  };

  if (normalized.command !== "list") {
    if (!normalized.email) {
      throw new LocalDatabaseError("Не указан email (--email=...).", USAGE);
    }
    if (!normalized.password) {
      throw new LocalDatabaseError("Не указан пароль (--password=...).", USAGE);
    }
    if (normalized.password.length < 8) {
      throw new LocalDatabaseError("Пароль должен быть не короче 8 символов.");
    }
    normalized.email = normalized.email.toLowerCase().trim();
  }

  return normalized;
}

/** Без таблицы admins работать не с чем: значит миграции ещё не применялись. */
async function assertAdminsTableExists(): Promise<void> {
  const exists = await pool
    .query<{ exists: boolean }>("SELECT to_regclass('public.admins') IS NOT NULL AS exists")
    .catch(() => undefined);

  if (!exists?.rows[0]?.exists) {
    throw new LocalDatabaseError(
      "В базе нет таблицы admins — миграции ещё не применены.",
      "Запустите backend один раз (`npm run dev` в папке backend`) — он применит миграции, " +
        "либо выполните npm run db:migrate."
    );
  }
}

async function listAdmins(): Promise<void> {
  const result = await pool.query<{ id: number; email: string; created_at: Date }>(
    "SELECT id, email, created_at FROM admins ORDER BY id"
  );

  localLog(`база: ${describeDatabaseConfig(env.database)}`);

  if (result.rowCount === 0) {
    localLog("администраторов пока нет.");
    localLog(
      "backend создаёт администратора сам при первом старте, если заданы " +
        "ADMIN_EMAIL и ADMIN_PASSWORD (в режиме разработки — admin@dsu.local / ChangeMe123!)."
    );
    return;
  }

  localLog(`администраторы (${result.rowCount}):`);
  for (const row of result.rows) {
    // eslint-disable-next-line no-console
    console.log(`  #${row.id}  ${row.email}  (создан ${row.created_at.toISOString()})`);
  }
}

async function upsertAdmin(email: string, password: string, command: AdminCommand): Promise<void> {
  const existing = await pool.query<{ id: number }>("SELECT id FROM admins WHERE email = $1", [email]);
  const passwordHash = await hashPassword(password);

  if (existing.rowCount) {
    await pool.query("UPDATE admins SET password_hash = $1 WHERE email = $2", [passwordHash, email]);
    localLog(`пароль для ${email} обновлён (id ${existing.rows[0]?.id})`);
  } else {
    const inserted = await pool.query<{ id: number }>(
      "INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email, passwordHash]
    );
    localLog(`создан администратор ${email} (id ${inserted.rows[0]?.id})`);
  }

  if (command === "add" && existing.rowCount) {
    localLog("подсказка: для существующего админа используйте npm run admin:reset");
  }

  localLog("вход: раздел «Профиль» во фронтенде или POST /api/admin/auth/login");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await ensureLocalDatabase();
  await waitForDatabase();
  await assertAdminsTableExists();

  if (args.command === "list") {
    await listAdmins();
    return;
  }

  await upsertAdmin(args.email as string, args.password as string, args.command);
}

main()
  .then(async () => {
    await pool.end();
    await shutdownLocalDatabase();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(`[admin:cli] ошибка: ${describeLocalDatabaseError(error)}`);
    await pool.end().catch(() => undefined);
    await shutdownLocalDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
