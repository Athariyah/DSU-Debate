import { apiFetch, getAdminToken, isAuthError, setAdminToken, setUnauthorizedHandler } from "./httpClient";

/**
 * Единый источник правды о входе администратора.
 *
 * Сессия держится на двух носителях: токен в localStorage/window-fallback
 * (уходит заголовком Authorization) и HttpOnly-cookie. Проверка /me
 * выполняется ВСЕГДА — даже без локального токена: если жива cookie, сервер
 * ответит 200 и сессия подхватится.
 *
 * ВАЖНО: всё состояние (статус, подписчики, флаг проверки) живёт на
 * globalThis, а не в переменных модуля. Автообновление встроенного превью
 * (HMR) может создать вторую копию модуля — тогда одна копия помнила бы
 * «авторизован», а другая «аноним», и пользователя «выкидывало» ровно в
 * момент моего следующего коммита. Общий объект на window делает копии
 * модуля согласованными.
 *
 *  - anonymous — входа нет, плюс скрыт;
 *  - checking  — идёт проверка /me при загрузке;
 *  - authed    — сервер подтвердил вход (токеном или cookie);
 *  - expired   — сервер ответил 401 на локальный токен: токен стёрт;
 *  - network   — до сервера не дошли: «Повторить», ничего не стираем.
 */
export type AuthStatus = "anonymous" | "checking" | "authed" | "expired" | "network";

interface StoreState {
  status: AuthStatus;
  verifyStarted: boolean;
  listeners: Array<() => void>;
}

const STATE_KEY = "__dsuAuthStore";

function state(): StoreState {
  const w = globalThis as typeof globalThis & { [STATE_KEY]?: StoreState };
  if (!w[STATE_KEY]) {
    w[STATE_KEY] = { status: "checking", verifyStarted: false, listeners: [] };
  }
  return w[STATE_KEY];
}

function emit(): void {
  for (const listener of [...state().listeners]) listener();
}

export function getAuthStatus(): AuthStatus {
  return state().status;
}

export function subscribeAuth(listener: () => void): () => void {
  const s = state();
  s.listeners.push(listener);
  if (s.status === "checking" && !s.verifyStarted) void verifySession();
  return () => {
    const st = state();
    st.listeners = st.listeners.filter((item) => item !== listener);
  };
}

/**
 * Пересчитать состояние и снять флаг «проверка запущена».
 * Используется только тестами для изоляции между кейсами.
 */
export function resetAuthStoreForTests(): void {
  const s = state();
  s.status = "checking";
  s.verifyStarted = false;
  emit();
}

/** Успешный вход: сервер уже подтвердил учетку — помечаем авторизованным. */
export function markAuthed(): void {
  state().status = "authed";
  emit();
}

/** Осознанный выход. */
export function markLoggedOut(): void {
  state().status = "anonymous";
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
    state().status = "expired";
    emit();
    return;
  }
  if (!tokenUsed && !current) {
    state().status = "anonymous";
    emit();
  }
});

/**
 * Одна проверка на сервере. Выполняется даже без локального токена: живую
 * cookie-сессию сервер увидит сам. Результат раскладывается по статусам.
 */
export function verifySession(): Promise<void> {
  const localToken = getAdminToken();
  const s = state();
  s.verifyStarted = true;
  s.status = "checking";
  emit();
  return apiFetch("/admin/auth/me", { auth: true })
    .then(() => {
      // Если пока летел запрос пользователь перелогинился — не трогаем.
      if (localToken && getAdminToken() !== localToken) return;
      state().status = "authed";
      emit();
    })
    .catch((error: unknown) => {
      if (!isAuthError(error)) {
        state().status = "network";
        emit();
        return;
      }
      const current = getAdminToken();
      if (localToken && current === localToken) {
        setAdminToken("");
        state().status = "expired";
      } else if (!current) {
        state().status = "anonymous";
      } else {
        // Сессия заменена свежим входом, пока летел запрос.
        state().status = "authed";
      }
      emit();
    });
}
