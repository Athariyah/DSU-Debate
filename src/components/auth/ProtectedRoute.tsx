import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { verifySession } from "../../api/authStore";
import { useAuthStatus } from "../../hooks/useAdminAuth";
import { AdminLoginForm } from "./AdminLoginForm";
import { Button } from "../ui/Button";

/**
 * Защищённый экран (администрирование, создание).
 *
 * Решение о доступе берётся из единого стора сессии: состояние authed
 * означает, что сервер УЖЕ подтвердил вход (при логине или стартовой
 * проверке), поэтому навигация не дёргает /me заново и живую сессию
 * невозможно «выкинуть» случайным сбоем по пути.
 *
 *  - checking → «Проверка доступа…»;
 *  - network  → «Не удалось связаться с сервером» + «Повторить»
 *               (это НЕ «выкидывание» и НЕ форма входа);
 *  - anonymous/expired → форма входа прямо здесь, после входа экран
 *               открывается на месте.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStatus();

  if (status === "authed") {
    return <>{children}</>;
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

        {(status === "anonymous" || status === "expired") && (
          <AdminLoginForm
            title="Вход в панель администрирования"
            subtitle="Войдите, чтобы открыть панель — после входа она появится сразу, без перехода на профиль."
          />
        )}
      </div>
    </div>
  );
}
