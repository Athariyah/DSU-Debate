import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { isConnectionError } from "../config/db";
import { recoverLocalDatabaseIfNeeded } from "../localdb/ensure";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  // Если упало соединение с встроенной БД (например, её процесс был убит или
  // машина выходила из сна) — запускаем её восстановление в фоне, чтобы
  // следующий запрос уже сработал.
  if (isConnectionError(err)) {
    recoverLocalDatabaseIfNeeded(err instanceof Error ? err.message : String(err));
  }

  const details = err instanceof Error ? err.message : undefined;

  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Внутренняя ошибка сервера",
    // Причина видна только в режиме разработки: по ней удобно понять, что
    // именно не так (нет таблиц, БД не запущена, недоступен внешний сервер),
    // и при этом не светить детали в production.
    ...(env.nodeEnv === "production" || !details ? {} : { details }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: `Маршрут ${req.method} ${req.originalUrl} не найден`,
  });
}
