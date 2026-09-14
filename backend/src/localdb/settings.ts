/**
 * Настройки встроенного PostgreSQL, который запускается прямо на компьютере
 * разработчика (вместо облачной/внешней БД).
 *
 * Значения по умолчанию подобраны так, чтобы ничего не нужно было настраивать:
 *   - порт 55432 — чтобы не конфликтовать с уже установленным PostgreSQL (5432);
 *   - сервер слушает только 127.0.0.1 — в локальную сеть база не открывается;
 *   - данные лежат в `backend/.localdb` — рядом с проектом, их легко удалить.
 *
 * Всё переопределяется переменными окружения (см. `backend/.env.example`).
 */
import path from "path";

export interface LocalDatabaseSettings {
  /** Каталог данных кластера (PGDATA). */
  dataDir: string;
  /** Каталог со всем локальным «хозяйством»: данные, логи, временные файлы. */
  rootDir: string;
  /** Файл логов PostgreSQL. */
  logFile: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Сколько ждать инициализацию и запуск сервера, мс. */
  timeoutMs: number;
}

export const LOCAL_DB_DEFAULTS = {
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "dsu_debate",
  timeoutMs: 120000,
} as const;

/** Значения переменной LOCAL_DATABASE, которые отключают встроенную БД. */
const DISABLED_VALUES = new Set(["false", "0", "no", "off", "disable", "disabled"]);

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Корень пакета `backend` независимо от того, запущен код из `src`
 * (tsx/ts-node-dev) или из собранного `dist`.
 */
export function backendRoot(): string {
  // backend/src/localdb/settings.ts -> backend ; backend/dist/localdb/settings.js -> backend
  return path.resolve(__dirname, "..", "..");
}

/**
 * Включена ли встроенная БД. По умолчанию — да (`LOCAL_DATABASE=auto`).
 * Отключается только явным `LOCAL_DATABASE=false` — это нужно, когда
 * приложение должно работать с уже готовым внешним PostgreSQL.
 */
export function isLocalDatabaseEnabled(): boolean {
  const raw = readEnv("LOCAL_DATABASE");
  if (raw === undefined) return true;
  return !DISABLED_VALUES.has(raw.toLowerCase());
}

/** Значение переменной LOCAL_DATABASE (для логов и doctor-отчёта). */
export function localDatabaseMode(): "auto" | "on" | "off" {
  const raw = readEnv("LOCAL_DATABASE");
  if (raw === undefined) return "auto";
  if (DISABLED_VALUES.has(raw.toLowerCase())) return "off";
  return "on";
}

function assertSimpleName(value: string, envName: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(
      `${envName} must contain only latin letters, digits and underscores (got "${value}")`
    );
  }
  return value;
}

/** Итоговые настройки встроенной БД. */
export function resolveLocalDatabaseSettings(): LocalDatabaseSettings {
  const rawDir = readEnv("LOCAL_DB_DIR");
  const rootDir = rawDir
    ? path.resolve(path.isAbsolute(rawDir) ? rawDir : path.join(backendRoot(), rawDir))
    : path.join(backendRoot(), ".localdb");

  const user = assertSimpleName(readEnv("LOCAL_DB_USER") ?? LOCAL_DB_DEFAULTS.user, "LOCAL_DB_USER");
  const database = assertSimpleName(
    readEnv("LOCAL_DB_NAME") ?? LOCAL_DB_DEFAULTS.database,
    "LOCAL_DB_NAME"
  );

  return {
    rootDir,
    dataDir: path.join(rootDir, "postgres"),
    logFile: path.join(rootDir, "logs", "postgres.log"),
    host: LOCAL_DB_DEFAULTS.host,
    port: parseIntOr(readEnv("LOCAL_DB_PORT"), LOCAL_DB_DEFAULTS.port),
    user,
    password: readEnv("LOCAL_DB_PASSWORD") ?? LOCAL_DB_DEFAULTS.password,
    database,
    timeoutMs: parseIntOr(readEnv("LOCAL_DB_TIMEOUT_MS"), LOCAL_DB_DEFAULTS.timeoutMs),
  };
}

function encodeCredentialsPart(value: string): string {
  return encodeURIComponent(value);
}

/** Строка подключения к встроенной БД (с паролем — для внутреннего использования). */
export function localDatabaseUrl(settings: LocalDatabaseSettings): string {
  const credentials = `${encodeCredentialsPart(settings.user)}:${encodeCredentialsPart(
    settings.password
  )}`;
  return `postgresql://${credentials}@${settings.host}:${settings.port}/${settings.database}`;
}

/** Описание подключения без пароля — для логов. */
export function describeLocalDatabase(settings: LocalDatabaseSettings): string {
  return `${settings.user}@${settings.host}:${settings.port}/${settings.database} (встроенная БД, данные: ${settings.rootDir})`;
}
