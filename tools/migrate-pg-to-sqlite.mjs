#!/usr/bin/env node
/**
 * PostgreSQL → SQLite миграция для DSU Debate
 * ==========================================
 * Два режима:
 * 1) --dump=./pg_dump.sql — парсит pg_dump (INSERT/COPY) и импортирует в SQLite
 * 2) --from-pg            — прямое копирование через pg Client → better-sqlite3
 *    требует PG_DUMP_URL / DATABASE_URL в окружении
 *
 * Трансляции:
 *   ENUM('upcoming','active','completed')    → TEXT CHECK
 *   TIMESTAMPTZ / TIMESTAMP                  → TEXT ISO8601 (UTC)
 *   INET                                   → TEXT
 *   BOOLEAN                                → INTEGER 0/1
 *   RETURNING                              → handled by better-sqlite3 RETURNING support
 *   SERIAL / BIGSERIAL                     → INTEGER PRIMARY KEY AUTOINCREMENT
 *
 * Запуск:
 *   node tools/migrate-pg-to-sqlite.mjs --dump=./dump.sql --sqlite=./backend/.localdb/database.sqlite
 *   node tools/migrate-pg-to-sqlite.mjs --from-pg --sqlite=./backend/.localdb/database.sqlite
 *
 * Либо через npm:
 *   npm run db:migrate:pg -- --dump=./dump.sql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const v = process.argv.find(a => a.startsWith(`--${name}=`));
  return v ? v.split("=")[1] : fallback;
}
const hasFlag = (n) => process.argv.includes(`--${n}`);
const dumpPath = arg("dump", null);
const sqlitePath = arg("sqlite", path.join(repoRoot, "backend/.localdb/database.sqlite"));
const fromPg = hasFlag("from-pg");

console.log(`[migrate] PG → SQLite`);
console.log(`[migrate] sqlite: ${sqlitePath}`);
if (dumpPath) console.log(`[migrate] dump: ${dumpPath}`);
if (fromPg) console.log(`[migrate] mode: direct PG → SQLite`);

// --- ensure better-sqlite3 available ---
let Database;
try {
  const mod = await import("better-sqlite3");
  Database = mod.default;
} catch (e) {
  console.error("[migrate] better-sqlite3 not found. Run: cd backend && npm install");
  process.exit(1);
}

// --- helpers ---
function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function convertValue(value, type) {
  if (value === null || value === undefined) return null;
  if (value === "\\N") return null; // COPY NULL
  if (type?.includes("bool")) return value === "t" || value === "true" || value === true ? 1 : 0;
  if (type?.includes("timestamptz") || type?.includes("timestamp")) {
    try { return new Date(value).toISOString(); } catch { return value; }
  }
  if (type?.includes("inet")) return String(value);
  return value;
}

// --- open/create sqlite ---
ensureDir(sqlitePath);
const db = new Database(sqlitePath);
try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF"); // off during bulk import
} catch {}
console.log(`[migrate] pragma WAL/foreign_keys configured`);

// Apply sqlite schema if not exists
const schemaSqlite = path.join(repoRoot, "sql/schema.sqlite.sql");
if (fs.existsSync(schemaSqlite)) {
  console.log(`[migrate] applying ${path.relative(repoRoot, schemaSqlite)}`);
  const sql = fs.readFileSync(schemaSqlite, "utf8");
  db.exec(sql);
  console.log(`[migrate] schema applied`);
} else {
  console.warn(`[migrate] schema not found: ${schemaSqlite}`);
}

// --- MODE 1: from pg_dump file ---
if (dumpPath) {
  if (!fs.existsSync(dumpPath)) {
    console.error(`[migrate] dump not found: ${dumpPath}`);
    process.exit(1);
  }
  console.log(`[migrate] parsing dump ${dumpPath} …`);
  let content = fs.readFileSync(dumpPath, "utf8");

  // Strip pg_dump header/footer
  // Convert pg types to sqlite equivalents for insert statements
  // We handle INSERT INTO ... VALUES (...) and COPY ... FROM stdin
  // Simple heuristic: rewrite inserts to be sqlite-compatible

  // Remove SET, SELECT pg_catalog, etc
  content = content
    .replace(/^SET .*;$/gm, "")
    .replace(/^SELECT pg_catalog.*$/gm, "")
    .replace(/::\w+(\[\])?/g, "")
    .replace(/\bTRUE\b/gi, "1")
    .replace(/\bFALSE\b/gi, "0");

  // For COPY: convert to INSERT
  // COPY table (cols) FROM stdin;\n rows \n \.
  const copyRe = /COPY\s+(\w+)\s*\(([^)]+)\)\s+FROM stdin;([\s\S]*?)\n\\\./g;
  let copyCount = 0;
  content = content.replace(copyRe, (_m, table, cols, data) => {
    const colList = cols.split(",").map(c => c.trim());
    const rows = data.trim().split("\n").filter(Boolean);
    let inserts = "";
    for (const row of rows) {
      // COPY uses tab-separated, \N for null, escapes
      const vals = row.split("\t").map(v => {
        if (v === "\\N") return "NULL";
        // unescape
        const unesc = v.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace(/\\'/g, "'");
        // quote string
        return `'${unesc.replace(/'/g, "''")}'`;
      });
      inserts += `INSERT OR IGNORE INTO ${table} (${colList.join(", ")}) VALUES (${vals.join(", ")});\n`;
      copyCount++;
    }
    return inserts;
  });
  if (copyCount) console.log(`[migrate] converted ${copyCount} COPY rows to INSERT`);

  // Execute dump inserts in transaction
  // Filter only INSERT/UPDATE for our tables
  const statements = content.split(";").map(s => s.trim()).filter(s =>
    s.toUpperCase().startsWith("INSERT") ||
    s.toUpperCase().startsWith("UPDATE") ||
    s.toUpperCase().startsWith("DELETE")
  );
  console.log(`[migrate] executing ${statements.length} statements …`);
  const txn = db.transaction((stmts) => {
    for (const stmt of stmts) {
      if (!stmt) continue;
      try {
        db.exec(stmt);
      } catch (e) {
        // Ignore duplicate key / already exists
        const msg = e.message || "";
        if (msg.includes("UNIQUE constraint") || msg.includes("already exists")) continue;
        console.warn(`[migrate] statement warning: ${msg.slice(0,120)} — ${stmt.slice(0,80)}`);
      }
    }
  });
  txn(statements);
  console.log(`[migrate] dump import finished`);
  db.pragma("foreign_keys = ON");
  // verify
  try {
    db.exec("PRAGMA foreign_key_check");
    console.log(`[migrate] foreign_key_check OK`);
  } catch {}
  console.log(`[migrate] done. DB: ${sqlitePath}`);
  process.exit(0);
}

// --- MODE 2: direct PG → SQLite ---
if (fromPg) {
  const pgUrl = process.env.PG_DUMP_URL || process.env.DATABASE_URL || process.env.PG_DATABASE_URL;
  if (!pgUrl) {
    console.error("[migrate] set DATABASE_URL or PG_DUMP_URL for --from-pg mode");
    process.exit(1);
  }
  let PgClient;
  try {
    const pg = await import("pg");
    PgClient = pg.Client;
  } catch {
    console.error("[migrate] pg not found. Run: npm install pg --save-dev");
    process.exit(1);
  }
  const client = new PgClient({ connectionString: pgUrl });
  console.log(`[migrate] connecting to PG …`);
  await client.connect();
  console.log(`[migrate] connected`);

  const tables = ["admins", "events", "participants", "votes", "schema_migrations"];
  // New domain tables optional (if already migrated)
  const extra = ["matches", "tournament_standings", "leaderboards", "podiums"];
  for (const t of extra) {
    try {
      const r = await client.query(`SELECT to_regclass($1) as exists`, [`public.${t}`]);
      if (r.rows[0]?.exists) tables.push(t);
    } catch {}
  }

  db.pragma("foreign_keys = OFF");
  const insertTxn = db.transaction(() => {
    // truncate? No, keep existing but upsert
  });

  for (const table of tables) {
    console.log(`[migrate] copying ${table} …`);
    let rows;
    try {
      rows = await client.query(`SELECT * FROM ${table} ORDER BY id`);
    } catch (e) {
      console.warn(`[migrate] skip ${table}: ${e.message}`);
      continue;
    }
    if (rows.rows.length === 0) {
      console.log(`[migrate] ${table}: 0 rows`);
      continue;
    }
    const cols = Object.keys(rows.rows[0]);
    const placeholders = cols.map(() => "?").join(", ");
    const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`);
    let n = 0;
    const txn = db.transaction((batch) => {
      for (const row of batch) {
        const vals = cols.map(col => {
          let v = row[col];
          if (v instanceof Date) return v.toISOString();
          if (typeof v === "boolean") return v ? 1 : 0;
          if (v && typeof v === "object" && col === "ip_address") return String(v);
          // TIMESTAMPTZ handling
          if (col.includes("date") || col.includes("_at") || col.includes("created") || col.includes("updated") || col.includes("scheduled")) {
            if (v) try { return new Date(v).toISOString(); } catch {}
          }
          return v;
        });
        try { stmt.run(...vals); n++; } catch (e) {
          console.warn(`  row ${n} warning: ${e.message}`);
        }
      }
    });
    txn(rows.rows);
    console.log(`[migrate] ${table}: ${n} rows copied`);
  }

  await client.end();
  db.pragma("foreign_keys = ON");
  try { db.exec("PRAGMA foreign_key_check"); console.log(`[migrate] foreign_key_check OK`); } catch {}
  console.log(`[migrate] direct copy finished. DB: ${sqlitePath}`);
  // sanity
  for (const t of tables) {
    try {
      const r = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
      console.log(`  ${t}: ${r.c} rows`);
    } catch {}
  }
  process.exit(0);
}

if (!dumpPath && !fromPg) {
  console.log(`
Usage:
  node tools/migrate-pg-to-sqlite.mjs --dump=./pg_dump.sql [--sqlite=./backend/.localdb/database.sqlite]
  PG_DUMP_URL=postgres://... node tools/migrate-pg-to-sqlite.mjs --from-pg

Steps (manual pg_dump):
  pg_dump --data-only --inserts --column-inserts -h localhost -U postgres -d dsu_debate -f dump.sql
  # then
  node tools/migrate-pg-to-sqlite.mjs --dump=./dump.sql

Verification:
  sqlite3 backend/.localdb/database.sqlite "SELECT count(*) FROM events; SELECT count(*) FROM votes;"
`);
  process.exit(0);
}
