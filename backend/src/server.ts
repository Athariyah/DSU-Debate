import http from "http";
import { createApp } from "./app";
import { initSocketServer } from "./sockets";
import { env } from "./config/env";
import { pool } from "./config/db";

async function bootstrap(): Promise<void> {
  // Проверяем соединение с БД перед стартом сервера, чтобы упасть быстро
  // и явно, если PostgreSQL недоступен, вместо тихих ошибок в рантайме.
  await pool.query("SELECT 1");

  const app = createApp();
  const httpServer = http.createServer(app);

  initSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[dsu-debate-backend] HTTP + Socket.io server listening on port ${env.port}`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start dsu-debate-backend:", error);
  process.exit(1);
});
