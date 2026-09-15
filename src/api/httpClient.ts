const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = (configuredApiUrl || "/api").replace(/\/$/, "");

const AUTH_TOKEN_KEY = "dsu_admin_jwt";
export const AUTH_TOKEN_EVENT = "dsu-admin-token-changed";

export function getAdminToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
  // Сообщаем всем подписчикам (нижняя панель, профиль), что состояние входа
  // изменилось — кнопка «Создать» появляется/исчезает без перезагрузки.
  window.dispatchEvent(new Event(AUTH_TOKEN_EVENT));
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
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
