import { Pool, PoolClient } from "pg";
import { env } from "./env";
import { describeDatabaseConfig } from "./database";
import { recoverLocalDatabaseIfNeeded } from "../localdb/ensure";

/**
 * Единый пул соединений с PostgreSQL для всего приложения.
 * Пул переиспользуется во всех контроллерах — не создаём новые
 * подключения на каждый запрос.
 *
 * Параметры берутся из config/database.ts: по умолчанию это встроенный
 * PostgreSQL, который приложение поднимает на этом компьютере; также
 * поддерживаются готовая `DATABASE_URL`, отдельные `DB_HOST`/`DB_USER`/...
 * и режимы SSL уровня libpq.
 */
const config = env.database;

export const pool = new Pool({
  connectionString: config.connectionString,
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  ssl: config.ssl,
  max: config.pool.max,
  idleTimeoutMillis: config.pool.idleTimeoutMillis,
  connectionTimeoutMillis: config.connect.timeoutMs,
  application_name: config.applicationName,
});

pool.on("error", (err) => {
  // Ошибки на уже выданных (idle) клиентах пула — не должны валить процесс.
  // Если это встроенная БД, причиной может быть упавший/убитый процесс
  // PostgreSQL: сообщаем и просим менеджер БД поднять его снова.
  // eslint-disable-next-line no-console
  console.error("[db] ошибка на простаивающем клиенте PostgreSQL:", errorMessage(err));
  if (isConnectionError(err)) recoverLocalDatabaseIfNeeded(errorMessage(err));
});

/** Ошибки, означающие «сервер PostgreSQL недоступен» (а не, например, SQL-ошибку). */
export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (!code) return false;
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "EPIPE",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    // Классы PostgreSQL: connection exception / admin shutdown / cannot connect now.
    "08000",
    "08001",
    "08003",
    "08004",
    "08006",
    "08P01",
    "57P01",
    "57P02",
    "57P03",
  ].includes(code);
}

/**
 * Пул хранит копию конфигурации и отдаёт её каждому новому клиенту, поэтому
 * переключение `ssl` здесь влияет на все последующие соединения. Нужно для
 * режимов `allow`/`prefer`: сначала пробуем TLS, при неудаче — без него.
 * В @types/pg поле `options` не описано, поэтому доступ через приведение.
 */
type PoolWithMutableOptions = Pool & { options: { ssl?: unknown } };

function disablePoolSsl(): void {
  (pool as unknown as PoolWithMutableOptions).options.ssl = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ждёт, пока база станет доступна, и поднимает понятную ошибку, если она так
 * и не ответила. Встроенный PostgreSQL стартует быстро, но внешние СУБД после
 * паузы/перезапуска принимают соединения не мгновенно, поэтому старт бэкенда
 * ретраится.
 */
export async function waitForDatabase(): Promise<void> {
  const { retries, delayMs } = config.connect;
  const target = describeDatabaseConfig(config);
  let lastError: unknown;
  let sslFallbackTried = false;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      if (attempt > 1 || sslFallbackTried) {
        // eslint-disable-next-line no-console
        console.log(`[db] connected to ${target} on attempt ${attempt}`);
      }
      return;
    } catch (error) {
      lastError = error;

      // allow/prefer: пробуем TLS, а если сервер его не поддерживает —
      // откатываемся на обычное соединение (поведение libpq).
      if (config.sslCanFallback && config.ssl !== false && !sslFallbackTried) {
        sslFallbackTried = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[db] TLS connection to ${target} failed (${errorMessage(error)}) — retrying without TLS (sslmode=${config.sslMode})`
        );
        disablePoolSsl();
        continue;
      }

      if (attempt < retries) {
        // eslint-disable-next-line no-console
        console.warn(
          `[db] ${target} is not ready (attempt ${attempt}/${retries}): ${errorMessage(error)} — retrying in ${delayMs}ms`
        );
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Could not connect to PostgreSQL at ${target} after ${retries} attempt(s): ${errorMessage(lastError)}`
  );
}

/**
 * Диагностическое подключение: возвращает параметры сервера, состояние TLS
 * и список таблиц. Используется скриптом `npm run db:check` — им удобно
 * проверять, к какой базе реально подключилось приложение.
 */
export interface DatabaseReport {
  target: string;
  sslMode: string;
  database?: string;
  user?: string;
  serverAddress?: string | null;
  serverPort?: number | null;
  tls: { active: boolean; version?: string | null; cipher?: string | null } | null;
  serverVersion?: string;
  tables: string[];
  migrations: string[];
}

export async function inspectDatabase(): Promise<DatabaseReport> {
  const client = await pool.connect();
  try {
    const meta = await client.query<{
      database: string;
      user: string;
      server_address: string | null;
      server_port: number | null;
      version: string;
    }>(
      `SELECT current_database() AS database,
              current_user      AS user,
              inet_server_addr() AS server_address,
              inet_server_port() AS server_port,
              version()          AS version`
    );

    const tls = await client.query<{ ssl: boolean; version: string | null; cipher: string | null }>(
      `SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()`
    );

    // Таблицы могут отсутствовать до миграций, а pg_stat_ssl — быть недоступным,
    // поэтому обе выборки не считаются фатальными.
    const tables = await client
      .query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      )
      .catch(() => ({ rows: [] as { tablename: string }[] }));

    const migrations = await client
      .query<{ version: string }>(`SELECT version FROM schema_migrations ORDER BY version`)
      .catch(() => ({ rows: [] as { version: string }[] }));

    const row = meta.rows[0];
    const sslRow = tls.rows[0];

    return {
      target: describeDatabaseConfig(config),
      sslMode: config.sslMode,
      database: row?.database,
      user: row?.user,
      serverAddress: row?.server_address ?? null,
      serverPort: row?.server_port ?? null,
      tls: sslRow ? { active: sslRow.ssl, version: sslRow.version, cipher: sslRow.cipher } : null,
      serverVersion: row?.version,
      tables: tables.rows.map((table) => table.tablename),
      migrations: migrations.rows.map((row2) => row2.version),
    };
  } finally {
    client.release();
  }
}

/**
 * Вспомогательная обёртка для выполнения операции в рамках транзакции.
 * Гарантированно делает COMMIT при успехе и ROLLBACK при любой ошибке,
 * а также освобождает клиента обратно в пул в блоке finally.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
