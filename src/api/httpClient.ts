const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = (configuredApiUrl || "/api").replace(/\/$/, "");

const AUTH_TOKEN_KEY = "dsu_admin_jwt";

// Превью может открываться во встроенном фрейме стороннего сайта, где браузер
// блокирует localStorage. Тогда setItem бросает исключение, и токен живёт
// только в памяти. Держать его в переменной модуля НЕЛЬЗЯ: автообновление
// превью (HMR) создаёт вторую копию модуля со своей переменной — вход
// сохраняет токен в одну копию, а запросы уходят из другой, без токена
// («вошёл и сразу выкинуло»). Поэтому fallback живёт на window — он общий
// для всех копий модуля в пределах страницы.
const MEMORY_TOKEN_KEY = "__dsuAdminToken";

function memoryToken(): string | null {
  const w = globalThis as typeof globalThis & Record<string, string | undefined>;
  return w[MEMORY_TOKEN_KEY] ?? null;
}

export function getAdminToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? memoryToken();
  } catch {
    return memoryToken();
  }
}

export function setAdminToken(token: string) {
  const w = globalThis as typeof globalThis & Record<string, string | undefined>;
  if (token) {
    w[MEMORY_TOKEN_KEY] = token;
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // localStorage недоступен — остаётся общий fallback на window.
    }
  } else {
    delete w[MEMORY_TOKEN_KEY];
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

// Единая реакция на «сервер сказал, что токен мёртв» (401 на запросе с
// auth:true). Регистрируется стором сессии; передаём ТОКЕН, с которым ушёл
// запрос, чтобы стор не погасил свежую сессию из-за запоздалого ответа,
// отправленного ещё со старым токеном.
let unauthorizedHandler: ((tokenUsed: string | null) => void) | null = null;
export function setUnauthorizedHandler(handler: (tokenUsed: string | null) => void): void {
  unauthorizedHandler = handler;
}

// Методы, которые Yandex Cloud CDN режет с 405: наружу они уходят
// как GET с тоннелирующими query-параметрами (см. buildTunneledUrl).
// Backend (middleware/methodTunnel.ts) восстанавливает исходный метод,
// тело и токен раньше роутера.
const TUNNELED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Упаковывает мутирующий запрос в CDN-совместимый GET:
 *   POST /api/events/1/vote {participantId: 2}
 *     -> GET /api/events/1/vote?_method=POST&_body=%7B...%7D&_t=...
 * Существующая query-строка пути (например, ?auto=true) сохраняется.
 */
function buildTunneledUrl(baseUrl: string, method: string, body: unknown, token: string | null): string {
  const params = new URLSearchParams();
  params.set("_method", method);
  if (typeof body === "string" && body.length > 0) params.set("_body", body);
  // Токен дублируется в query: промежуточные слои могут вырезать заголовки.
  if (token) params.set("_token", token);
  // Таймстемп против кэширования мутаций на CDN/прокси.
  params.set("_t", String(Date.now()));
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}

// Диагностический маячок в журнал backend: помогает увидеть аномалии
// хранения токена глазами браузера, а не гадать по серверным 401.
// Идёт через общий apiFetch, поэтому за CDN тоже тоннелируется в GET.
function diag(payload: Record<string, unknown>): void {
  void apiFetch("/_diag", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth, headers, ...rest } = options;
  const token = auth ? getAdminToken() : null;

  let url = `${API_BASE_URL}${path}`;
  let method = (rest.method ?? "GET").toUpperCase();
  let body: BodyInit | null | undefined = rest.body as BodyInit | null | undefined;

  // Тоннелирование мутаций через GET: иначе CDN ответит 405.
  if (TUNNELED_METHODS.has(method)) {
    url = buildTunneledUrl(url, method, body, token);
    method = "GET";
    body = undefined;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      method,
      body: body ?? undefined,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // Токен дублируется в кастомный заголовок: проксирующие слои
        // встроенных превью могут вырезать Authorization/Cookie, а
        // X-Admin-Token проходит (backend принимает оба канала).
        ...(token
          ? { Authorization: `Bearer ${token}`, "X-Admin-Token": token }
          : {}),
        ...headers,
      },
    });
  } catch {
    // fetch падает сам, только если запрос не дошёл: сервер выключен, порт
    // занят другим приложением или адрес недоступен.
    throw new ApiError(
      `Не удалось связаться с API по адресу ${API_BASE_URL}. ` +
        "Проверьте, что backend запущен: в папке backend выполните npm run dev " +
        `(проверка: ${API_BASE_URL}/health/ready).`,
      0,
      "NETWORK_ERROR"
    );
  }

  if (!response.ok) {
    // 401 на запросе, который ушёл с токеном, — сервер считает этот токен
    // мёртвым. Сообщаем стору ТОЛЬКО про этот токен (см. authStore): если
    // пользователь уже перелогинился, запоздалый ответ не погасит новую сессию.
    if (response.status === 401 && auth) {
      unauthorizedHandler?.(token ?? null);
      if (!token) diag({ step: "auth-request-without-token", path });
    }
    let message = `Сервер вернул ошибку ${response.status}`;
    let code: string | undefined;
    let details: string | undefined;
    try {
      const body = await response.json();
      message = body?.message ?? message;
      code = typeof body?.code === "string" ? body.code : undefined;
      details = typeof body?.details === "string" ? body.details : undefined;
    } catch {
      // Ответ без JSON: так отвечает не наш API, а статический сервер или прокси.
      message =
        response.status === 500
          ? `Сервер вернул 500 без описания (${API_BASE_URL}). ` +
            "Если сайт открыт через Live Server, пересоберите фронтенд: npm run build:live " +
            "(сборка должна обращаться к backend напрямую)."
          : message;
    }
    throw new ApiError(details ? `${message} — ${details}` : message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      `Ответ сервера не является JSON (${API_BASE_URL}${path}). ` +
        "Проверьте, что запросы уходят на backend, а не на статический сервер.",
      response.status,
      "INVALID_RESPONSE"
    );
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

/** Токен отсутствует/протух/подделан — нужна форма входа. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Запрос вообще не дошёл до API (сервер выключен, обрыв сети). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.code === "NETWORK_ERROR");
}
