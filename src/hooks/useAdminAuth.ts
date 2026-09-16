import { useSyncExternalStore } from "react";
import { getAuthStatus, subscribeAuth, type AuthStatus } from "../api/authStore";

/** Полное состояние сессии администратора (единый стор, без миганий). */
export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(subscribeAuth, getAuthStatus);
}

/**
 * Авторизован ли администратор. Кнопка «Создать» видна ТОЛЬКО в состоянии
 * authed — т.е. после реального входа или успешной стартовой проверки токена.
 */
export function useAdminAuth(): boolean {
  return useAuthStatus() === "authed";
}
