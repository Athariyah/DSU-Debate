/**
 * Политика источников (CORS) без обращения к переменным окружения — чистые
 * функции, которые удобно покрывать тестами. Применение политики к запросам —
 * в config/cors.ts, значения из env — в config/env.ts.
 *
 * Правила:
 *   - `CORS_ORIGIN` не задан и NODE_ENV != production — разрешены любые
 *     источники (локальный хостинг: Live Server, локальный IP, туннели, превью);
 *   - `CORS_ORIGIN=*` — любые источники (в production запрещено, см. env.ts);
 *   - `CORS_ORIGIN` задан списком — строго только эти источники;
 *   - запрос без заголовка Origin (curl, серверные вызовы, same-origin GET) —
 *     разрешён всегда.
 */

/** Справка: типичные локальные источники (используется при отсутствии CORS_ORIGIN). */
export const DEFAULT_CORS_ORIGINS: string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:5502",
  "http://127.0.0.1:5502",
  "http://localhost:5503",
  "http://127.0.0.1:5503",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export interface CorsPolicy {
  /** Явный список источников (при `allowAll` — только справочная информация). */
  origins: string[];
  /** Разрешить любой источник. */
  allowAll: boolean;
  /** Была ли переменная CORS_ORIGIN задана явно. */
  configured: boolean;
}

/** Разбирает список источников из строки вида `http://a, http://b`. */
export function parseOriginList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Собирает итоговую политику по режиму работы и значению CORS_ORIGIN. */
export function resolveCorsPolicy(nodeEnv: string | undefined, rawOriginEnv: string | undefined): CorsPolicy {
  const raw = rawOriginEnv?.trim();
  const configured = Boolean(raw);

  if (!configured) {
    return {
      origins: [...DEFAULT_CORS_ORIGINS],
      // В production «разрешить всё по умолчанию» недопустимо: env.ts требует
      // явный список и падает при старте, если его нет.
      allowAll: nodeEnv !== "production",
      configured: false,
    };
  }

  const origins = parseOriginList(raw);
  return { origins, allowAll: origins.includes("*"), configured: true };
}

/** Разрешён ли запрос с таким Origin. */
export function isOriginAllowed(origin: string | null | undefined, policy: CorsPolicy): boolean {
  if (!origin) return true;
  if (policy.allowAll) return true;
  return policy.origins.includes(origin);
}

/** Описание политики для логов и текста ошибки. */
export function describeCorsPolicy(policy: CorsPolicy, nodeEnv: string | undefined): string {
  if (policy.allowAll) {
    return nodeEnv === "production"
      ? "разрешены любые источники (CORS_ORIGIN=*)"
      : "разрешены любые источники (значение по умолчанию для локального хостинга)";
  }
  return `разрешены источники: ${policy.origins.join(", ")}`;
}
