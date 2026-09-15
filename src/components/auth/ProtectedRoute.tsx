import type { ReactNode } from "react";
import { RefreshCw, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { verifySession } from "../../api/authStore";
import { useAuthStatus } from "../../hooks/useAdminAuth";
import { Button } from "../ui/Button";

/**
 * Защищённый экран (администрирование, создание).
 *
 * Решение о доступе берётся из единого стора сессии: authed означает, что
 * сервер УЖЕ подтвердил вход (при логине во вкладке «Профиль» или стартовой
 * проверке токена), поэтому навигация не дёргает /me заново и живую сессию
 * нельзя «выкинуть» случайным сбоем.
 *
 * Формы входа здесь намеренно НЕТ — вход администратора живёт только во
 * вкладке «Профиль». Без сессии экран объясняет это и предлагает открыть
 * профиль, без всяких редиректов и окон.
 *
 *  - checking → «Проверка доступа…»;
 *  - network  → «Не удалось связаться с сервером» + «Повторить»
 *               (это НЕ «выкидывание»);
 *  - anonymous/expired → подсказка «только для администраторов» и кнопка
 *               в профиль.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const navigate = useNavigate();

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
          <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
            <p className="text-sm font-semibold text-white">Раздел доступен только администраторам</p>
            <p className="text-xs leading-relaxed text-white/45">
              {status === "expired"
                ? "Сохранённая сессия истекла. "
                : ""}
              Войдите как администратор во вкладке «Профиль» — после входа
              кнопка «Создать» и этот экран станут доступны.
            </p>
            <Button variant="glass" fullWidth onClick={() => navigate("/profile")}>
              <UserRound size={15} />
              Открыть профиль
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
