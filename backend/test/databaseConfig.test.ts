import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { resolveDatabaseConfig } from "../src/config/database";

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
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGSSLMODE",
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

test("использует DATABASE_URL и вырезает из неё sslmode", () => {
  setEnv({
    DATABASE_URL:
      "postgresql://dsu_debate:secret@amvera-athariyyah-cnpg-dsu-debatedb-rw:5432/dsu_debatedb?sslmode=require",
  });

  const config = resolveDatabaseConfig();

  assert.equal(
    config.connectionString,
    "postgresql://dsu_debate:secret@amvera-athariyyah-cnpg-dsu-debatedb-rw:5432/dsu_debatedb"
  );
  assert.equal(config.sslMode, "require");
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(config.isRemote, true);
});

test("собирает строку подключения из отдельных DB_* переменных", () => {
  setEnv({
    DB_HOST: "amvera-athariyyah-cnpg-dsu-debatedb-rw",
    DB_PORT: "5432",
    DB_NAME: "dsu_debatedb",
    DB_USER: "dsu_debate",
    DB_PASSWORD: "p@ss/wo:rd#1",
  });

  const config = resolveDatabaseConfig();

  assert.equal(
    config.connectionString,
    "postgresql://dsu_debate:p%40ss%2Fwo%3Ard%231@amvera-athariyyah-cnpg-dsu-debatedb-rw:5432/dsu_debatedb"
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

test("бросает понятную ошибку, если подключение не задано", () => {
  setEnv({});

  assert.throws(() => resolveDatabaseConfig(), /Database connection is not configured/);
});

test("бросает ошибку на неизвестном режиме SSL", () => {
  setEnv({ DB_HOST: "db.example.com", DB_SSLMODE: "yes-please" });

  assert.throws(() => resolveDatabaseConfig(), /Unknown database SSL mode/);
});
