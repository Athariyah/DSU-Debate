import { useEffect, useState } from "react";
import { apiFetch, ApiError, AUTH_TOKEN_EVENT, getAdminToken, setAdminToken } from "../api/httpClient";

/**
 * Живое состояние входа администратора для нижней панели и профиля.
 *
 * - видимость кнопки «Создать» стартует синхронно по наличию токена;
 * - при монтировании токен один раз проверяется на сервере: если сервер
 *   ответил 401 (сессия истекла — токен живёт 8 часов), токен стирается,
 *   кнопка прячется, а профиль показывает понятное «Сессия истекла —
 *   войдите заново» и форму входа. Никакого молчаливого «авторизован» с
 *   мёртвым JWT и никакой висящей кнопки без входа;
 * - ошибки сети токен НЕ стирают, чтобы не терять живую сессию из-за
 *   временного сбоя;
 * - подписка на AUTH_TOKEN_EVENT: вход/выход в «Профиле» мгновенно
 *   показывает/прячет кнопку без перезагрузки.
 */
export function useAdminAuth(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getAdminToken()));

  useEffect(() => {
    const sync = () => setIsAdmin(Boolean(getAdminToken()));
    window.addEventListener(AUTH_TOKEN_EVENT, sync);
    return () => window.removeEventListener(AUTH_TOKEN_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!getAdminToken()) return;
    let mounted = true;
    apiFetch("/admin/auth/me", { auth: true }).catch((error: unknown) => {
      if (mounted && error instanceof ApiError && error.status === 401) {
        setAdminToken("");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return isAdmin;
}
