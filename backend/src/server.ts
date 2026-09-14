import http from "http";
import { createApp } from "./app";
import { initSocketServer } from "./sockets";
import { env } from "./config/env";
import { describeCurrentCorsPolicy } from "./config/cors";
import { describeDatabaseConfig } from "./config/database";
import { pool, waitForDatabase } from "./config/db";
import { runMigrations } from "./db/migrate";
import { ensureSeedAdmin } from "./config/bootstrap";
import {
  ensureLocalDatabase,
  shutdownLocalDatabase,
  stopLocalDatabaseOnProcessExit,
} from "./localdb/ensure";
import { keepLocalDatabaseRunningOnExit } from "./localdb/manager";

async function bootstrap(): Promise<void> {
  // 1. Встроенная БД на этом компьютере: если внешняя не настроена,
  //    поднимаем локальный PostgreSQL (инициализируем кластер при первом
  //    запуске, стартуем сервер, создаём базу приложения).
  await ensureLocalDatabase();

  // 2. Проверяем соединение с БД до старта сервера, чтобы упасть быстро
  //    и явно, если PostgreSQL недоступен, вместо тихих ошибок в рантайме.
  //    Внешняя БД может принимать соединения не сразу — ждём её с повторами.
  // eslint-disable-next-line no-console
  console.log(`[dsu-debate-backend] database: ${describeDatabaseConfig(env.database)}`);
  await waitForDatabase();
  await runMigrations();
  await ensureSeedAdmin();

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[dsu-debate-backend] HTTP + Socket.io server listening on port ${env.port}`);
    // eslint-disable-next-line no-console
    console.log(`[dsu-debate-backend] API: http://127.0.0.1:${env.port}/api/health/ready`);
    // Политика источников печатается при старте: если сайт открыт «не с того»
    // адреса, здесь видно, почему запросы могут не проходить.
    // eslint-disable-next-line no-console
    console.log(`[dsu-debate-backend] CORS: ${describeCurrentCorsPolicy()}`);
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[dsu-debate-backend] получен ${signal}, завершаю работу...`);

    // SIGTERM прилетает от наблюдателя кода (ts-node-dev --respawn, nodemon)
    // при каждом сохранении файла. Гасить PostgreSQL в этом случае нельзя:
    // иначе БД перезапускается на каждую правку, а запросы в этот момент
    // падают с 500. Ctrl+C (SIGINT) — осознанное завершение, БД останавливаем.
    if (signal === "SIGTERM") keepLocalDatabaseRunningOnExit();

    const finish = async (): Promise<void> => {
      await pool.end().catch(() => undefined);
      // Встроенный PostgreSQL останавливаем только если запускали его мы:
      // данные при этом сохраняются в backend/.localdb.
      await shutdownLocalDatabase().catch(() => undefined);
      process.exit(0);
    };

    // Активным сокетам/запросам даём 5 секунд, затем выходим принудительно.
    const timer = setTimeout(() => void finish(), 5000);
    timer.unref();

    io.close();
    httpServer.close(() => void finish());
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // SIGHUP — закрытие окна терминала (Windows) / обрыв сессии: пробуем
  // успеть остановить БД, а на выходе есть ещё синхронный «последний шанс».
  process.on("SIGHUP", () => void shutdown("SIGHUP"));
  process.on("exit", () => stopLocalDatabaseOnProcessExit());
}bootstrap().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start dsu-debate-backend:", error);
  // Если успели поднять встроенный PostgreSQL — не оставляем процесс висеть.
  await shutdownLocalDatabase().catch(() => undefined);
  process.exit(1);
});
