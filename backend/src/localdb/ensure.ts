/**
 * Хук для точки входа приложения: перед подключением к БД убеждаемся, что
 * встроенный PostgreSQL запущен (если приложение настроено на него), а при
 * завершении процесса — останавливаем его, но только если запускали мы сами.
 */
import { env } from "../config/env";
import {
  isLocalDatabaseManagedByThisProcess,
  startLocalDatabase,
  stopLocalDatabase,
} from "./manager";

export async function ensureLocalDatabase(): Promise<void> {
  if (!env.database.localEmbedded) return;
  await startLocalDatabase();
}

export async function shutdownLocalDatabase(): Promise<void> {
  if (!env.database.localEmbedded) return;
  if (!isLocalDatabaseManagedByThisProcess()) return;
  await stopLocalDatabase();
}
