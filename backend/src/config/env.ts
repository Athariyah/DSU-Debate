import dotenv from "dotenv";

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

if (nodeEnv === "production") {
  if (jwtSecret.length < 32 || jwtSecret === "replace-this-production-secret") {
    throw new Error("Production JWT_SECRET must be a unique secret of at least 32 characters");
  }
  if (adminPassword === "ChangeMe123!") {
    throw new Error("The default development administrator password cannot be used in production");
  }
  if (corsOrigins.includes("*")) {
    throw new Error("CORS_ORIGIN must be explicit in production");
  }
}

export const env = {
  nodeEnv,
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  cookieSecure: process.env.COOKIE_SECURE === "true" || nodeEnv === "production",
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword,
  adminRegistrationKey: process.env.ADMIN_REGISTRATION_KEY,
  allowAdminRegistration: process.env.ALLOW_ADMIN_REGISTRATION === "true",
};
