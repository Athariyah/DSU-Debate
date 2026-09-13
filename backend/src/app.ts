import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { pool } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import adminAuthRoutes from "./routes/admin.auth.routes";
import adminEventsRoutes from "./routes/admin.events.routes";
import adminParticipantsRoutes from "./routes/admin.participants.routes";
import publicEventsRoutes from "./routes/public.events.routes";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
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
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export function createApp(): Application {
  const app = express();
  app.set("trust proxy", env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed by CORS"));
      },
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
