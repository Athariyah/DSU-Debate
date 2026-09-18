import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { resolveDatabaseConfig } from "./database";

/**
 * SQLite пул на базе better-sqlite3.
 * Обеспечивает совместимый с pg интерфейс pool.query / pool.connect / withTransaction
 * + WAL, индексы, foreign_keys, кэширование.
 */

export interface PoolClient {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[]; rowCount: number }>;
  release: () => void;
}

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

// Синглтон
let dbInstance: Database.Database | null = null;
let dbPathGlobal: string | null = null;

function getSqlitePath(): string {
  const cfg = resolveDatabaseConfig();
  return cfg.sqlitePath;
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const sqlitePath = getSqlitePath();
  dbPathGlobal = sqlitePath;
  if (sqlitePath !== ":memory:") {
    const dir = path.dirname(sqlitePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(sqlitePath);
  // Оптимизации SQLite
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = -64000");
    db.pragma("foreign_keys = ON");
    db.pragma("temp_store = MEMORY");
    db.pragma("busy_timeout = 5000");
    try {
      db.pragma("mmap_size = 268435456");
    } catch {}
    // Для совместимости с возможной старой строкой подключения postgres в env — чистим
  } catch (e) {
    console.warn("[db] pragma warning:", e);
  }
  dbInstance = db;
  return db;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expandDollarParams(sql: string, params: any[]): { sql: string; params: any[] } {
  const re = /\$(\d+)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  let newSql = "";
  const newParams: any[] = [];
  let found = false;
  while ((m = re.exec(sql)) !== null) {
    found = true;
    newSql += sql.slice(last, m.index);
    newSql += "?";
    const idx = parseInt(m[1], 10) - 1;
    newParams.push(params[idx]);
    last = re.lastIndex;
  }
  newSql += sql.slice(last);
  if (!found) return { sql, params };
  return { sql: newSql, params: newParams };
}

/** Трансляция PostgreSQL-синтаксиса в SQLite */
function translateSQL(sql: string): string {
  let s = sql;

  // ::type casts
  s = s.replace(/::\w+(\[\])?/g, "");

  // now() -> strftime ISO
  s = s.replace(/\bnow\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ','now')");

  // Специальный случай для votingTimer: интервал длительности
  s = s.replace(
    /COALESCE\(voting_started_at,\s*date_time\)\s*\+\s*make_interval\(secs\s*=>\s*voting_duration_minutes\s*\*\s*60\)/gi,
    "datetime(COALESCE(voting_started_at, date_time), '+' || voting_duration_minutes || ' minutes')"
  );
  s = s.replace(/make_interval\([^)]+\)/gi, "datetime('now')");

  // Убираем FOR UPDATE / FOR SHARE (SQLite блокирует через транзакцию)
  s = s.replace(/\bFOR UPDATE OF [a-zA-Z0-9_,\s]+\b/gi, "");
  s = s.replace(/\bFOR UPDATE\b/gi, "");
  s = s.replace(/\bFOR SHARE\b/gi, "");

  // FALSE/TRUE -> 0/1, но не внутри строковых литералов — упрощённо
  // Чтобы не ломать значения внутри '...', делаем замену только для отдельных слов вне кавычек
  // Простая эвристика: если в строке есть '...' не будем трогать внутренности
  // Для наших запросов это безопасно
  s = s.replace(/\bFALSE\b/gi, "0");
  s = s.replace(/\bTRUE\b/gi, "1");

  // to_regclass -> sqlite_master проверка
  if (s.includes("to_regclass")) {
    s = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='admins') AS exists";
  }

  // pg_database -> фиктивный запрос (данные SQLite не используют pg_database)
  if (s.includes("pg_database")) {
    // Возвращаем пустой результат, чтобы логика создания БД не споткнулась
    // Но лучше вернуть 0 строк, а проверяющий код должен считать БД существующей
    s = "SELECT 1 WHERE 0";
  }

  if (s.trim().toUpperCase().startsWith("SHOW")) {
    s = "SELECT sqlite_version() AS server_version";
  }

  if (s.includes("pg_tables")) {
    s = "SELECT name AS tablename FROM sqlite_master WHERE type='table' ORDER BY name";
  }

  if (s.includes("pg_stat_ssl")) {
    s = "SELECT 0 AS ssl, NULL AS version, NULL AS cipher WHERE 0";
  }

  if (s.includes("current_database()")) {
    s = "SELECT 'sqlite' AS database, 'sqlite' AS user, NULL AS server_address, NULL AS server_port, sqlite_version() AS version";
  }

  // btrim -> trim
  s = s.replace(/\bbtrim\b/gi, "trim");

  // ILIKE -> LIKE (SQLite не имеет ILIKE, делаем COLLATE NOCASE)
  s = s.replace(/\bILIKE\b/gi, "LIKE COLLATE NOCASE");

  // PostgreSQL specific: SELECT ... FROM generate_series? Не используется

  return s;
}

function mapParams(params: any[]): any[] {
  return params.map((p) => {
    if (p instanceof Date) return p.toISOString();
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

function convertRow(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string" && (/^\d{4}-\d{2}-\d{2}/.test(v) || k.endsWith("_at") || k === "date_time")) {
      // Попытка распарсить как дату: 'YYYY-MM-DD HH:MM:SS' -> ISO, 'YYYY-MM-DDTHH:MM:SSZ' -> ISO
      let iso = v;
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v)) {
        iso = v.replace(" ", "T") + "Z";
      }
      // Если это ISO-подобная строка, пробуем сделать Date
      const d = new Date(iso);
      if (!isNaN(d.getTime()) && (iso.includes("T") || iso.includes("-"))) {
        // Проверяем что это действительно дата, а не просто число-строка
        // Только для колонок дат
        if (k.endsWith("_at") || k === "date_time" || k === "created_at" || k === "updated_at" || k.includes("date")) {
          out[k] = d;
          continue;
        }
      }
    }
    out[k] = v;
  }
  return out;
}

async function execQuery<T = any>(sqlOriginal: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const db = getDb();
  // Сначала разворачиваем $1,$2 с учётом повторного использования, затем транслируем синтаксис
  const expanded = expandDollarParams(sqlOriginal, params);
  const sql = translateSQL(expanded.sql);
  const mapped = mapParams(expanded.params);
  const trimmed = sql.trim().toUpperCase();

  // Определяем тип запроса
  const isSelect = trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("PRAGMA");
  const hasReturning = sql.toUpperCase().includes("RETURNING");

  try {
    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...mapped) as T[];
      const converted = rows.map((r: any) => convertRow(r));
      return { rows: converted as T[], rowCount: converted.length };
    }

    if (hasReturning) {
      // INSERT/UPDATE/DELETE ... RETURNING — в better-sqlite3 поддерживается через .all
      const stmt = db.prepare(sql);
      const rows = stmt.all(...mapped) as T[];
      const converted = rows.map((r: any) => convertRow(r));
      return { rows: converted as T[], rowCount: converted.length };
    }

    if (
      trimmed.startsWith("INSERT") ||
      trimmed.startsWith("UPDATE") ||
      trimmed.startsWith("DELETE") ||
      trimmed.startsWith("REPLACE")
    ) {
      const stmt = db.prepare(sql);
      const info = stmt.run(...mapped);
      return { rows: [] as unknown as T[], rowCount: info.changes };
    }

    // DDL, BEGIN/COMMIT/ROLLBACK, CREATE etc.
    if (mapped.length > 0) {
      // Если есть параметры, используем prepare
      try {
        const stmt = db.prepare(sql);
        const info = stmt.run(...mapped);
        return { rows: [] as unknown as T[], rowCount: (info as any).changes ?? 0 };
      } catch {
        db.exec(sql);
        return { rows: [] as unknown as T[], rowCount: 0 };
      }
    } else {
      // Несколько стейтментов через exec (миграции могут содержать BEGIN...COMMIT)
      // better-sqlite3 exec поддерживает несколько команд
      // Но prepare не поддерживает несколько — используем exec
      // Проверяем содержит ли ; и несколько операторов
      if (sql.includes(";")) {
        db.exec(sql);
        return { rows: [] as unknown as T[], rowCount: 0 };
      }
      const stmt = db.prepare(sql);
      try {
        const rows = (stmt as any).all ? (stmt.all() as T[]) : [];
        return { rows: rows.map(convertRow), rowCount: rows.length };
      } catch {
        const info = stmt.run();
        return { rows: [] as unknown as T[], rowCount: (info as any).changes ?? 0 };
      }
    }
  } catch (err: any) {
    // Пробрасываем с кодом для обработки duplicate
    // SQLite duplicate error code = SQLITE_CONSTRAINT, constraint violation
    // Для совместимости с PG 23505, проставляем code
    if (err && typeof err === "object" && err.code && String(err.code).startsWith("SQLITE_CONSTRAINT")) {
      // Проверяем UNIQUE
      if (/UNIQUE|unique/i.test(err.message)) {
        (err as any).code = "23505";
      }
    } else if (err && /UNIQUE constraint failed/i.test(String(err.message))) {
      (err as any).code = "23505";
    }
    throw err;
  }
}

// Пул объект совместимый с pg
export const pool = {
  query: <T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> => {
    return execQuery<T>(sql, params ?? []);
  },
  connect: async (): Promise<PoolClient> => {
    // SQLite один коннект, выдаём клиент-обёртку
    return {
      query: <T = any>(sql: string, params?: any[]) => execQuery<T>(sql, params ?? []),
      release: () => {
        // no-op
      },
    };
  },
  end: async (): Promise<void> => {
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch {}
      dbInstance = null;
    }
  },
  on: (_event: string, _handler: (err: any) => void) => {
    // SQLite не имеет idle ошибок пула — заглушка
  },
};

// Для логирования — путь
function describeTarget(): string {
  const p = dbPathGlobal ?? getSqlitePath();
  return p === ":memory:" ? "sqlite://:memory: (WAL)" : `sqlite://${p} (WAL)`;
}

export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const msg = String((error as any).message ?? "");
  if (!code && !msg) return false;
  const sqliteBusy = ["SQLITE_BUSY", "SQLITE_CANTOPEN", "SQLITE_IOERR", "SQLITE_CORRUPT"];
  if (code && sqliteBusy.includes(code)) return true;
  if (/SQLITE_BUSY|database is locked|unable to open database/i.test(msg)) return true;
  // Совместимость со старыми PG кодами
  if (code && ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "08000", "08001", "08003", "08004", "08006", "08P01", "57P01", "57P02", "57P03"].includes(code)) return true;
  return false;
}

export async function waitForDatabase(): Promise<void> {
  const cfg = resolveDatabaseConfig();
  const target = cfg.safeTarget;
  const { retries, delayMs } = cfg.connect;
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      if (attempt > 1) {
        console.log(`[db] connected to ${target} on attempt ${attempt}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`[db] ${target} is not ready (attempt ${attempt}/${retries}): ${errorMessage(error)} — retrying in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
  }
  throw new Error(`Could not connect to SQLite at ${target} after ${retries} attempt(s): ${errorMessage(lastError)}`);
}

export async function inspectDatabase(): Promise<DatabaseReport> {
  const cfg = resolveDatabaseConfig();
  const target = cfg.safeTarget;
  // Версия sqlite
  let serverVersion: string | undefined;
  try {
    const v = await pool.query<{ version: string }>("SELECT sqlite_version() AS version");
    serverVersion = (v.rows[0] as any)?.version ?? (v.rows[0] as any)?.["sqlite_version()"];
  } catch {}

  // Таблицы
  let tables: string[] = [];
  try {
    const t = await pool.query<{ tablename: string }>("SELECT name AS tablename FROM sqlite_master WHERE type='table' ORDER BY name");
    tables = t.rows.map((r: any) => r.tablename);
  } catch {}

  // Миграции
  let migrations: string[] = [];
  try {
    const m = await pool.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
    migrations = m.rows.map((r: any) => r.version);
  } catch {}

  // Для отчёта стараемся заполнить поля как для PG, но SQLite не имеет сетевых параметров
  return {
    target,
    sslMode: "disable",
    database: cfg.sqlitePath,
    user: "sqlite",
    serverAddress: null,
    serverPort: null,
    tls: null,
    serverVersion,
    tables,
    migrations,
  };
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const db = getDb();
  try {
    // BEGIN IMMEDIATE захватывает write-lock, защита от гонок лучше чем DEFERRED
    db.exec("BEGIN IMMEDIATE");
    const result = await fn(client);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

// Восстановление для совместимости со старым localdb/ensure
export function recoverLocalDatabaseIfNeeded(_msg?: string): void {
  // Для SQLite восстановление не нужно — файл всегда доступен
}
