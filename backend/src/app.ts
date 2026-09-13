import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import adminAuthRoutes from "./routes/admin.auth.routes";
import adminEventsRoutes from "./routes/admin.events.routes";
import adminParticipantsRoutes from "./routes/admin.participants.routes";
import publicEventsRoutes from "./routes/public.events.routes";

export function createApp(): Application {
  const app = express();

  // Приложение работает за обратным прокси (nginx / облачный LB) в проде,
  // поэтому доверяем заголовку X-Forwarded-For для корректного req.ip —
  // это критично для anti-fraud проверки по IP в контроллере голосования.
  app.set("trust proxy", true);

  app.use(helmet());
  app.use(
    cors({
      // `true` reflects the requesting origin, which keeps local development
      // usable while still allowing an explicit production allow-list.
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "dsu-debate-backend" });
  });

  // Администратор: аутентификация и CRUD
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/events", adminEventsRoutes);
  app.use("/api/admin/participants", adminParticipantsRoutes);

  // Публичные эндпоинты зрителя (анонимное голосование)
  app.use("/api/events", publicEventsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
