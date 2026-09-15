import path from "path";
import dotenv from "dotenv";
import { describeDatabaseConfig, resolveDatabaseConfig } from "./database";
import { resolveCorsPolicy } from "./corsPolicy";

// Файл `backend/.env` ищем по расположению кода (backend/src/config или
// backend/dist/config), а не по текущему каталогу: тогда настройки одинаково
// подхватываются и из `npm run dev`, и из `npm start`, и при запуске из корня.
// dotenv не перезаписывает уже заданные переменные окружения, поэтому
// значения из окружения/панели хостинга остаются приоритетными.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
// Дополнительно — `.env` в текущем каталоге (привычное поведение).
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseTrustProxy(value: string | undefined): boolean | number {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : false;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

/**
 * Откуда фронтенду разрешено обращаться к API. Подробности — в
 * config/corsPolicy.ts: по умолчанию в режиме разработки разрешены любые
 * источники (локальный хостинг), явный список CORS_ORIGIN делает политику
 * строгой, а в production список обязателен (проверка ниже).
 */
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsPolicy = resolveCorsPolicy(nodeEnv, corsOriginEnv);

const jwtSecret = required(
  "JWT_SECRET",
  nodeEnv === "production" ? undefined : "dev-only-secret"
);
/**
 * Локальный хостинг «из коробки»: в режиме разработки, если ADMIN_* не заданы,
 * используется предсказуемая учётная запись (её создаёт backend при первом
 * старте — см. config/bootstrap.ts). В production такие значения запрещены.
 */
const DEV_ADMIN_EMAIL = "admin@dsu.local";
const DEV_ADMIN_PASSWORD = "ChangeMe123!";
const adminEmail = process.env.ADMIN_EMAIL ?? (nodeEnv === "production" ? undefined : DEV_ADMIN_EMAIL);
const adminPassword =
  process.env.ADMIN_PASSWORD ?? (nodeEnv === "production" ? undefined : DEV_ADMIN_PASSWORD);
const adminCredentialsAreDefaults =
  process.env.ADMIN_EMAIL === undefined && process.env.ADMIN_PASSWORD === undefined;
const cookieSecure =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === "true"
    : nodeEnv === "production";

if (nodeEnv === "production") {
  if (jwtSecret.length < 32 || jwtSecret === "replace-this-production-secret") {
    throw new Error("Production JWT_SECRET must be a unique secret of at least 32 characters");
  }
  if (adminPassword === "ChangeMe123!" || process.env.ADMIN_EMAIL === "admin@dsu.local") {
    throw new Error("The default development administrator credentials cannot be used in production");
  }
  if (process.env.ADMIN_REGISTRATION_KEY === "local-registration-key") {
    throw new Error("The default development administrator registration key cannot be used in production");
  }
  if (!cookieSecure) {
    throw new Error("COOKIE_SECURE must be true in production");
  }
  if (!corsPolicy.configured) {
    throw new Error(
      "CORS_ORIGIN must be set explicitly in production: comma-separated list of allowed origins"
    );
  }
  if (corsPolicy.allowAll) {
    throw new Error("CORS_ORIGIN=* is not allowed in production: list the allowed origins explicitly");
  }
}

// Разбор параметров БД происходит ПОСЛЕ dotenv.config(): так переменные из
// backend/.env видны и для DATABASE_URL, и для отдельных DB_* / PG*.
const database = resolveDatabaseConfig();

if (nodeEnv === "production" && database.sslMode === "disable" && database.isRemote) {
  // Не валим процесс: часть провайдеров работает и без TLS, но предупредить стоит.
  // eslint-disable-next-line no-console
  console.warn(
    `[dsu-debate-backend] WARNING: connecting to ${describeDatabaseConfig(database)} without TLS`
  );
}

export const env = {
  nodeEnv,
  port: parseInt(process.env.PORT ?? "4000", 10),
  database,
  databaseUrl: database.connectionString ?? "",
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "365d",
  corsOrigins: corsPolicy.origins,
  corsAllowAll: corsPolicy.allowAll,
  corsPolicy,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  cookieSecure,
  adminEmail,
  adminPassword,
  adminCredentialsAreDefaults,
  adminRegistrationKey: process.env.ADMIN_REGISTRATION_KEY,
  allowAdminRegistration: process.env.ALLOW_ADMIN_REGISTRATION === "true",
};
