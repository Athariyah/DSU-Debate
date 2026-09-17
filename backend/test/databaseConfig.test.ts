import assert from "node:assert/strict";
import path from "node:path";
import test, { afterEach } from "node:test";

import { resolveDatabaseConfig } from "../src/config/database";
import { resolveLocalDatabaseSettings } from "../src/localdb/settings";

const DB_ENV_VARS = [
  "DATABASE_URL",
  "DB_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_DATABASE",
  "DB_USER",
  "DB_PASSWORD",
  "DB_SSLMODE",
  "DB_SSL",
  "DB_SSL_CA",
  "DB_POOL_MAX",
  "DB_CONNECT_RETRIES",
  "DB_CONNECT_RETRY_DELAY_MS",
  "DB_IDLE_TIMEOUT",
  "DB_CONNECT_TIMEOUT",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGSSLMODE",
  "LOCAL_DATABASE",
  "LOCAL_DB_DIR",
  "LOCAL_DB_PORT",
  "LOCAL_DB_USER",
  "LOCAL_DB_PASSWORD",
  "LOCAL_DB_NAME",
  "LOCAL_DB_BIN_DIR",
  "LOCAL_DB_TIMEOUT_MS",
  "SQLITE_PATH",
  "SQLITE_FILE",
  "DB_PATH",
];

const savedEnv = new Map<string, string | undefined>();
for (const name of DB_ENV_VARS) savedEnv.set(name, process.env[name]);

afterEach(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setEnv(values: Record<string, string>): void {
  for (const name of DB_ENV_VARS) delete process.env[name];
  Object.assign(process.env, values);
}

test("по умолчанию использует SQLite в backend/.localdb/database.sqlite", () => {
  setEnv({});
  const config = resolveDatabaseConfig();
  assert.equal((config as any).isSqlite, true);
  assert.ok(config.sqlitePath.endsWith("database.sqlite"));
  assert.ok(config.sqlitePath.includes(".localdb"));
  assert.equal(config.ssl, false);
  assert.equal(config.isRemote, false);
  assert.ok(config.safeTarget.startsWith("sqlite://"));
});

test("SQLITE_PATH настраивает путь к файлу", () => {
  setEnv({ SQLITE_PATH: "/tmp/custom.db" });
  const config = resolveDatabaseConfig();
  assert.equal(config.sqlitePath, "/tmp/custom.db");
  assert.ok(config.safeTarget.includes("/tmp/custom.db"));
});

test("SQLITE_PATH=:memory: для тестов", () => {
  setEnv({ SQLITE_PATH: ":memory:" });
  const config = resolveDatabaseConfig();
  assert.equal(config.sqlitePath, ":memory:");
  assert.equal(config.safeTarget, "sqlite://:memory: (WAL)");
});

test("SQLITE_PATH относительный — резолвится от backendRoot", () => {
  setEnv({ SQLITE_PATH: "./data/test.db" });
  const config = resolveDatabaseConfig();
  assert.ok(path.isAbsolute(config.sqlitePath));
  assert.ok(config.sqlitePath.endsWith(path.join("data", "test.db")));
});

test("настройки встроенной БД по умолчанию лежат в backend/.localdb (совместимость)", () => {
  setEnv({});
  const settings = resolveLocalDatabaseSettings();
  assert.equal(settings.port, 55432);
  assert.equal(settings.user, "postgres");
  assert.equal(settings.database, "dsu_debate");
  assert.ok(settings.dataDir.endsWith("postgres"));
  assert.ok(settings.rootDir.endsWith(".localdb"));
  assert.ok(settings.dataDir.startsWith(settings.rootDir));
  assert.ok(path.isAbsolute(settings.rootDir));
  assert.ok(settings.logFile.includes("logs"));
});

test("LOCAL_DB_DIR задаёт каталог данных (совместимость)", () => {
  setEnv({ LOCAL_DB_DIR: "./my-local-db" });
  const settings = resolveLocalDatabaseSettings();
  assert.ok(settings.rootDir.endsWith("my-local-db"));
  assert.ok(settings.dataDir.endsWith("postgres"));
});

test("PostgreSQL переменные игнорируются (проект теперь на SQLite)", () => {
  setEnv({ DATABASE_URL: "postgresql://dsu:secret@db.example.com:5432/db?sslmode=require" });
  const config = resolveDatabaseConfig();
  // Теперь это SQLite, а не postgres
  assert.equal((config as any).isSqlite, true);
  assert.ok(config.sqlitePath.endsWith("database.sqlite"));
});

test("собирает путь из SQLITE_FILE", () => {
  setEnv({ SQLITE_FILE: "/tmp/from-sqlite-file.db" });
  const config = resolveDatabaseConfig();
  assert.equal(config.sqlitePath, "/tmp/from-sqlite-file.db");
});
