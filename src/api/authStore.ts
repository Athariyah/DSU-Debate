import { apiFetch, getAdminToken, isAuthError, setAdminToken, setUnauthorizedHandler } from "./httpClient";

/**
 * Единый источник правды о входе администратора.
 *
 * Сессия держится на двух носителях: токен в localStorage/памяти (уходит
 * заголовком Authorization) и HttpOnly-cookie (переживает перезагрузки и
 * перемонтирования встроенного превью, где localStorage может быть
 * недоступен). Поэтому проверка /me выполняется ВСЕГДА — даже без локального
 * токена: если жива cookie, сервер ответит 200 и сессия подхватится.
 *
 *  - anonymous — входа нет, плюс скрыт;
 *  - checking  — идёт проверка /me при загрузке;
 *  - authed    — сервер подтвердил вход (токеном или cookie);
 *  - expired   — сервер ответил 401 на локальный токен: токен стёрт;
 *  - network   — до сервера не дошли: «Повторить», ничего не стираем.
 *
 * Навигация по защищённым экранам не дёргает /me заново, живую сессию
 * нельзя «выкинуть» случайным сбоем; 401 обрабатывается токен-зависимо
 * (запоздалый ответ со старым токеном не гасит свежую сессию).
 */
export type AuthStatus = "anonymous" | "checking" | "authed" | "expired" | "network";

let status: AuthStatus = "checking";
let verifyStarted = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function getAuthStatus(): AuthStatus {
  return status;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  if (status === "checking" && !verifyStarted) void verifySession();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Пересчитать состояние и снять флаг «проверка запущена».
 * Используется только тестами для изоляции между кейсами (модуль — синглтон).
 */
export function resetAuthStoreForTests(): void {
  status = "checking";
  verifyStarted = false;
  emit();
}

/** Успешный вход: сервер уже подтвердил учетку — помечаем авторизованным. */
export function markAuthed(): void {
  status = "authed";
  emit();
}

/** Осознанный выход. */
export function markLoggedOut(): void {
  status = "anonymous";
  emit();
}

/**
 * 401 на запросе с токеном гасит сессию, ТОЛЬКО если отвергнутый токен всё
 * ещё текущий. 401 на запросе без локального токена (cookie-сессия умерла)
 * возвращает anonymous. Запоздалые ответы со старыми токенами игнорируются.
 */
setUnauthorizedHandler((tokenUsed) => {
  const current = getAdminToken();
  if (tokenUsed && current === tokenUsed) {
    setAdminToken("");
    status = "expired";
    emit();
    return;
  }
  if (!tokenUsed && !current) {
    status = "anonymous";
    emit();
  }
});

/**
 * Одна проверка на сервере. Выполняется даже без локального токена: живую
 * cookie-сессию сервер увидит сам. Результат раскладывается по статусам.
 */
export function verifySession(): Promise<void> {
  const localToken = getAdminToken();
  verifyStarted = true;
  status = "checking";
  emit();
  return apiFetch("/admin/auth/me", { auth: true })
    .then(() => {
      // Если пока летел запрос пользователь перелогинился — не трогаем.
      if (localToken && getAdminToken() !== localToken) return;
      status = "authed";
      emit();
    })
    .catch((error: unknown) => {
      if (!isAuthError(error)) {
        status = "network";
        emit();
        return;
      }
      const current = getAdminToken();
      if (localToken && current === localToken) {
        setAdminToken("");
        status = "expired";
      } else if (!current) {
        status = "anonymous";
      } else {
        // Сессия заменена свежим входом, пока летел запрос.
        status = "authed";
      }
      emit();
    });
}
