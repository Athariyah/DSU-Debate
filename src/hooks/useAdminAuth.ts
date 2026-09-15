import { useEffect, useState } from "react";
import { AUTH_TOKEN_EVENT, getAdminToken } from "../api/httpClient";

/**
 * Синхронное состояние входа администратора: токен лежит в localStorage
 * (или в memory-fallback, если хранилище заблокировано браузером).
 *
 * Хук НЕ обращается к серверу и НИКОГДА сам не сбрасывает токен: любая
 * фоновая «валидация» приводила к тому, что кнопка «Создать» исчезала, а
 * пользователя выкидывало с профиля посреди сессии. Настоящая проверка
 * токена происходит там, где она обязательна, — в ProtectedRoute при входе
 * на /admin: мёртвый токен просто отправляет на форму входа с редиректом
 * обратно, а живая сессия проходит без единого лишнего запроса.
 *
 * Подписка на AUTH_TOKEN_EVENT синхронизирует нижнюю панель и профиль:
 * вход/выход мгновенно показывает/прячет кнопку «Создать».
 */
export function useAdminAuth(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getAdminToken()));

  useEffect(() => {
    const sync = () => setIsAdmin(Boolean(getAdminToken()));
    window.addEventListener(AUTH_TOKEN_EVENT, sync);
    return () => window.removeEventListener(AUTH_TOKEN_EVENT, sync);
  }, []);

  return isAdmin;
}
