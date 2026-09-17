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
    <div className="profile-page relative flex h-full min-h-0 flex-col lg:pl-64">
      <TopBar title="Профиль" />

      {/*
        На профиле нет длинной ленты: это экран-обзор. Две информационные
        карточки стоят рядом на больших экранах, а на телефоне укладываются
        друг под друга. min-h-0 и overflow-hidden не дают оболочке создавать
        отдельную страницу со скроллом поверх нижней панели.
      */}
      <div className="profile-content no-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] pt-1 sm:px-5 lg:px-10 lg:pb-7 lg:pt-4">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
          <section className="profile-identity glass-panel flex shrink-0 items-center gap-4 rounded-3xl border border-white/10 p-4 sm:p-5 lg:p-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-sky-400 text-lg font-bold text-white shadow-[0_8px_24px_-10px_rgba(99,102,241,0.9)] lg:h-[4.5rem] lg:w-[4.5rem] lg:text-xl">
              {initials === "?" ? <UserRound size={24} /> : initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold tracking-tight text-white lg:text-xl">{fullName}</p>
              <p className="mt-0.5 text-xs text-white/50 lg:mt-1 lg:text-sm">Зритель DSU Debate</p>
            </div>
          </section>

          <div className="profile-sections mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            <section className="flex min-h-0 flex-col">
              <h2 className="profile-section-heading mb-2 shrink-0 px-1 text-xs font-bold uppercase tracking-[0.12em] text-white/50 lg:text-sm">
                Anti-fraud
              </h2>
              <div className="profile-panel glass-panel min-h-0 flex-1 rounded-2xl border border-white/10 p-4 lg:rounded-3xl lg:p-5">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-white lg:text-base">
                  <ShieldCheck size={19} className="text-emerald-400" />
                  Device fingerprint
                </div>
                <p className="mt-3 truncate rounded-xl bg-black/30 px-3 py-2.5 font-mono text-xs text-white/60 lg:text-sm">
                  {fingerprint}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-white/45 lg:text-sm">
                  Уникальный идентификатор устройства, который вместе с IP-адресом
                  не позволяет проголосовать в одном дебате дважды.
                </p>
              </div>
            </section>

            <section className="flex min-h-0 flex-col">
              <h2 className="profile-section-heading mb-2 shrink-0 px-1 text-xs font-bold uppercase tracking-[0.12em] text-white/50 lg:text-sm">
                Доступ администратора
              </h2>
              <div className="profile-admin-content min-h-0 flex-1 space-y-3 overflow-hidden">
                {status === "checking" && (
                  <div className="glass-panel rounded-2xl border border-white/10 p-5 text-sm text-white/55 lg:rounded-3xl lg:text-base">
                    Проверка сессии…
                  </div>
                )}

                {status === "authed" && (
                  <div className="glass-panel space-y-4 rounded-2xl border border-white/10 p-4 lg:rounded-3xl lg:p-5">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-white lg:text-base">
                      <ShieldCheck size={19} className="text-emerald-400" />
                      Администратор авторизован
                    </div>
                    <p className="text-xs leading-relaxed text-white/45 lg:text-sm">
                      Вход запоминается в этом браузере (токен хранится 365 дней),
                      поэтому при возвращении на сайт профиль снова авторизован.
                    </p>
                    <Button variant="glass" fullWidth className="py-3 text-sm lg:py-3.5" onClick={() => void logout()}>
                      <LogOut size={17} />
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
                    <div className="profile-login">
                      <AdminLoginForm compact onSuccess={handleLoggedIn} />
                    </div>
                  </>
                )}

                {status === "network" && (
                  <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4 lg:rounded-3xl lg:p-5">
                    <p className="text-xs leading-relaxed text-rose-300 lg:text-sm">
                      Не удалось связаться с сервером для проверки сессии. Это не
                      выход из аккаунта — нажмите «Повторить».
                    </p>
                    <Button variant="glass" fullWidth className="py-3 text-sm" onClick={() => void verifySession()}>
                      <RefreshCw size={17} />
                      Повторить
                    </Button>
                  </div>
                )}

                {status === "anonymous" && (
                  <div className="profile-login">
                    <AdminLoginForm onSuccess={handleLoggedIn} />
                  </div>
                )}

                <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-white/65 lg:text-sm">
                    <KeyRound size={16} /> Вставить JWT вручную
                  </summary>
                  <div className="mt-3 space-y-3">
                    <input
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="JWT администратора"
                      className="w-full bg-transparent font-mono text-xs text-white placeholder:text-white/25 outline-none"
                    />
                    <Button
                      variant="glass"
                      fullWidth
                      className="py-3 text-sm"
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

                <p className="px-1 text-xs leading-relaxed text-white/40 lg:text-sm">
                  Кнопка «Создать» в нижней панели появляется только после входа
                  администратора. JWT хранится только в этом браузере и передаётся
                  в защищённые admin-запросы.
                </p>
              </div>
            </section>
          </div>

          <p className="profile-footer mt-3 shrink-0 border-t border-white/10 pt-3 text-center text-xs leading-relaxed text-white/35 lg:mt-4 lg:pt-4 lg:text-sm">
            Платформа DSU Debate разработана для СНО ДГУ от СНО ФиИИТ
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
