/**
 * Поиск исполняемых файлов PostgreSQL для встроенной БД.
 *
 * Отдельно ставить PostgreSQL не нужно: бинарники (`initdb`, `postgres`,
 * `pg_ctl`) приходят вместе с npm-пакетом `embedded-postgres`, а тот
 * подтягивает нужный пакет под вашу ОС и архитектуру:
 *   Windows x64  — @embedded-postgres/windows-x64
 *   macOS        — @embedded-postgres/darwin-x64 | darwin-arm64
 *   Linux        — @embedded-postgres/linux-x64 | linux-arm64 | ...
 *
 * Если бинарников нет (нестандартная архитектура, `npm install --no-optional`
 * или уже установленный PostgreSQL, который хочется использовать) — путь до
 * каталога `bin` можно задать переменной `LOCAL_DB_BIN_DIR`.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { backendRoot } from "./settings";
import { LocalDatabaseError } from "./errors";
import { localWarn } from "./log";

export interface PostgresBinaries {
  /** Каталог с исполняемыми файлами PostgreSQL. */
  binDir: string;
  initdb: string;
  postgres: string;
  pgCtl: string;
  /** Откуда взялись бинарники — для логов и `db:local:status`. */
  source: string;
}

const EXE = process.platform === "win32" ? ".exe" : "";

/** Пакеты с бинарниками под разные платформы (как в embedded-postgres). */
const PLATFORM_PACKAGES: Record<string, string[]> = {
  "win32-x64": ["@embedded-postgres/windows-x64"],
  // На Windows ARM64 x64-бинарники запускаются через эмуляцию — это лучше,
  // чем ничего: отдельного пакета под windows-arm64 не существует.
  "win32-arm64": ["@embedded-postgres/windows-x64"],
  "darwin-x64": ["@embedded-postgres/darwin-x64"],
  "darwin-arm64": ["@embedded-postgres/darwin-arm64"],
  "linux-x64": ["@embedded-postgres/linux-x64"],
  "linux-arm64": ["@embedded-postgres/linux-arm64"],
  "linux-arm": ["@embedded-postgres/linux-arm"],
  "linux-ia32": ["@embedded-postgres/linux-ia32"],
  "linux-ppc64": ["@embedded-postgres/linux-ppc64"],
};

function platformCandidates(): string[] {
  return PLATFORM_PACKAGES[`${process.platform}-${process.arch}`] ?? [];
}

/** Пробует резолвить точку входа пакета (dist/index.js) системным резолвером. */
function resolvePackageEntry(pkg: string): string | undefined {
  try {
    // require.resolve доступен всегда (backend собирается в CommonJS).
    return require.resolve(pkg);
  } catch {
    return undefined;
  }
}

/**
 * Возвращает каталоги `native/bin` пакета с бинарниками — сначала через
 * резолвер Node (учитывает вложенные node_modules), затем прямым перебором
 * ожидаемых мест.
 */
function candidateBinDirs(pkg: string): string[] {
  const dirs: string[] = [];
  const entry = resolvePackageEntry(pkg);
  if (entry) {
    // .../node_modules/<pkg>/dist/index.js -> .../node_modules/<pkg>/native/bin
    dirs.push(path.join(path.dirname(entry), "..", "native", "bin"));
  }
  const pkgPath = pkg.split("/");
  const roots = [
    path.join(backendRoot(), "node_modules"),
    path.join(backendRoot(), "node_modules", "embedded-postgres", "node_modules"),
  ];
  for (const root of roots) {
    dirs.push(path.join(root, ...pkgPath, "native", "bin"));
  }
  return dirs;
}

function binariesIn(binDir: string, source: string): PostgresBinaries | undefined {
  const binaries: PostgresBinaries = {
    binDir,
    initdb: path.join(binDir, `initdb${EXE}`),
    postgres: path.join(binDir, `postgres${EXE}`),
    pgCtl: path.join(binDir, `pg_ctl${EXE}`),
    source,
  };
  const missing = [binaries.initdb, binaries.postgres, binaries.pgCtl].filter(
    (file) => !fs.existsSync(file)
  );
  return missing.length === 0 ? binaries : undefined;
}

/**
 * Находит бинарники PostgreSQL.
 * Бросает `LocalDatabaseError` с инструкцией, если их не удалось найти.
 */
export function resolvePostgresBinaries(): PostgresBinaries {
  const explicitDir = process.env.LOCAL_DB_BIN_DIR?.trim();
  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    const binaries = binariesIn(resolved, "LOCAL_DB_BIN_DIR");
    if (!binaries) {
      throw new LocalDatabaseError(
        `В LOCAL_DB_BIN_DIR (${resolved}) нет initdb${EXE}, postgres${EXE} и pg_ctl${EXE}.`,
        "Укажите каталог `bin` установленного PostgreSQL, например C:\\Program Files\\PostgreSQL\\17\\bin"
      );
    }
    return binaries;
  }

  const packages = platformCandidates();
  for (const pkg of packages) {
    for (const binDir of candidateBinDirs(pkg)) {
      const binaries = binariesIn(binDir, pkg);
      if (binaries) return binaries;
    }
  }

  const platformLabel = `${process.platform}-${process.arch}`;
  const hint =
    "Установите зависимости заново (`cd backend && npm install`) — пакет embedded-postgres " +
    "скачивает бинарники PostgreSQL под вашу платформу. Если платформа нестандартная " +
    `(${platformLabel}) или установлен свой PostgreSQL, задайте LOCAL_DB_BIN_DIR ` +
    "(каталог bin установленного PostgreSQL) либо укажите внешнюю БД через DATABASE_URL.";
  throw new LocalDatabaseError(
    packages.length === 0
      ? `Для платформы ${platformLabel} нет готовых бинарников PostgreSQL.`
      : `Не удалось найти бинарники PostgreSQL (${packages.join(", ")}).`,
    hint
  );
}

export interface BinaryProbeResult {
  ok: boolean;
  version?: string;
  /** Полный вывод initdb/postgres --version. */
  output: string;
}

/**
 * Проверяет, что бинарники действительно запускаются, и узнаёт версию.
 * Отдельно ловит типичную для Windows ситуацию: файл есть, но процесс не
 * стартует из-за отсутствующих библиотек (vcruntime140.dll и т.п.).
 */
export function probeBinaries(binaries: PostgresBinaries): BinaryProbeResult {
  const result = spawnSync(binaries.postgres, ["--version"], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, LC_MESSAGES: "C" },
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const versionMatch = output.match(/PostgreSQL\)?\s+([0-9][0-9A-Za-z.\-_]*)/);
  return {
    ok: result.status === 0,
    version: versionMatch?.[1],
    output,
  };
}

/**
 * Предупреждает о проблемах, из-за которых PostgreSQL может не запуститься
 * на конкретной машине. Возвращает список предупреждений (для `doctor`).
 */
export function environmentWarnings(dataDir: string): string[] {
  const warnings: string[] = [];

  if (process.platform === "win32" && /[^\x20-\x7E]/.test(dataDir)) {
    warnings.push(
      `Путь к данным содержит символы вне ASCII (${dataDir}). PostgreSQL на Windows ` +
        "плохо переносит такие пути — задайте LOCAL_DB_DIR=C:\\dsu-localdb (латиницей, без пробелов)."
    );
  }

  if (process.platform === "win32" && /\s/.test(dataDir)) {
    warnings.push(
      `Путь к данным содержит пробелы (${dataDir}). Обычно это работает, но при странных ` +
        "ошибках задайте LOCAL_DB_DIR без пробелов, например C:\\dsu-localdb."
    );
  }

  return warnings;
}

/** Печатает предупреждения об окружении (один раз, при старте). */
export function warnAboutEnvironment(dataDir: string): void {
  for (const warning of environmentWarnings(dataDir)) localWarn(warning);
}
