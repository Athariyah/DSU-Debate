import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { corsGuard, isOriginAllowed } from "./config/cors";
import { pool } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import adminAuthRoutes from "./routes/admin.auth.routes";
import adminEventsRoutes from "./routes/admin.events.routes";
import adminParticipantsRoutes from "./routes/admin.participants.routes";
import publicEventsRoutes from "./routes/public.events.routes";

// Лимиты считаются по IP. В production за Caddy (TRUST_PROXY=1) каждый
// посетитель виден со своего адреса, поэтому жёсткие пороги безопасны.
// В разработке и в песочницах все запросы приходят с одного адреса прокси
// (127.0.0.1) — общий жёсткий лимит там блокирует всех сразу (в том числе
// вход администратора), поэтому вне production пороги расширены.
const isProduction = process.env.NODE_ENV === "production";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 20 : 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Слишком много попыток авторизации. Повторите позже.",
  },
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isProduction ? 600 : 10000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export function createApp(): Application {
  const app = express();
  app.set("trust proxy", env.trustProxy);

  app.use(helmet());
  app.use(corsGuard());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", apiRateLimit);

  app.get("/api/health/live", (_req, res) => {
    res.status(200).json({ status: "ok", service: "dsu-debate-backend" });
  });

  app.get("/api/health/ready", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ready", database: "ok" });
    } catch (error) {
      next(error);
    }
  });

  // Backwards-compatible health endpoint.
  app.get("/api/health", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ok", service: "dsu-debate-backend", database: "ok" });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/admin/auth", authRateLimit, adminAuthRoutes);
  app.use("/api/admin/events", adminEventsRoutes);
  app.use("/api/admin/participants", adminParticipantsRoutes);
  app.use("/api/events", publicEventsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
