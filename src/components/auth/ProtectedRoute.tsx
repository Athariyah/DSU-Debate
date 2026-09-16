import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { verifySession } from "../../api/authStore";
import { useAuthStatus } from "../../hooks/useAdminAuth";
import { Button } from "../ui/Button";

/**
 * Защищённый экран (администрирование, создание).
 *
 * Решение о доступе берётся из единого стора сессии: authed означает, что
 * сервер УЖЕ подтвердил вход, поэтому навигация не дёргает /me заново и
 * живую сессию нельзя «выкинуть» случайным сбоем.
 *
 * На самих защищённых экранах нет ни форм, ни плашек «доступ только для
 * администраторов» — админ видит только рабочий экран. Если сессии нет,
 * экран тихо передаёт эстафету профилю (единственному месту входа) с
 * адресом возврата: после входа пользователь попадает обратно сюда.
 *
 *  - checking → «Проверка доступа…»;
 *  - network  → «Не удалось связаться с сервером» + «Повторить»
 *               (это НЕ «выкидывание»);
 *  - anonymous/expired → Navigate на /profile?redirect=…
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const location = useLocation();

  if (status === "authed") {
    return <>{children}</>;
  }

  if (status === "anonymous" || status === "expired") {
    return <Navigate to={`/profile?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-6">
        {status === "checking" && (
          <div className="grid place-items-center py-10 text-sm text-white/50">Проверка доступа…</div>
        )}

        {status === "network" && (
          <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-semibold text-white">Не удалось связаться с сервером</p>
            <p className="text-xs leading-relaxed text-white/45">
              Проверка сессии не прошла из-за проблемы с соединением — это не
              значит, что сессия истекла. Попробуйте ещё раз.
            </p>
            <Button variant="glass" fullWidth onClick={() => void verifySession()}>
              <RefreshCw size={15} />
              Повторить
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
