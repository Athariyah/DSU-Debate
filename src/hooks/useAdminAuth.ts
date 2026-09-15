import { useEffect, useState } from "react";
import { apiFetch, ApiError, AUTH_TOKEN_EVENT, getAdminToken, setAdminToken } from "../api/httpClient";

/**
 * Живое состояние входа администратора.
 *
 * В отличие от простой проверки «есть ли токен в localStorage», хук:
 *  - проверяет токен на сервере при монтировании и сбрасывает его, если
 *    сервер ответил 401 (токен протух или подделан) — тогда кнопка «Создать»
 *    не показывает «авторизован» с мёртвым токеном и не гоняет пользователя
 *    по кругу «плюс → профиль»;
 *  - подписывается на AUTH_TOKEN_EVENT, чтобы вход/выход на вкладке
 *    «Профиль» мгновенно отражался в нижней панели.
 *
 * Ошибки сети (сервер выключен) токен НЕ сбрасывают — иначе можно потерять
 * валидную сессию из-за временного сбоя.
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
