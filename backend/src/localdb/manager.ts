/**
 * Управление встроенным PostgreSQL на компьютере разработчика.
 *
 * Идея: приложение не требует ни облака, ни установленного PostgreSQL —
 * кластер создаётся один раз в `backend/.localdb`, запускается через `pg_ctl`
 * (отдельным процессом, только на 127.0.0.1) и останавливается вместе с
 * backend. Данные при этом остаются на диске: перезапуск ничего не теряет.
 */
import fs from "fs";
import net from "net";
import path from "path";
import { spawn } from "child_process";
import { Client } from "pg";
import { describeLocalDatabaseError, LocalDatabaseError } from "./errors";
import { localLog, localLogBlock, localWarn } from "./log";
import {
  describeLocalDatabase,
  LocalDatabaseSettings,
  resolveLocalDatabaseSettings,
} from "./settings";
import {
  environmentWarnings,
  PostgresBinaries,
  probeBinaries,
  resolvePostgresBinaries,
} from "./binaries";

export interface LocalDatabaseStatus {
  /** Настройки, с которыми работает встроенная БД. */
  settings: LocalDatabaseSettings;
  /** Сервер PostgreSQL запущен и принимает соединения. */
  running: boolean;
  /** Сервер был запущен другим процессом (например, `npm run db:local`) и переиспользован. */
  reused: boolean;
  /** Кластер уже инициализирован (есть PG_VERSION). */
  initialised: boolean;
  /** База приложения существует. */
  databaseExists: boolean;
  /** Версия сервера, если удалось подключиться. */
  serverVersion?: string;
  binaries?: { source: string; binDir: string; version?: string };
  /** Размер каталога с данными в мегабайтах. */
  dataSizeMb?: number;
}

/** true, если именно этот процесс запустил PostgreSQL (и может его остановить). */
let startedByThisProcess = false;

export function isLocalDatabaseManagedByThisProcess(): boolean {
  return startedByThisProcess;
}

interface RunResult {
  code: number | null;
  output: string;
}

/**
 * Запускает дочерний процесс и собирает его вывод.
 * Вывод отдаётся и в консоль — прогресс initdb/pg_ctl полезно видеть.
 */
function run(
  command: string,
  args: string[],
  options: { timeoutMs: number; silent?: boolean } = { timeoutMs: 60000 }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // LC_MESSAGES=C — чтобы сообщения pg_ctl были предсказуемыми (на них
      // опирается разбор «no server running»).
      env: { ...process.env, LC_MESSAGES: "C" },
      windowsHide: true,
    });

    let output = "";
    const collect = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      output += text;
      if (!options.silent) process.stdout.write(text);
    };

    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new LocalDatabaseError(
          `${path.basename(command)} не ответил за ${Math.round(options.timeoutMs / 1000)} с.`,
          "Проверьте, не блокирует ли антивирус запуск postgres.exe."
        )
      );
    }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new LocalDatabaseError(
          `Не удалось запустить ${command}: ${error.message}`,
          windowsStartupHint(command, "")
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

/**
 * На Windows отсутствие runtime-библиотек (vcruntime140.dll), «Smart App
 * Control» и антивирусы приводят к тому, что исполняемый файл молча не
 * стартует — без внятного текста ошибки. Даём понятную подсказку.
 */
function windowsStartupHint(command: string, output: string): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (output.trim().length > 0) return undefined;
  return (
    `${path.basename(command)} не выдал ни одной строки вывода. На Windows это обычно значит, ` +
    "что не хватает библиотек Microsoft Visual C++ (vcruntime140.dll) или запуск блокирует " +
    "антивирус / Smart App Control. Установите «Microsoft Visual C++ Redistributable 2015–2022 " +
    "(x64)», разрешите запуск postgres.exe в защитнике Windows либо задайте LOCAL_DB_BIN_DIR " +
    "на каталог bin уже установленного PostgreSQL."
  );
}

/** Подключение к локальному серверу: `true`, если соединение и запрос прошли. */
export async function canConnectToLocalDatabase(
  settings: LocalDatabaseSettings,
  database: string,
  timeoutMs = 3000
): Promise<boolean> {
  const client = new Client({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database,
    connectionTimeoutMillis: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Занят ли TCP-порт (чтобы отличить «наша БД уже запущена» от «порт занят»). */
function isPortOpen(port: number, host: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function clusterInitialised(settings: LocalDatabaseSettings): boolean {
  return fs.existsSync(path.join(settings.dataDir, "PG_VERSION"));
}

/** Каталог с данными, который PostgreSQL согласится использовать. */
function prepareDataDirectory(settings: LocalDatabaseSettings): void {
  fs.mkdirSync(settings.rootDir, { recursive: true });
  fs.mkdirSync(path.dirname(settings.logFile), { recursive: true });

  if (!fs.existsSync(settings.dataDir)) {
    fs.mkdirSync(settings.dataDir, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(settings.dataDir);
  if (entries.length > 0) {
    throw new LocalDatabaseError(
      `Каталог ${settings.dataDir} не пуст и не содержит кластер PostgreSQL (нет PG_VERSION).`,
      "Удалите этот каталог вручную или задайте другой LOCAL_DB_DIR."
    );
  }
}

/** Первичная инициализация кластера (`initdb`). */
async function initialiseCluster(
  settings: LocalDatabaseSettings,
  binaries: PostgresBinaries
): Promise<void> {
  localLog(`первый запуск: создаю кластер PostgreSQL в ${settings.dataDir}`);
  prepareDataDirectory(settings);

  const passwordFile = path.join(settings.rootDir, "initdb-password.tmp");
  fs.writeFileSync(passwordFile, `${settings.password}\n`, { encoding: "utf8", mode: 0o600 });

  try {
    const result = await run(
      binaries.initdb,
      [
        `--pgdata=${settings.dataDir}`,
        `--username=${settings.user}`,
        `--pwfile=${passwordFile}`,
        // Локальные сокеты/loopback без пароля, TCP — по паролю из .env.
        "--auth-local=trust",
        "--auth-host=scram-sha-256",
        // UTF8 + locale C: одинаково на Windows (в т.ч. с русской локалью),
        // Linux и macOS. Иначе кириллица может уехать в WIN1251.
        "--encoding=UTF8",
        "--locale=C",
      ],
      { timeoutMs: settings.timeoutMs }
    );

    if (result.code !== 0) {
      const hint = windowsStartupHint(binaries.initdb, result.output);
      throw new LocalDatabaseError(
        `initdb завершился с кодом ${result.code}.`,
        hint ?? `Полный вывод выше. Каталог данных: ${settings.dataDir}`
      );
    }
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }

  localLog("кластер создан");
}

/** Запуск сервера (`pg_ctl ... start`). Процесс живёт отдельно от Node. */
async function startServer(
  settings: LocalDatabaseSettings,
  binaries: PostgresBinaries
): Promise<void> {
  const waitSeconds = Math.max(10, Math.round(settings.timeoutMs / 1000));
  const result = await run(
    binaries.pgCtl,
    [
      "-D",
      settings.dataDir,
      "-l",
      settings.logFile,
      "-w",
      "-t",
      String(waitSeconds),
      // Только loopback: база не доступна из сети, наружу смотрит лишь API.
      "-o",
      `-p ${settings.port} -c listen_addresses=127.0.0.1`,
      "start",
    ],
    { timeoutMs: settings.timeoutMs + 15000 }
  );

  if (result.code !== 0) {
    localLogBlock("pg_ctl", result.output);
    throw new LocalDatabaseError(
      `PostgreSQL не запустился (код ${result.code}).`,
      [
        `Смотрите лог: ${settings.logFile}`,
        `Порт ${settings.port} должен быть свободен (LOCAL_DB_PORT=... чтобы сменить).`,
        windowsStartupHint(binaries.pgCtl, result.output),
      ]
        .filter(Boolean)
        .join("\n  → ")
    );
  }
}

/** Создаёт базу приложения, если её ещё нет (подключение к служебной `postgres`). */
async function ensureApplicationDatabase(settings: LocalDatabaseSettings): Promise<boolean> {
  const client = new Client({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      settings.database,
    ]);
    if (existing.rowCount) return false;
    await client.query(`CREATE DATABASE "${settings.database}"`);
    localLog(`создана база ${settings.database}`);
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function readServerVersion(settings: LocalDatabaseSettings): Promise<string | undefined> {
  const client = new Client({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    const result = await client.query<{ server_version: string }>("SHOW server_version");
    return result.rows[0]?.server_version;
  } catch {
    return undefined;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Гарантирует, что встроенная БД запущена и база приложения существует.
 * Идемпотентно: повторный вызов просто переиспользует работающий сервер.
 */
export async function startLocalDatabase(): Promise<LocalDatabaseStatus> {
  const settings = resolveLocalDatabaseSettings();
  const binaries = resolvePostgresBinaries();

  // 1. Сервер уже работает? Тогда ничего не запускаем (и не будем останавливать
  //    при выходе — им владеет другой процесс).
  if (await canConnectToLocalDatabase(settings, "postgres")) {
    await ensureApplicationDatabase(settings).catch(() => undefined);
    localLog(`использую уже запущенный PostgreSQL: ${describeLocalDatabase(settings)}`);
    return localDatabaseStatus();
  }

  // 2. Порт занят, но нашим паролем/пользователем подключиться не удалось —
  //    это чужая БД, дальше идти нельзя.
  if (await isPortOpen(settings.port, settings.host)) {
    throw new LocalDatabaseError(
      `Порт ${settings.port} занят, но подключиться как «${settings.user}» не получается.`,
      `Похоже, там другой PostgreSQL. Задайте другой порт: LOCAL_DB_PORT=55433 в backend/.env`
    );
  }

  warnAboutEnvironmentOnce(settings);

  // 3. Инициализация кластера (только один раз).
  if (!clusterInitialised(settings)) {
    await initialiseCluster(settings, binaries);
  }

  // 4. Старт сервера.
  await startServer(settings, binaries);
  startedByThisProcess = true;

  if (!(await canConnectToLocalDatabase(settings, "postgres"))) {
    throw new LocalDatabaseError(
      `PostgreSQL запущен, но соединение с ${settings.host}:${settings.port} не проходит.`,
      `Проверьте лог: ${settings.logFile}`
    );
  }

  await ensureApplicationDatabase(settings);
  localLog(`встроенный PostgreSQL готов: ${describeLocalDatabase(settings)}`);
  return localDatabaseStatus();
}

let warningsPrinted = false;
function warnAboutEnvironmentOnce(settings: LocalDatabaseSettings): void {
  if (warningsPrinted) return;
  warningsPrinted = true;
  for (const warning of environmentWarnings(settings.dataDir)) localWarn(warning);
}

/** Останавливает сервер (`pg_ctl stop`). Возвращает `true`, если он был запущен. */
export async function stopLocalDatabase(): Promise<boolean> {
  const settings = resolveLocalDatabaseSettings();

  if (!clusterInitialised(settings)) {
    startedByThisProcess = false;
    return false;
  }

  let binaries: PostgresBinaries;
  try {
    binaries = resolvePostgresBinaries();
  } catch {
    // Без бинарников остановить нечем — это не критично при выходе.
    return false;
  }

  const result = await run(
    binaries.pgCtl,
    ["-D", settings.dataDir, "-m", "fast", "-w", "-t", "60", "stop"],
    { timeoutMs: 90000, silent: true }
  );

  startedByThisProcess = false;

  if (result.code === 0) {
    localLog("встроенный PostgreSQL остановлен (данные сохранены)");
    return true;
  }

  if (/no server running|not running/i.test(result.output)) {
    localLog("встроенный PostgreSQL уже был остановлен");
    return false;
  }

  localWarn(
    `не удалось остановить PostgreSQL: ${result.output.trim() || `код ${result.code}`}\n` +
      `  → его можно остановить вручную: npm run db:local:stop`
  );
  return false;
}

/** Останавливает и снова запускает сервер. */
export async function restartLocalDatabase(): Promise<LocalDatabaseStatus> {
  await stopLocalDatabase();
  return startLocalDatabase();
}

function directorySizeMb(dir: string): number | undefined {
  if (!fs.existsSync(dir)) return undefined;
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      } catch {
        // Файл мог исчезнуть между readdir и stat — не повод падать.
      }
    }
  }
  return Math.round((total / (1024 * 1024)) * 10) / 10;
}

/** Текущее состояние встроенной БД (ничего не запускает и не меняет). */
export async function localDatabaseStatus(): Promise<LocalDatabaseStatus> {
  const settings = resolveLocalDatabaseSettings();
  const running = await canConnectToLocalDatabase(settings, "postgres");
  const databaseExists = running
    ? await canConnectToLocalDatabase(settings, settings.database)
    : false;

  let binaries: LocalDatabaseStatus["binaries"];
  try {
    const resolved = resolvePostgresBinaries();
    const probe = probeBinaries(resolved);
    binaries = {
      source: resolved.source,
      binDir: resolved.binDir,
      version: probe.ok ? probe.version : undefined,
    };
  } catch {
    binaries = undefined;
  }

  return {
    settings,
    running,
    reused: running && !startedByThisProcess,
    initialised: clusterInitialised(settings),
    databaseExists,
    serverVersion: databaseExists ? await readServerVersion(settings) : undefined,
    binaries,
    dataSizeMb: directorySizeMb(settings.dataDir),
  };
}

export interface DoctorCheck {
  name: string;
  state: "ok" | "warn" | "fail";
  details: string;
  hint?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

/**
 * Диагностика «почему не работает»: Node, бинарники, путь, порт, кластер,
 * соединение, база, миграции. Никогда не бросает исключение.
 */
export async function doctorLocalDatabase(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const settings = resolveLocalDatabaseSettings();

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push({
    name: "Node.js",
    state: nodeMajor >= 18 ? "ok" : "fail",
    details: `v${process.versions.node} (${process.platform}-${process.arch})`,
    hint: nodeMajor >= 18 ? undefined : "Нужен Node.js 18 или новее: https://nodejs.org",
  });

  const externalConfig = Boolean(
    (process.env.DATABASE_URL ?? process.env.DB_URL)?.trim() ||
      (process.env.DB_HOST ?? process.env.PGHOST)?.trim()
  );
  if (externalConfig) {
    checks.push({
      name: "Источник данных",
      state: "warn",
      details: "задана внешняя БД (DATABASE_URL / DB_HOST) — встроенный PostgreSQL не используется",
      hint: "Уберите эти переменные (и LOCAL_DATABASE=false), если хотите локальную БД.",
    });
  }

  let binaries: PostgresBinaries | undefined;
  try {
    binaries = resolvePostgresBinaries();
    const probe = probeBinaries(binaries);
    checks.push({
      name: "Бинарники PostgreSQL",
      state: probe.ok ? "ok" : "fail",
      details: probe.ok
        ? `${probe.version ?? "версия неизвестна"} — ${binaries.source}`
        : `не запускаются: ${probe.output || "нет вывода"}`,
      hint: probe.ok
        ? undefined
        : windowsStartupHint(binaries.postgres, probe.output) ??
          "Переустановите зависимости: cd backend && npm install",
    });
  } catch (error) {
    checks.push({
      name: "Бинарники PostgreSQL",
      state: "fail",
      details: describeLocalDatabaseError(error),
    });
  }

  const pathWarnings = environmentWarnings(settings.dataDir);
  const dataSizeMb = directorySizeMb(settings.dataDir);
  checks.push({
    name: "Каталог данных",
    state: pathWarnings.length === 0 ? "ok" : "warn",
    details: `${settings.dataDir}${dataSizeMb ? ` (${dataSizeMb} МБ)` : ""}`,
    hint: pathWarnings.join(" ") || undefined,
  });

  const initialised = clusterInitialised(settings);
  checks.push({
    name: "Кластер",
    state: initialised ? "ok" : "warn",
    details: initialised ? "инициализирован (есть PG_VERSION)" : "ещё не создан — будет создан при запуске",
  });

  const running = await canConnectToLocalDatabase(settings, "postgres");
  const portOpen = running ? true : await isPortOpen(settings.port, settings.host);
  checks.push({
    name: "Сервер",
    state: running ? "ok" : portOpen ? "fail" : "warn",
    details: running
      ? `работает на ${settings.host}:${settings.port}`
      : portOpen
        ? `порт ${settings.port} занят посторонним процессом`
        : `не запущен (порт ${settings.port} свободен)`,
    hint: running
      ? undefined
      : portOpen
        ? `Смените порт: LOCAL_DB_PORT=55433 в backend/.env`
        : "Запустите backend (`npm run dev`) — он поднимет БД сам, либо выполните npm run db:local",
  });

  const databaseExists = running
    ? await canConnectToLocalDatabase(settings, settings.database)
    : false;
  checks.push({
    name: "База приложения",
    state: databaseExists ? "ok" : "warn",
    details: databaseExists
      ? `«${settings.database}» доступна`
      : `«${settings.database}» пока не создана (создастся при запуске)`,
  });

  if (databaseExists) {
    const client = new Client({
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database: settings.database,
      connectionTimeoutMillis: 3000,
    });
    try {
      await client.connect();
      const version = await client.query<{ server_version: string }>("SHOW server_version");
      checks.push({ name: "Версия сервера", state: "ok", details: version.rows[0]?.server_version ?? "?" });

      const migrations = await client
        .query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version")
        .catch(() => undefined);
      checks.push({
        name: "Миграции",
        state: migrations ? "ok" : "warn",
        details: migrations
          ? migrations.rows.length > 0
            ? `применены: ${migrations.rows.map((row) => row.version).join(", ")}`
            : "ни одна миграция ещё не применена (применятся при запуске)"
          : "таблица schema_migrations не найдена",
      });
    } catch (error) {
      checks.push({
        name: "Подключение",
        state: "fail",
        details: describeLocalDatabaseError(error),
      });
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  return {
    ok: checks.every((check) => check.state !== "fail"),
    checks,
  };
}

/** Последние строки лога PostgreSQL (для `npm run db:local:logs`). */
export function readLocalDatabaseLog(lines = 40): string | undefined {
  const settings = resolveLocalDatabaseSettings();
  if (!fs.existsSync(settings.logFile)) return undefined;

  const maxBytes = 128 * 1024;
  const stats = fs.statSync(settings.logFile);
  const start = Math.max(0, stats.size - maxBytes);
  const buffer = Buffer.alloc(Math.min(maxBytes, stats.size - start));
  const fd = fs.openSync(settings.logFile, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }

  const all = buffer.toString("utf8").split(/\r?\n/);
  return all.slice(-lines).join("\n").trim();
}
