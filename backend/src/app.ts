import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { corsGuard, isOriginAllowed } from "./config/cors";
import { pool } from "./config/db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { methodTunnel, noStoreCache } from "./middleware/methodTunnel";
import adminAuthRoutes from "./routes/admin.auth.routes";
import adminEventsRoutes from "./routes/admin.events.routes";
import adminParticipantsRoutes from "./routes/admin.participants.routes";
import adminMatchesRoutes from "./routes/admin.matches.routes";
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

  // CDN/прокси никогда не кэшируют API: голосование всегда живое.
  app.use(noStoreCache);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  // Сжатие ответов — экономим трафик (важно для мобильных устройств и больших трансляций)
  app.use(compression({ level: 6, threshold: 512 }));
  app.use(corsGuard());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  // Тоннелирование мутаций через GET для Yandex Cloud CDN (см. middleware):
  // восстанавливает исходный метод/тело/токен раньше роутера и лимитеров.
  app.use(methodTunnel);
  app.use("/api", apiRateLimit);
  // Эхо auth-каналов: клиент спрашивает «что ты увидел в моём запросе?» —
  // так из логов видно, режет ли промежуточный прокси Authorization/Cookie.
  app.get("/api/_echo-auth", (req, res) => {
    res.json({
      bearer: Boolean(req.headers.authorization?.startsWith("Bearer ")),
      custom: Boolean(req.headers["x-admin-token"]),
      cookie: Boolean((req.headers.cookie ?? "").includes("dsu_admin_token=")),
    });
  });
  // Клиентский диагностический «маячок»: фронтенд рассказывает, что
  // произошло с токеном после входа — журнал виден в логах backend.
  app.post("/api/_diag", (req, res) => {
    console.log(`[diag] ${JSON.stringify(req.body ?? {})}`);
    res.status(204).end();
  });
  // Диагностический журнал admin-запросов: метод, путь, статус, время.
  // Помогает точно видеть, доходят ли запросы браузера и чем отвечают.
  app.use("/api/admin", (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
      );
    });
    next();
  });

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

  // Явная обработка HEAD для хелсчеков CDN: 200 OK без тела, с той же
  // семантикой готовности, что и GET-версии выше (ready/health проверяют БД).
  app.head("/api/health/live", (_req, res) => {
    res.status(200).end();
  });

  app.head("/api/health/ready", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).end();
    } catch (error) {
      next(error);
    }
  });

  app.head("/api/health", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).end();
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/admin/auth", authRateLimit, adminAuthRoutes);
  app.use("/api/admin/events", adminEventsRoutes);
  app.use("/api/admin/participants", adminParticipantsRoutes);
  app.use("/api/admin", adminMatchesRoutes);
  app.use("/api/events", publicEventsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
