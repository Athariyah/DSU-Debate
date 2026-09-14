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
  // Встроенная локальная БД.
  "LOCAL_DATABASE",
  "LOCAL_DB_DIR",
  "LOCAL_DB_PORT",
  "LOCAL_DB_USER",
  "LOCAL_DB_PASSWORD",
  "LOCAL_DB_NAME",
  "LOCAL_DB_BIN_DIR",
  "LOCAL_DB_TIMEOUT_MS",
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

test("по умолчанию использует встроенную БД на этом компьютере", () => {
  setEnv({});

  const config = resolveDatabaseConfig();

  assert.equal(config.localEmbedded, true);
  assert.equal(
    config.connectionString,
    "postgresql://postgres:postgres@127.0.0.1:55432/dsu_debate"
  );
  assert.equal(config.sslMode, "disable");
  assert.equal(config.ssl, false);
  assert.equal(config.isRemote, false);
});

test("LOCAL_DB_* настраивают встроенную БД", () => {
  setEnv({
    LOCAL_DB_PORT: "6000",
    LOCAL_DB_USER: "dsu",
    LOCAL_DB_PASSWORD: "p@ss/wo:rd#1",
    LOCAL_DB_NAME: "my_debate_db",
  });

  const config = resolveDatabaseConfig();

  assert.equal(config.localEmbedded, true);
  assert.equal(
    config.connectionString,
    "postgresql://dsu:p%40ss%2Fwo%3Ard%231@127.0.0.1:6000/my_debate_db"
  );
  // Пароль никогда не попадает в логи.
  assert.ok(!config.safeTarget.includes("p@ss"));
});

test("настройки встроенной БД по умолчанию лежат в backend/.localdb", () => {
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

test("LOCAL_DB_DIR задаёт каталог данных", () => {
  setEnv({ LOCAL_DB_DIR: "./my-local-db" });

  const settings = resolveLocalDatabaseSettings();

  assert.ok(settings.rootDir.endsWith("my-local-db"));
  assert.ok(settings.dataDir.endsWith("postgres"));
});

test("внешняя БД отключает встроенную", () => {
  setEnv({ DB_HOST: "localhost", DB_NAME: "dsu_debate" });

  const config = resolveDatabaseConfig();

  assert.equal(config.localEmbedded, false);
  assert.equal(config.isRemote, false);
});

test("использует DATABASE_URL и вырезает из неё sslmode", () => {
  setEnv({
    DATABASE_URL: "postgresql://dsu_debate:secret@db.example.com:5432/dsu_debatedb?sslmode=require",
  });

  const config = resolveDatabaseConfig();

  assert.equal(
    config.connectionString,
    "postgresql://dsu_debate:secret@db.example.com:5432/dsu_debatedb"
  );
  assert.equal(config.sslMode, "require");
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(config.isRemote, true);
  assert.equal(config.localEmbedded, false);
});

test("собирает строку подключения из отдельных DB_* переменных", () => {
  setEnv({
    DB_HOST: "db.example.com",
    DB_PORT: "5432",
    DB_NAME: "dsu_debatedb",
    DB_USER: "dsu_debate",
    DB_PASSWORD: "p@ss/wo:rd#1",
  });

  const config = resolveDatabaseConfig();

  assert.equal(
    config.connectionString,
    "postgresql://dsu_debate:p%40ss%2Fwo%3Ard%231@db.example.com:5432/dsu_debatedb"
  );
  // Удалённый хост по умолчанию пробует TLS и умеет откатываться на plaintext.
  assert.equal(config.sslMode, "prefer");
  assert.equal(config.sslCanFallback, true);
  // Пароль никогда не попадает в логи.
  assert.ok(!config.safeTarget.includes("p@ss"));
});

test("для локального хоста TLS по умолчанию отключён", () => {
  setEnv({ DATABASE_URL: "postgresql://dsu:dsu@127.0.0.1:5432/dsu_debate" });

  const config = resolveDatabaseConfig();

  assert.equal(config.sslMode, "disable");
  assert.equal(config.ssl, false);
  assert.equal(config.isRemote, false);
});

test("DB_SSLMODE переопределяет sslmode из строки подключения", () => {
  setEnv({
    DATABASE_URL: "postgresql://dsu:dsu@db.example.com:5432/dsu?sslmode=disable",
    DB_SSLMODE: "verify-full",
  });

  const config = resolveDatabaseConfig();

  assert.equal(config.sslMode, "verify-full");
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.sslCanFallback, false);
});

test("бросает понятную ошибку, если подключение не задано, а встроенная БД выключена", () => {
  setEnv({ LOCAL_DATABASE: "false" });

  assert.throws(() => resolveDatabaseConfig(), /Database connection is not configured/);
});

test("бросает ошибку на неизвестном режиме SSL", () => {
  setEnv({ DB_HOST: "db.example.com", DB_SSLMODE: "yes-please" });

  assert.throws(() => resolveDatabaseConfig(), /Unknown database SSL mode/);
});
