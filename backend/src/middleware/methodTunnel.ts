import { NextFunction, Request, Response } from "express";

/**
 * Совместимость с Yandex Cloud CDN (event.mountech.online).
 *
 * CDN пропускает наружу только GET и HEAD: методы POST/PUT/PATCH/DELETE
 * режутся с 405, а WebSocket (/socket.io) глушится целиком. Поэтому фронт
 * (см. src/api/httpClient.ts) отправляет все мутирующие запросы как GET
 * с тоннелирующими query-параметрами:
 *
 *   GET /api/events/1/vote?_method=POST&_body=%7B...%7D&_t=1726778123456
 *
 * Этот middleware восстанавливает исходный метод/тело/токен до того, как
 * запрос увидит роутер Express, — контроллеры (router.post/put/...) работают
 * в штатном режиме и не подозревают о тоннелировании.
 *
 * Параметры тоннеля:
 *   _method  исходный HTTP-метод (POST, PUT, PATCH, DELETE);
 *   _body    JSON-тело исходного запроса (URL-encoded);
 *   _token   админский JWT (дубль Authorization: Bearer — некоторые
 *            промежуточные прокси вырезают заголовки, а query доходит);
 *   _t       таймстемп против кэширования (игнорируется здесь).
 */

// Методы, которые фронт тоннелирует через GET.
const TUNNELED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Служебные параметры тоннеля — вычищаются из URL, чтобы не попадать
// в req.query контроллеров и (важно!) в логи вместе с токеном.
const TUNNEL_PARAMS = ["_method", "_body", "_token", "_t"];

export function methodTunnel(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== "GET") {
    next();
    return;
  }

  const queryIndex = req.url.indexOf("?");
  if (queryIndex === -1) {
    next();
    return;
  }

  // Парсим query вручную из req.url: это не зависит от настроек
  // query parser'а Express и одинаково работает в Express 4/5.
  const params = new URLSearchParams(req.url.slice(queryIndex + 1));
  const claimed = params.get("_method");
  if (!claimed) {
    next();
    return;
  }

  const restored = claimed.toUpperCase();
  if (!TUNNELED_METHODS.has(restored)) {
    next();
    return;
  }

  // Восстанавливаем исходный метод — роутер Express увидит уже его,
  // поэтому router.post/put/delete совпадут как обычно.
  req.method = restored;

  const rawBody = params.get("_body");
  if (rawBody !== null && rawBody !== "") {
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      req.body = {};
    }
  } else if (req.body === undefined) {
    req.body = {};
  }

  const token = params.get("_token");
  if (token !== null && token !== "") {
    req.headers.authorization = `Bearer ${token}`;
    req.headers["x-admin-token"] = token;
  }

  // Вычищаем служебные параметры: ниже по стеку запрос должен выглядеть
  // как обычный (например, ?auto=true у podium переживает чистку).
  // req.originalUrl тоже перезаписываем очищенным значением, чтобы токен
  // из _token не утёк в журналы и в тело 404-ответов.
  for (const name of TUNNEL_PARAMS) params.delete(name);
  const rest = params.toString();
  const cleanUrl = req.url.slice(0, queryIndex) + (rest ? `?${rest}` : "");
  req.url = cleanUrl;
  req.originalUrl = cleanUrl;

  next();
}

/**
 * Запрет кэширования API-ответов: живой результат голосования нельзя
 * отдавать из кэша CDN/прокси — каждый ответ только от backend.
 * Вешается раньше всех маршрутов, поэтому покрывает и ответы ошибок.
 */
export function noStoreCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}
