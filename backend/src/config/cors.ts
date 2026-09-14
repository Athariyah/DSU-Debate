/**
 * Применение политики источников к запросам: REST-API (app.ts) и Socket.io
 * (sockets/index.ts) используют одни и те же правила (config/corsPolicy.ts).
 */
import type { RequestHandler } from "express";
import { env } from "./env";
import { describeCorsPolicy, isOriginAllowed as isAllowedByPolicy } from "./corsPolicy";

/** Разрешён ли запрос с таким Origin (по текущим настройкам приложения). */
export function isOriginAllowed(origin?: string | null): boolean {
  return isAllowedByPolicy(origin, env.corsPolicy);
}

/** Читаемое описание текущей политики — для логов и текста отказа. */
export function describeCurrentCorsPolicy(): string {
  return describeCorsPolicy(env.corsPolicy, env.nodeEnv);
}

/**
 * Отказывает запросам с неразрешённым источником ДО cors-миддлвари, чтобы
 * вместо невнятной 500 «Внутренняя ошибка сервера» клиент получил понятный
 * 403 с подсказкой. Источник печатается и в лог backend: когда запрос идёт
 * через прокси (Vite, Live Server), тело ответа в браузере не всегда видно,
 * а в терминале подсказка есть всегда.
 */
export function corsGuard(): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin)) {
      next();
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(
      `[cors] отклонён запрос с источником ${origin} (${req.method} ${req.originalUrl}).\n` +
        `  → ${describeCurrentCorsPolicy()}.\n` +
        "  → Чтобы разрешить: добавьте этот источник в CORS_ORIGIN (backend/.env) " +
        "или задайте CORS_ORIGIN=*"
    );

    res.status(403).json({
      success: false,
      code: "CORS_ORIGIN_NOT_ALLOWED",
      message:
        `Источник ${origin} не разрешён. Добавьте его в CORS_ORIGIN (backend/.env) ` +
        "или задайте CORS_ORIGIN=* — в режиме разработки произвольные источники разрешены по умолчанию.",
      details: describeCurrentCorsPolicy(),
    });
  };
}

/**
 * Проверка источника для Socket.io: опции `cors` управляют только заголовками
 * HTTP-поллинга, а WebSocket-соединения фильтруются через `allowRequest`.
 */
export function isSocketOriginAllowed(
  req: { headers: Record<string, string | string[] | undefined> },
  callback: (error: string | null | undefined, success: boolean) => void
): void {
  const raw = req.headers.origin;
  const origin = Array.isArray(raw) ? raw[0] : raw;

  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[cors] отклонено WebSocket-подключение с источником ${origin}.\n` +
      `  → ${describeCurrentCorsPolicy()}.`
  );
  callback("origin_not_allowed", false);
}
