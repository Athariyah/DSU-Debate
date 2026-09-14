import dotenv from "dotenv";
import { describeDatabaseConfig, resolveDatabaseConfig } from "./database";

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
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const jwtSecret = required(
  "JWT_SECRET",
  nodeEnv === "production" ? undefined : "dev-only-secret"
);
const adminPassword = process.env.ADMIN_PASSWORD;
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
  if (corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGIN must be explicit in production");
  }
}

// Разбор параметров БД происходит ПОСЛЕ dotenv.config(): так переменные из
// backend/.env видны и для DATABASE_URL, и для отдельных DB_* / PG*.
const database = resolveDatabaseConfig();

if (nodeEnv === "production" && database.sslMode === "disable" && database.isRemote) {
  // Не валим процесс: часть облачных провайдеров (внутренние домена Amvera)
  // работает и без TLS, но предупредить стоит.
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
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  cookieSecure,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword,
  adminRegistrationKey: process.env.ADMIN_REGISTRATION_KEY,
  allowAdminRegistration: process.env.ALLOW_ADMIN_REGISTRATION === "true",
};
