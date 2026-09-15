import { apiFetch, getAdminToken, isAuthError, setAdminToken } from "./httpClient";

/**
 * Единый источник правды о входе администратора.
 *
 * Раньше видимость кнопки «Создать» (наличие токена) и доступ (проверка на
 * сервере) жили отдельно, из-за чего плюс то мигал при загрузке, то висел при
 * «выкинутой» сессии. Теперь всё состояние — здесь:
 *
 *  - anonymous — входа нет, плюс скрыт;
 *  - checking  — токен найден при загрузке, идёт одна проверка /me;
 *  - authed    — администратор реально авторизован (вход или успешная
 *                проверка) — плюс виден, защищённые экраны открываются;
 *  - expired   — сервер ответил 401: токен стёрт, показываем форму входа;
 *  - network   — до сервера не дошли: предлагаем «Повторить», ничего не
 *                стираем и не рисуем «выкидывание».
 *
 * Проверка выполняется ОДИН раз при старте (и по «Повторить»); навигация по
 * защищённым экранам больше не дёргает /me, поэтому живой сессии невозможно
 * «вылететь» из-за случайного сбоя по пути.
 */
export type AuthStatus = "anonymous" | "checking" | "authed" | "expired" | "network";

let status: AuthStatus = getAdminToken() ? "checking" : "anonymous";
let verifyStarted = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function getAuthStatus(): AuthStatus {
  return status;
}

/**
 * Пересчитать состояние из хранилища и снять флаг «проверка запущена».
 * Используется только тестами для изоляции между кейсами (модуль — синглтон).
 */
export function resetAuthStoreForTests(): void {
  status = getAdminToken() ? "checking" : "anonymous";
  verifyStarted = false;
  emit();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  if (status === "checking" && !verifyStarted) void verifySession();
  return () => {
    listeners.delete(listener);
  };
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

/** Одна проверка токена на сервере; результат раскладывается по статусам. */
export function verifySession(): Promise<void> {
  if (!getAdminToken()) {
    status = "anonymous";
    emit();
    return Promise.resolve();
  }
  verifyStarted = true;
  status = "checking";
  emit();
  return apiFetch("/admin/auth/me", { auth: true })
    .then(() => {
      status = "authed";
      emit();
    })
    .catch((error: unknown) => {
      if (isAuthError(error)) {
        setAdminToken("");
        status = "expired";
      } else {
        status = "network";
      }
      emit();
    });
}
