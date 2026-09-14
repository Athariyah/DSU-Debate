/**
 * Хук для точки входа приложения: перед подключением к БД убеждаемся, что
 * встроенный PostgreSQL запущен (если приложение настроено на него), а при
 * завершении — останавливаем его, но только если запускали мы сами и процесс
 * завершается осознанно (Ctrl+C). Перезапуск код-наблюдателем (ts-node-dev,
 * nodemon) БД не гасит: сайт не должен падать при каждом сохранении файла.
 */
import { env } from "../config/env";
import {
  recoverLocalDatabase,
  shouldStopLocalDatabaseOnExit,
  startLocalDatabase,
  stopLocalDatabase,
  stopLocalDatabaseSync,
} from "./manager";

export async function ensureLocalDatabase(): Promise<void> {
  if (!env.database.localEmbedded) return;
  await startLocalDatabase();
}

export async function shutdownLocalDatabase(): Promise<void> {
  if (!env.database.localEmbedded) return;
  if (!shouldStopLocalDatabaseOnExit()) return;
  await stopLocalDatabase();
}

/** Фоновое восстановление БД после ошибки соединения (см. manager.ts). */
export function recoverLocalDatabaseIfNeeded(reason: string): void {
  if (!env.database.localEmbedded) return;
  void recoverLocalDatabase(reason);
}

/**
 * Последний шанс остановить локальную БД — синхронно, из `process.on("exit")`.
 * Нужен, когда процесс завершают не Ctrl+C: например, на Windows закрыто окно
 * терминала (SIGHUP) или процесс убит снаружи.
 */
export function stopLocalDatabaseOnProcessExit(): void {
  if (!env.database.localEmbedded) return;
  stopLocalDatabaseSync();
}
