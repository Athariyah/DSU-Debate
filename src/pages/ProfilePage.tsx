import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, LogOut, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { Button } from "../components/ui/Button";
import { getSavedProfileName } from "../utils/votedStore";
import { getDeviceFingerprint } from "../utils/device";
import { getAdminToken, setAdminToken } from "../api/httpClient";
import { markLoggedOut, verifySession } from "../api/authStore";
import { logoutAdmin } from "../api/debates";
import { useAuthStatus } from "../hooks/useAdminAuth";
import { AdminLoginForm } from "../components/auth/AdminLoginForm";

export function ProfilePage() {
  const profile = getSavedProfileName();
  const fingerprint = getDeviceFingerprint();
  const [token, setToken] = useState(getAdminToken() ?? "");
  const [saved, setSaved] = useState(false);
  const status = useAuthStatus();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Защищённые экраны без сессии передают эстафету сюда с ?redirect=… —
  // после входа возвращаем пользователя туда, куда он шёл.
  const redirect = searchParams.get("redirect");
  function handleLoggedIn() {
    setToken(getAdminToken() ?? "");
    if (redirect && redirect.startsWith("/")) navigate(redirect);
  }

  async function logout() {
    try {
      await logoutAdmin();
    } finally {
      setAdminToken("");
      markLoggedOut();
      setToken("");
    }
  }

  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : "Гость";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : "?";

  return (
    <div className="relative flex h-full flex-col lg:pl-64">
      <TopBar title="Профиль" />

      <div className="profile-content no-scrollbar mx-auto flex-1 w-full max-w-2xl overflow-hidden px-3 pb-2 pt-0 lg:overflow-y-auto lg:px-10 lg:pb-10 lg:pt-6">
        <div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/10 p-3 lg:gap-4 lg:rounded-3xl lg:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 via-violet-500 to-sky-400 text-sm font-bold text-white lg:h-14 lg:w-14 lg:rounded-2xl lg:text-lg">
            {initials === "?" ? <UserRound size={18} className="lg:h-[22px] lg:w-[22px]" /> : initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-white lg:text-[15px]">{fullName}</p>
            <p className="text-[10px] text-white/45 lg:text-xs">Зритель DSU Debate</p>
          </div>
        </div>

        <div className="mt-3 lg:mt-6">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40 lg:mb-2 lg:text-xs">Anti-fraud</h3>
          <div className="glass-panel rounded-xl border border-white/10 p-3 lg:rounded-2xl lg:p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white lg:text-sm">
              <ShieldCheck size={15} className="text-emerald-400 lg:h-4 lg:w-4" />
              Device fingerprint
            </div>
            <p className="mt-1 truncate rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[10px] text-white/50 lg:mt-2 lg:px-3 lg:py-2 lg:text-[11px]">
              {fingerprint}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-white/35 lg:mt-2 lg:text-[11px] lg:leading-relaxed">
              Уникальный идентификатор устройства, который вместе с IP-адресом
              не позволяет проголосовать в одном дебате дважды.
            </p>
          </div>
        </div>

        <div className="mt-3 lg:mt-6">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40 lg:mb-2 lg:text-xs">
            Доступ администратора
          </h3>
          <div className="space-y-2 lg:space-y-3">
            {status === "checking" && (
              <div className="glass-panel rounded-xl border border-white/10 p-3 text-xs text-white/50 lg:rounded-2xl lg:p-4 lg:text-sm">
                Проверка сессии…
              </div>
            )}

            {status === "authed" && (
              <div className="glass-panel space-y-2 rounded-xl border border-white/10 p-3 lg:space-y-3 lg:rounded-2xl lg:p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-white lg:text-sm">
                  <ShieldCheck size={15} className="text-emerald-400 lg:h-4 lg:w-4" />
                  Администратор авторизован
                </div>
                <p className="text-[10px] leading-snug text-white/35 lg:text-[11px] lg:leading-relaxed">
                  Вход запоминается в этом браузере (токен хранится 365 дней),
                  поэтому при возвращении на сайт профиль снова авторизован.
                </p>
                <Button variant="glass" fullWidth className="py-2.5 text-xs lg:py-4 lg:text-[15px]" onClick={() => void logout()}>
                  <LogOut size={14} className="lg:h-4 lg:w-4" />
                  Выйти
                </Button>
              </div>
            )}

            {status === "expired" && (
              <>
                <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-2.5 text-[10px] leading-snug text-amber-300 lg:rounded-2xl lg:p-3 lg:text-xs lg:leading-relaxed">
                  Сохранённая сессия истекла или недействительна. Войдите заново —
                  кнопка «Создать» и панель администрирования снова станут доступны.
                </p>
                <AdminLoginForm compact onSuccess={handleLoggedIn} />
              </>
            )}

            {status === "network" && (
              <div className="glass-panel space-y-2 rounded-xl border border-white/10 p-3 lg:space-y-3 lg:rounded-2xl lg:p-4">
                <p className="text-[10px] leading-snug text-rose-300 lg:text-xs lg:leading-relaxed">
                  Не удалось связаться с сервером для проверки сессии. Это не
                  выход из аккаунта — нажмите «Повторить».
                </p>
                <Button variant="glass" fullWidth className="py-2.5 text-xs lg:py-4 lg:text-[15px]" onClick={() => void verifySession()}>
                  <RefreshCw size={14} className="lg:h-[15px] lg:w-[15px]" />
                  Повторить
                </Button>
              </div>
            )}

            {status === "anonymous" && (
              <AdminLoginForm compact onSuccess={handleLoggedIn} />
            )}

            <details className="rounded-xl border border-white/10 bg-white/5 p-2.5 lg:p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-[10px] text-white/55 lg:text-xs">
                <KeyRound size={14} /> Вставить JWT вручную
              </summary>
              <div className="mt-2 space-y-2 lg:mt-3 lg:space-y-3">
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="JWT администратора"
                  className="w-full bg-transparent font-mono text-[9px] text-white placeholder:text-white/20 outline-none lg:text-[10px]"
                />
                <Button
                  variant="glass"
                  fullWidth
                  className="py-2.5 text-xs lg:py-4 lg:text-[15px]"
                  onClick={() => {
                    setAdminToken(token.trim());
                    void verifySession();
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1500);
                  }}
                >
                  {saved ? "Сохранено ✓" : "Сохранить токен"}
                </Button>
              </div>
            </details>

            <p className="text-[10px] leading-snug text-white/35 lg:text-[11px] lg:leading-relaxed">
              Кнопка «Создать» в нижней панели появляется только после входа
              администратора. JWT хранится только в этом браузере и передаётся
              в защищённые admin-запросы.
            </p>
          </div>
        </div>

        <p className="mt-4 border-t border-white/5 pt-3 text-center text-[10px] leading-snug text-white/30 lg:mt-10 lg:pt-5 lg:text-[11px] lg:leading-relaxed">
          Платформа DSU Debate разработана для СНО ДГУ от СНО ФИиИТ
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
