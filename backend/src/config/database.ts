/**
 * Конфигурация подключения к PostgreSQL.
 *
 * Поддерживаются два сценария, которые можно комбинировать:
 *
 * 1. Готовая строка подключения — `DATABASE_URL`
 *    (`postgresql://user:password@host:5432/db?sslmode=require`).
 *
 * 2. Отдельные переменные — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
 *    `DB_PASSWORD`. Удобно для облачных панелей (Amvera и аналоги), где
 *    пароль хранится как секрет отдельной переменной и его не хочется
 *    встраивать в URL. Стандартные libpq-переменные `PGHOST`, `PGPORT`,
 *    `PGUSER`, `PGPASSWORD`, `PGDATABASE` тоже распознаются.
 *
 * SSL настраивается через `DB_SSLMODE` (или `sslmode=` внутри DATABASE_URL,
 * или libpq-овскую `PGSSLMODE`). Значения повторяют libpq:
 * disable | allow | prefer | require | verify-ca | verify-full.
 */
import fs from "fs";

export type SslMode = "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full";

export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
  /** Аналог libpq `verify-ca`: цепочка проверяется, имя хоста — нет. */
  checkServerIdentity?: () => undefined;
}

export interface DatabaseConfig {
  /** Готовая строка подключения (без SSL-параметров — они уходят в `ssl`). */
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** `false` — соединение без TLS, иначе объект с TLS-настройками. */
  ssl: false | DatabaseSslOptions;
  /** Итоговый режим SSL (для логов). */
  sslMode: SslMode;
  /** Режимы `allow`/`prefer` пробуют TLS и при неудаче откатываются на plaintext. */
  sslCanFallback: boolean;
  /** Параметры ожидания готовности БД при старте. */
  connect: { retries: number; delayMs: number; timeoutMs: number };
  pool: { max: number; idleTimeoutMillis: number };
  applicationName: string;
  /** `true`, если БД находится на другом хосте (облачная/управляемая). */
  isRemote: boolean;
  /** Описание подключения для логов — БЕЗ пароля. */
  safeTarget: string;
}

const SSL_MODES: SslMode[] = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"];

/** Хосты, которые считаются локальными (там TLS обычно не нужен). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function firstDefined(...names: string[]): string | undefined {
  for (const name of names) {
    const value = read(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function isLocalHost(host?: string): boolean {
  if (!host) return true;
  // Каталог unix-сокета (например /var/run/postgresql) — тоже локальный доступ.
  if (host.startsWith("/")) return true;
  return LOCAL_HOSTS.has(host.toLowerCase());
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSslMode(value: string | undefined): SslMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  // Короткие псевдонимы на случай опечаток/привычек.
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return "require";
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return "disable";
  if (normalized === "no-verify") return "require";
  return SSL_MODES.includes(normalized as SslMode) ? (normalized as SslMode) : undefined;
}

function resolveSslMode(raw: string | undefined, host: string | undefined): SslMode {
  const explicit = normalizeSslMode(raw);
  if (explicit) return explicit;
  if (raw) {
    // Явно указанное, но неизвестное значение — лучше упасть, чем молча
    // соединяться без шифрования.
    throw new Error(
      `Unknown database SSL mode "${raw}". Expected one of: ${SSL_MODES.join(", ")} (or true/false).`
    );
  }
  // По умолчанию: локальная БД — без TLS, удалённая (облачная) — пробуем TLS
  // и откатываемся на plaintext, если сервер его не поддерживает.
  return isLocalHost(host) ? "disable" : "prefer";
}

function readCaCertificates(): string | undefined {
  const caPath = firstDefined("DB_SSL_CA", "DB_SSLROOTCERT", "PGSSLROOTCERT");
  if (!caPath) return undefined;
  return fs.readFileSync(caPath, "utf8");
}

function buildSsl(mode: SslMode, ca: string | undefined): false | DatabaseSslOptions {
  if (mode === "disable") return false;

  const rejectUnauthorizedFromEnv = read("DB_SSL_REJECT_UNAUTHORIZED");
  const rejectUnauthorized =
    rejectUnauthorizedFromEnv === undefined
      ? // Как в libpq: require не проверяет сертификат, verify-* — проверяет.
        mode === "verify-ca" || mode === "verify-full"
      : rejectUnauthorizedFromEnv === "true";

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
    // verify-ca проверяет цепочку, но не имя хоста (как в libpq).
    ...(mode === "verify-ca" ? { checkServerIdentity: () => undefined } : {}),
  };
}

interface ParsedUrl {
  connectionString: string;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  sslMode?: string;
  applicationName?: string;
}

/**
 * Разбирает `DATABASE_URL`: возвращает строку БЕЗ SSL-параметров (они
 * применяются отдельно через `ssl`) и извлечённые из неё значения.
 */
function parseUrl(raw: string): ParsedUrl {
  const url = new URL(raw);
  const sslMode = url.searchParams.get("sslmode") ?? undefined;
  const applicationName = url.searchParams.get("application_name") ?? undefined;

  // SSL-параметры убираем из строки, чтобы pg не применил их сам
  // (мы управляем TLS явно через конфиг пула).
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");

  return {
    connectionString: url.toString(),
    host: url.hostname || undefined,
    port: url.port ? Number.parseInt(url.port, 10) : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    database: url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, "")) : undefined,
    sslMode,
    applicationName,
  };
}

/** Собирает строку подключения из отдельных переменных. */
function composeUrl(parts: {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}): string | undefined {
  // Unix-сокет передаём как есть — через URL он не собирается.
  if (parts.host.startsWith("/")) return undefined;

  const url = new URL("postgresql://");
  url.hostname = parts.host;
  if (parts.port) url.port = String(parts.port);
  if (parts.user) url.username = encodeURIComponent(parts.user);
  if (parts.password) url.password = encodeURIComponent(parts.password);
  if (parts.database) url.pathname = `/${encodeURIComponent(parts.database)}`;
  return url.toString();
}

/**
 * Собирает итоговую конфигурацию подключения из переменных окружения.
 * Вызывается ПОСЛЕ `dotenv.config()` (см. config/env.ts).
 */
export function resolveDatabaseConfig(): DatabaseConfig {
  const rawUrl = firstDefined("DATABASE_URL", "DB_URL");
  const host = firstDefined("DB_HOST", "PGHOST");
  const port = parseIntOr(firstDefined("DB_PORT", "PGPORT"), 5432);
  const user = firstDefined("DB_USER", "PGUSER");
  const password = firstDefined("DB_PASSWORD", "PGPASSWORD");
  const database = firstDefined("DB_NAME", "DB_DATABASE", "PGDATABASE");

  let connectionString: string | undefined;
  let resolvedHost = host;
  let resolvedPort = port;
  let resolvedUser = user;
  let resolvedDatabase = database;
  let urlSslMode: string | undefined;
  let urlApplicationName: string | undefined;

  if (rawUrl) {
    const parsed = parseUrl(rawUrl);
    connectionString = parsed.connectionString;
    resolvedHost = parsed.host ?? resolvedHost;
    resolvedPort = parsed.port ?? resolvedPort;
    resolvedUser = parsed.user ?? resolvedUser;
    resolvedDatabase = parsed.database ?? resolvedDatabase;
    urlSslMode = parsed.sslMode;
    urlApplicationName = parsed.applicationName;
  } else if (host) {
    connectionString = composeUrl({ host, port, user, password, database });
  } else {
    throw new Error(
      [
        "Database connection is not configured. Set DATABASE_URL, for example:",
        '  DATABASE_URL=postgresql://user:password@amvera-athariyyah-cnpg-dsu-debatedb-rw:5432/dsu_debate?sslmode=prefer',
        "or the separate variables DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.",
      ].join("\n")
    );
  }

  const sslMode = resolveSslMode(firstDefined("DB_SSLMODE", "DB_SSL", "PGSSLMODE") ?? urlSslMode, resolvedHost);
  const ca = readCaCertificates();
  const applicationName =
    firstDefined("DB_APPLICATION_NAME", "PGAPPNAME") ?? urlApplicationName ?? "dsu-debate-backend";

  const poolMax = parseIntOr(firstDefined("DB_POOL_MAX"), 20);
  // libpq-подобный таймаут подключения — в секундах.
  const connectTimeoutSec = parseIntOr(firstDefined("DB_CONNECT_TIMEOUT", "PGCONNECT_TIMEOUT"), 5);

  return {
    connectionString,
    // Отдельные поля нужны, если строка не собирается (unix-сокет).
    host: connectionString ? undefined : resolvedHost,
    port: connectionString ? undefined : resolvedPort,
    user: connectionString ? undefined : resolvedUser,
    password: connectionString ? undefined : password,
    database: connectionString ? undefined : resolvedDatabase,
    ssl: buildSsl(sslMode, ca),
    sslMode,
    sslCanFallback: sslMode === "allow" || sslMode === "prefer",
    connect: {
      retries: parseIntOr(firstDefined("DB_CONNECT_RETRIES"), 10),
      delayMs: parseIntOr(firstDefined("DB_CONNECT_RETRY_DELAY_MS"), 3000),
      // Для пула таймаут в миллисекундах.
      timeoutMs: connectTimeoutSec * 1000,
    },
    pool: {
      max: poolMax,
      idleTimeoutMillis: parseIntOr(firstDefined("DB_IDLE_TIMEOUT"), 30000),
    },
    applicationName,
    isRemote: !isLocalHost(resolvedHost),
    safeTarget: describeTarget({
      host: resolvedHost,
      port: resolvedPort,
      user: resolvedUser,
      database: resolvedDatabase,
      sslMode,
    }),
  };
}

/** Строит строку вида `postgresql://user@host:5432/db (sslmode=prefer)` — без пароля. */
function describeTarget(parts: {
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  sslMode: SslMode;
}): string {
  const credentials = parts.user ? `${parts.user}@` : "";
  const host = parts.host ?? "localhost";
  const port = parts.port ? `:${parts.port}` : "";
  const database = parts.database ? `/${parts.database}` : "";
  return `postgresql://${credentials}${host}${port}${database} (sslmode=${parts.sslMode})`;
}

/** Готовое описание подключения для логов (без пароля). */
export function describeDatabaseConfig(config: DatabaseConfig): string {
  return config.safeTarget;
}
