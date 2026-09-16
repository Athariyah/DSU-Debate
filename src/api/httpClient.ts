const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = (configuredApiUrl || "/api").replace(/\/$/, "");

const AUTH_TOKEN_KEY = "dsu_admin_jwt";

// Превью может открываться во встроенном фрейме стороннего сайта, где браузер
// блокирует localStorage (Safari ITP, жёсткие настройки приватности). Тогда
// setItem бросает исключение, токен не сохраняется и каждый запрос уходит
// без Authorization — пользователь застревает в цикле «плюс → профиль».
// Держим fallback в памяти модуля: сессия живёт хотя бы в пределах страницы.
let memoryToken: string | null = null;

export function getAdminToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setAdminToken(token: string) {
  if (token) {
    memoryToken = token;
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // localStorage недоступен — остаётся memoryToken.
    }
  } else {
    memoryToken = null;
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

// Диагностический маячок в журнал backend: помогает увидеть аномалии
// хранения токена глазами браузера, а не гадать по серверным 401.
function diag(payload: Record<string, unknown>): void {
  void fetch(`${API_BASE_URL}/_diag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth, headers, ...rest } = options;
  const token = auth ? getAdminToken() : null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
