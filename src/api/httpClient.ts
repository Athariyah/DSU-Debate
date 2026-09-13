export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

const AUTH_TOKEN_KEY = "dsu_admin_jwt";

export function getAdminToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

/**
 * Тонкая обёртка над fetch под REST API Express-бэкенда.
 * JWT (если есть) прокидывается в заголовке Authorization для
 * защищённых admin-маршрутов (см. src/middleware на бэкенде).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth, headers, ...rest } = options;
  const token = auth ? getAdminToken() : null;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message ?? message;
    } catch {
      /* noop */
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}
