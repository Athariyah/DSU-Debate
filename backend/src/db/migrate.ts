import fs from "fs/promises";
import path from "path";
import { pool } from "../config/db";
import { resolveDatabaseConfig } from "../config/database";

function isSqlite(): boolean {
  try {
    return resolveDatabaseConfig().isSqlite;
  } catch {
    return true;
  }
}

async function findMigrationsDir(): Promise<string | undefined> {
  const candidates = [
    path.resolve(__dirname, "../sql/migrations"),
    path.resolve(__dirname, "../../sql/migrations"),
    path.resolve(__dirname, "../../../sql/migrations"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {}
  }
  return undefined;
}

async function findSchemaSqlite(): Promise<string | undefined> {
  const candidates = [
    path.resolve(__dirname, "../sql/schema.sqlite.sql"),
    path.resolve(__dirname, "../../sql/schema.sqlite.sql"),
    path.resolve(__dirname, "../../../sql/schema.sqlite.sql"),
    path.resolve(__dirname, "../../../sql/schema.sql"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      if (c.endsWith("schema.sqlite.sql")) return c;
    } catch {}
  }
  // fallback: try sqlite schema
  for (const c of candidates) {
    if (c.endsWith("schema.sqlite.sql")) {
      try {
        await fs.access(c);
        return c;
      } catch {}
    }
  }
  return undefined;
}

function sanitizeForSqlite(sql: string): string {
  // Удаляем PG-специфичные конструкции, которые SQLite не понимает
  let s = sql;
  // Убрать DO $$ ... $$; блоки
  s = s.replace(/DO\s+\$\$[\s\S]*?\$\$;/gi, "");
  // Убрать CREATE EXTENSION
  s = s.replace(/CREATE\s+EXTENSION[^;]*;/gi, "");
  // Убрать CREATE TYPE
  s = s.replace(/CREATE\s+TYPE[^;]*;/gi, "");
  // Убрать CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql; блоки
  s = s.replace(/CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?LANGUAGE\s+plpgsql\s*;/gi, "");
  // Убрать COMMENT ON
  s = s.replace(/COMMENT\s+ON[^;]*;/gi, "");
  // Убрать BEGIN; / COMMIT; обёртки миграций (оставим транзакцию на уровне приложения)
  s = s.replace(/^\s*BEGIN\s*;\s*$/gim, "");
  s = s.replace(/^\s*COMMIT\s*;\s*$/gim, "");
  return s;
}

export async function runMigrations(): Promise<void> {
  const sqlite = isSqlite();

  if (sqlite) {
    // SQLite ветка
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // Если есть полный sqlite schema файл — применяем его первым (идемпотентно)
    const schemaPath = await findSchemaSqlite();
    if (schemaPath) {
      try {
        const schemaSql = await fs.readFile(schemaPath, "utf8");
        // Выполняем схему целиком через exec (может содержать несколько стейтментов)
        // Разбиваем на отдельные команды по ; но лучше выполнить через db.exec который поддерживает много
        // Используем pool.query с целиком — наш execQuery умеет handled через db.exec при наличии ;
        await pool.query(schemaSql);
        console.log(`[migration] applied sqlite schema ${path.basename(schemaPath)}`);
      } catch (e) {
        console.warn(`[migration] sqlite schema apply warning:`, e instanceof Error ? e.message : e);
      }
    }

    const migrationsDir = await findMigrationsDir();
    if (!migrationsDir) throw new Error("SQL migrations directory was not found (sqlite)");

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      const version = file.split("_")[0];
      const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = ?", [version]);
      if (existing.rowCount) continue;

      const raw = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const sql = sanitizeForSqlite(raw);

      // Старые PG миграции 001..006 уже покрыты sqlite schema — помечаем как применённые без выполнения
      const isLegacyPgMigration = ["001", "002", "003", "004", "005", "006"].includes(version);
      if (isLegacyPgMigration) {
        await pool.query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)", [version]);
        console.log(`[migration] marked legacy ${file} as applied (covered by sqlite schema)`);
        continue;
      }

      // Пытаемся выполнить миграцию; если колонка уже существует (например 007 повторно), помечаем как применённую
      try {
        // Разбиваем на стейтменты по ; для лучшей совместимости
        // Но pool.query уже умеет exec многострочные; попробуем целиком
        if (sql.trim()) {
          await pool.query(sql);
        }
        await pool.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
        console.log(`[migration] applied ${file}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Дубликат колонки или таблицы — считаем уже применённой (идемпотентность)
        if (/duplicate column|already exists|UNIQUE constraint failed|duplicate/i.test(msg)) {
          console.warn(`[migration] ${file} already applied (duplicate): ${msg} — marking as done`);
          try {
            await pool.query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)", [version]);
          } catch {}
          continue;
        }
        // Пробуем разбить на отдельные команды
        console.warn(`[migration] ${file} failed full exec, trying split: ${msg}`);
        const statements = sql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        let ok = true;
        for (const stmt of statements) {
          if (!stmt) continue;
          try {
            await pool.query(stmt);
          } catch (e2) {
            const m2 = e2 instanceof Error ? e2.message : String(e2);
            if (/duplicate column|already exists/i.test(m2)) continue;
            console.error(`[migration] statement failed in ${file}: ${stmt.slice(0, 120)} — ${m2}`);
            ok = false;
            break;
          }
        }
        if (ok) {
          await pool.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
          console.log(`[migration] applied ${file} (split)`);
        } else {
          throw error;
        }
      }
    }
    return;
  }

  // Fallback: старая PostgreSQL логика (оставлена для совместимости, если вдруг вернут PG)
  const candidates = [
    path.resolve(__dirname, "../sql/migrations"),
    path.resolve(__dirname, "../../sql/migrations"),
    path.resolve(__dirname, "../../../sql/migrations"),
  ];
  let migrationsDir: string | undefined;
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      migrationsDir = candidate;
      break;
    } catch {}
  }
  if (!migrationsDir) throw new Error("SQL migrations directory was not found");

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\\d+_.+\\.sql$/.test(file))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    )
  `);

  for (const file of files) {
    const version = file.split("_")[0];
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE version = ?", [version]);
    if (existing.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
      await client.query("COMMIT");
      console.log(`[migration] applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
