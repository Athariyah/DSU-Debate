/**
 * Хелперы для fetch-моков в тестах: понимают CDN-тоннель httpClient
 * (мутации уходят как GET с _method/_body в query, см. src/api/httpClient.ts).
 */

export interface WireRequest {
  /** Логический метод: _method из query для тоннеля, иначе init.method. */
  method: string;
  /** Логическое тело: _body из query для тоннеля, иначе init.body. */
  body: string;
  /** Полный URL как его увидел fetch. */
  url: string;
  /** Путь без query — удобно для ветвления моков по маршруту. */
  path: string;
}

export function wireRequest(
  input: RequestInfo | URL | unknown,
  init?: { method?: string; body?: unknown }
): WireRequest {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  const queryIndex = url.indexOf("?");
  const params = queryIndex === -1 ? null : new URLSearchParams(url.slice(queryIndex + 1));
  const tunneled = params?.get("_method") ?? null;
  const bodyInit = init?.body;
  return {
    method: tunneled ?? init?.method ?? "GET",
    body: tunneled ? (params?.get("_body") ?? "") : typeof bodyInit === "string" ? bodyInit : "",
    url,
    path: queryIndex === -1 ? url : url.slice(0, queryIndex),
  };
}
