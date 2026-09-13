import { Pool, PoolClient } from "pg";
import { env } from "./env";

/**
 * Единый пул соединений с PostgreSQL для всего приложения.
 * Пул переиспользуется во всех контроллерах — не создаём новые
 * подключения на каждый запрос.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  // Ошибки на уже выданных (idle) клиентах пула — не должны валить процесс.
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle PostgreSQL client", err);
});

/**
 * Вспомогательная обёртка для выполнения операции в рамках транзакции.
 * Гарантированно делает COMMIT при успехе и ROLLBACK при любой ошибке,
 * а также освобождает клиента обратно в пул в блоке finally.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
