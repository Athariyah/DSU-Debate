/**
 * Конфигурация подключения к SQLite (better-sqlite3).
 *
 * SQLite — файловая БД, WAL-режим обеспечивает параллельное чтение/запись.
 * Поддерживаются:
 *   1) Явный путь через SQLITE_PATH / SQLITE_FILE / DB_PATH (приоритет)
 *   2) По умолчанию: backend/.localdb/database.sqlite (локальный файл рядом с проектом)
 *   3) Временно: совместимость с предыдущими PostgreSQL переменными DATABASE_URL / DB_HOST —
 *      они игнорируются с предупреждением и используется SQLite.
 *
 * Для обратной совместимости сохраняются поля ssl/isRemote/localEmbedded,
 * чтобы существующие проверки в env.ts не ломались.
 */
import path from "path";
import fs from "fs";
import { backendRoot } from "../localdb/settings";

export type SslMode = "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full";

export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
  checkServerIdentity?: () => undefined;
}

export interface DatabaseConfig {
  /** Путь к файлу SQLite */
  sqlitePath: string;
  /** Для совместимости — всегда sqlite:// */
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl: false;
  sslMode: SslMode;
  sslCanFallback: boolean;
  connect: { retries: number; delayMs: number; timeoutMs: number };
  pool: { max: number; idleTimeoutMillis: number };
  applicationName: string;
  isRemote: boolean;
  localEmbedded: boolean;
  /** Признак SQLite — новый флаг */
  isSqlite: boolean;
  safeTarget: string;
}

function read(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function firstDefined(...names: string[]): string | undefined {
  for (const n of names) {
    const v = read(n);
    if (v !== undefined) return v;
  }
  return undefined;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const p = Number.parseInt(value, 10);
  return Number.isFinite(p) && p > 0 ? p : fallback;
}

export function backendRootForDb(): string {
  return backendRoot();
}

/** Определяет путь к SQLite файлу */
export function resolveSqlitePath(): string {
  const explicit =
    firstDefined("SQLITE_PATH", "SQLITE_FILE", "DB_PATH", "LOCAL_DB_PATH") ??
    firstDefined("SQLITE_DB", "SQLITE_DATABASE");

  if (explicit) {
    // Поддержка :memory: для тестов
    if (explicit === ":memory:") return ":memory:";
    // Относительный путь — относительно backendRoot
    if (!path.isAbsolute(explicit)) {
      return path.resolve(backendRoot(), explicit);
    }
    return explicit;
  }

  // По умолчанию — backend/.localdb/database.sqlite (gitignore)
  // Альтернативный вариант — backend/data.sqlite если каталог данных не создан
  const defaultPath = path.join(backendRoot(), ".localdb", "database.sqlite");
  return defaultPath;
}

export function resolveDatabaseConfig(): DatabaseConfig {
  const rawUrl = firstDefined("DATABASE_URL", "DB_URL");
  const host = firstDefined("DB_HOST", "PGHOST");

  // Предупреждение: проект перешёл на SQLite — старые postgres переменные игнорируются
  if (rawUrl && rawUrl.startsWith("postgres")) {
    console.warn(
      `[db] ВНИМАНИЕ: обнаружена DATABASE_URL для PostgreSQL, но проект теперь использует SQLite. ` +
        `Postgres URL игнорируется. Используйте SQLITE_PATH для задания пути или выполните миграцию через tools/migrate-pg-to-sqlite.ts.`
    );
  } else if (host) {
    console.warn(
      `[db] ВНИМАНИЕ: обнаружены DB_HOST/PGHOST для PostgreSQL, но проект теперь использует SQLite. Игнорируются.`
    );
  }

  const sqlitePath = resolveSqlitePath();
  const safeTarget = sqlitePath === ":memory:" ? "sqlite://:memory: (WAL)" : `sqlite://${sqlitePath} (WAL)`;

  const retries = parseIntOr(firstDefined("DB_CONNECT_RETRIES"), 3);
  const delayMs = parseIntOr(firstDefined("DB_CONNECT_RETRY_DELAY_MS"), 500);
  const timeoutMs = parseIntOr(firstDefined("DB_CONNECT_TIMEOUT", "PGCONNECT_TIMEOUT"), 5) * 1000;

  return {
    sqlitePath,
    connectionString: `sqlite://${sqlitePath}`,
    host: undefined,
    port: undefined,
    user: undefined,
    password: undefined,
    database: sqlitePath,
    ssl: false,
    sslMode: "disable",
    sslCanFallback: false,
    connect: { retries, delayMs, timeoutMs },
    pool: {
      max: parseIntOr(firstDefined("DB_POOL_MAX"), 1),
      idleTimeoutMillis: parseIntOr(firstDefined("DB_IDLE_TIMEOUT"), 30000),
    },
    applicationName: firstDefined("DB_APPLICATION_NAME", "PGAPPNAME") ?? "dsu-debate-backend",
    isRemote: false,
    localEmbedded: false,
    isSqlite: true,
    safeTarget,
  };
}

function describeTarget(parts: { sqlitePath: string }): string {
  return parts.sqlitePath === ":memory:" ? "sqlite://:memory: (WAL)" : `sqlite://${parts.sqlitePath} (WAL)`;
}

export function describeDatabaseConfig(config: DatabaseConfig): string {
  return config.safeTarget;
}

// Обратная совместимость: некоторые модули могут импортировать эти символы
export function isLocalHost(): boolean {
  return true;
}
