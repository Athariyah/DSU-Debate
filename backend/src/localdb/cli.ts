/**
 * CLI для встроенной БД:
 *
 *   npm run db:local          — создать (при необходимости) и запустить БД
 *   npm run db:local:stop     — остановить БД
 *   npm run db:local:restart  — перезапустить
 *   npm run db:local:status   — показать состояние
 *   npm run db:local:doctor   — диагностика «почему не работает»
 *   npm run db:local:logs     — последние строки лога PostgreSQL
 *
 * Важно: модуль намеренно не импортирует config/env — команды должны
 * работать даже тогда, когда основное приложение не может стартовать
 * из-за ошибки в настройках подключения.
 */
import { describeLocalDatabaseError } from "./errors";
import { localLog } from "./log";
import {
  doctorLocalDatabase,
  localDatabaseStatus,
  LocalDatabaseStatus,
  readLocalDatabaseLog,
  restartLocalDatabase,
  startLocalDatabase,
  stopLocalDatabase,
} from "./manager";
import { resolveLocalDatabaseSettings } from "./settings";

function externalConfigNotice(): void {
  const hasExternal = Boolean(
    (process.env.DATABASE_URL ?? process.env.DB_URL)?.trim() ||
      (process.env.DB_HOST ?? process.env.PGHOST)?.trim()
  );
  if (hasExternal) {
    localLog(
      "внимание: задана внешняя БД (DATABASE_URL/DB_HOST) — приложение будет использовать её, " +
        "а не локальный PostgreSQL."
    );
  }
}

function printStatus(status: LocalDatabaseStatus): void {
  const { settings } = status;
  const lines = [
    `данные:    ${settings.rootDir}${status.dataSizeMb ? ` (${status.dataSizeMb} МБ)` : ""}`,
    `адрес:     postgresql://${settings.user}@${settings.host}:${settings.port}/${settings.database}`,
    `сервер:    ${
      status.running
        ? `запущен${status.serverVersion ? ` (PostgreSQL ${status.serverVersion})` : ""}${
            status.reused ? ", переиспользован другим процессом" : ""
          }`
        : "не запущен"
    }`,
    `кластер:   ${status.initialised ? "инициализирован" : "ещё не создан"}`,
    `база:      ${status.databaseExists ? `«${settings.database}» доступна` : "пока не создана"}`,
    `бинарники: ${
      status.binaries
        ? `${status.binaries.source}${status.binaries.version ? ` (PostgreSQL ${status.binaries.version})` : ""}`
        : "не найдены"
    }`,
    `логи:      ${settings.logFile}`,
  ];
  localLog("состояние встроенной БД:");
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(`  ${line}`);
  }
}

function printDoctor(report: { ok: boolean; checks: { name: string; state: string; details: string; hint?: string }[] }): void {
  localLog("диагностика встроенной БД:");
  for (const check of report.checks) {
    const mark = check.state === "ok" ? "✓" : check.state === "warn" ? "!" : "✗";
    // eslint-disable-next-line no-console
    console.log(`  ${mark} ${check.name}: ${check.details}`);
    if (check.hint) {
      // eslint-disable-next-line no-console
      console.log(`      → ${check.hint}`);
    }
  }
  localLog(report.ok ? "критических проблем не найдено" : "найдены проблемы — см. подсказки выше");
}

function usage(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Использование: npm run db:local[:команда]",
      "",
      "  start    создать (если нужно) и запустить локальную БД (по умолчанию)",
      "  stop     остановить локальную БД",
      "  restart  перезапустить локальную БД",
      "  status   показать состояние",
      "  doctor   диагностика окружения",
      "  logs     последние строки лога PostgreSQL",
      "",
      "Настройки — переменные окружения LOCAL_DB_* (см. backend/.env.example).",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const command = (process.argv[2] ?? "start").toLowerCase();

  switch (command) {
    case "start": {
      externalConfigNotice();
      const status = await startLocalDatabase();
      printStatus(status);
      localLog("БД работает в фоне и останется запущенной после закрытия терминала.");
      localLog("Остановить: npm run db:local:stop");
      return;
    }
    case "stop": {
      const stopped = await stopLocalDatabase();
      if (!stopped) {
        localLog("встроенная БД не запущена — останавливать нечего");
      }
      return;
    }
    case "restart": {
      const status = await restartLocalDatabase();
      printStatus(status);
      return;
    }
    case "status": {
      printStatus(await localDatabaseStatus());
      return;
    }
    case "doctor": {
      const report = await doctorLocalDatabase();
      printDoctor(report);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    case "logs": {
      const tail = readLocalDatabaseLog(Number.parseInt(process.argv[3] ?? "40", 10) || 40);
      if (!tail) {
        localLog(`лог пока пуст или не найден: ${resolveLocalDatabaseSettings().logFile}`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(tail);
      return;
    }
    case "help":
    case "--help":
    case "-h": {
      usage();
      return;
    }
    default: {
      localLog(`неизвестная команда: ${command}`);
      usage();
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[db:local] ошибка: ${describeLocalDatabaseError(error)}`);
  process.exitCode = 1;
});
