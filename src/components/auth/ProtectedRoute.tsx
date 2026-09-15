import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch, isAuthError } from "../../api/httpClient";
import { AdminLoginForm } from "./AdminLoginForm";
import { Button } from "../ui/Button";

/**
 * Защищённый экран (администрирование, создание).
 *
 * Сессия проверяется на сервере один раз при входе (и по кнопке «Повторить»).
 * Результаты различаются честно:
 *  - 401          → форма входа прямо здесь, после входа экран открывается
 *                    на месте, без выкидывания на профиль;
 *  - ошибка сети  → сообщение «не удалось связаться с сервером» и повтор,
 *                    а НЕ форма входа и НЕ «сессия истекла»;
 *  - успех        → защищённый контент.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "authed" | "login" | "error">("checking");

  const check = useCallback(() => {
    setState("checking");
    apiFetch("/admin/auth/me", { auth: true })
      .then(() => setState("authed"))
      .catch((error: unknown) => setState(isAuthError(error) ? "login" : "error"));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state === "checking") {
    return <div className="grid h-full place-items-center text-sm text-white/50">Проверка доступа…</div>;
  }

  if (state === "authed") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-6">
        {state === "error" ? (
          <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-semibold text-white">Не удалось связаться с сервером</p>
            <p className="text-xs leading-relaxed text-white/45">
              Проверка сессии не прошла из-за проблемы с соединением — это не
              значит, что сессия истекла. Попробуйте ещё раз.
            </p>
            <Button variant="glass" fullWidth onClick={check}>
              <RefreshCw size={15} />
              Повторить
            </Button>
          </div>
        ) : (
          <AdminLoginForm
            title="Вход в панель администрирования"
            subtitle="Сессия ещё не начата или истекла (токен живёт 8 часов). Войдите — и панель откроется сразу, без перехода на профиль."
            onSuccess={() => setState("authed")}
          />
        )}
      </div>
    </div>
  );
}
