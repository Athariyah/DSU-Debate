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

      <div className="no-scrollbar mx-auto flex-1 w-full max-w-2xl overflow-y-auto px-5 pb-32 pt-2 lg:px-10 lg:pb-10 lg:pt-6">
        <div className="glass-panel flex items-center gap-4 rounded-3xl border border-white/10 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-sky-400 text-lg font-bold text-white">
            {initials === "?" ? <UserRound size={22} /> : initials}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-white">{fullName}</p>
            <p className="text-xs text-white/45">Зритель DSU Debate</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Anti-fraud</h3>
          <div className="glass-panel rounded-2xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck size={16} className="text-emerald-400" />
              Device fingerprint
            </div>
            <p className="mt-2 truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-white/50">
              {fingerprint}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
              Уникальный идентификатор устройства, который вместе с IP-адресом
              не позволяет проголосовать в одном дебате дважды.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
            Доступ администратора
          </h3>
          <div className="space-y-3">
            {status === "checking" && (
              <div className="glass-panel rounded-2xl border border-white/10 p-4 text-sm text-white/50">
                Проверка сессии…
              </div>
            )}

            {status === "authed" && (
              <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  Администратор авторизован
                </div>
                <p className="text-[11px] leading-relaxed text-white/35">
                  Вход запоминается в этом браузере (токен хранится 365 дней),
                  поэтому при возвращении на сайт профиль снова авторизован.
                </p>
                <Button variant="glass" fullWidth onClick={() => void logout()}>
                  <LogOut size={16} />
                  Выйти
                </Button>
              </div>
            )}

            {status === "expired" && (
              <>
                <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-300">
                  Сохранённая сессия истекла или недействительна. Войдите заново —
                  кнопка «Создать» и панель администрирования снова станут доступны.
                </p>
                <AdminLoginForm onSuccess={handleLoggedIn} />
              </>
            )}

            {status === "network" && (
              <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
                <p className="text-xs leading-relaxed text-rose-300">
                  Не удалось связаться с сервером для проверки сессии. Это не
                  выход из аккаунта — нажмите «Повторить».
                </p>
                <Button variant="glass" fullWidth onClick={() => void verifySession()}>
                  <RefreshCw size={15} />
                  Повторить
                </Button>
              </div>
            )}

            {status === "anonymous" && (
              <AdminLoginForm onSuccess={handleLoggedIn} />
            )}

            <details className="rounded-xl border border-white/10 bg-white/5 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs text-white/55">
                <KeyRound size={14} /> Вставить JWT вручную
              </summary>
              <div className="mt-3 space-y-3">
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="JWT администратора"
                  className="w-full bg-transparent font-mono text-[10px] text-white placeholder:text-white/20 outline-none"
                />
                <Button
                  variant="glass"
                  fullWidth
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

            <p className="text-[11px] leading-relaxed text-white/35">
              Кнопка «Создать» в нижней панели появляется только после входа
              администратора. JWT хранится только в этом браузере и передаётся
              в защищённые admin-запросы.
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-white/5 pt-5 text-center text-[11px] leading-relaxed text-white/30">
          Платформа DSU Debate разработана для СНО ДГУ от СНО ФИиИТ
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
