import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "../../api/httpClient";
import { AdminLoginForm } from "./AdminLoginForm";

/**
 * Защищённый экран (администрирование).
 *
 * Сессия проверяется на сервере один раз при входе. Если токен отсутствует
 * или протух, пользователь НЕ выкидывается на профиль: форма входа
 * отображается прямо здесь, и после успешного входа защищённый экран
 * открывается на месте. Кнопка «Создать» поэтому всегда приводит на вкладку
 * администрирования — при необходимости с логином по пути.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "authed" | "login">("checking");

  useEffect(() => {
    let mounted = true;
    apiFetch("/admin/auth/me", { auth: true })
      .then(() => {
        if (mounted) setState("authed");
      })
      .catch(() => {
        if (mounted) setState("login");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (state === "checking") {
    return <div className="grid h-full place-items-center text-sm text-white/50">Проверка доступа…</div>;
  }

  if (state === "authed") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-6">
        <AdminLoginForm
          title="Вход в панель администрирования"
          subtitle="Сессия ещё не начата или истекла (токен живёт 8 часов). Войдите — и панель откроется сразу, без перехода на профиль."
          onSuccess={() => setState("authed")}
        />
      </div>
    </div>
  );
}
