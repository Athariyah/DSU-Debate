import { useEffect, useState } from "react";
import { KeyRound, LogOut, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { Button } from "../components/ui/Button";
import { getSavedProfileName } from "../utils/votedStore";
import { getDeviceFingerprint } from "../utils/device";
import { apiFetch, getAdminToken, isAuthError, setAdminToken } from "../api/httpClient";
import { logoutAdmin } from "../api/debates";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { AdminLoginForm } from "../components/auth/AdminLoginForm";

export function ProfilePage() {
  const profile = getSavedProfileName();
  const fingerprint = getDeviceFingerprint();
  const [token, setToken] = useState(getAdminToken() ?? "");
  const [saved, setSaved] = useState(false);
  const isAdmin = useAdminAuth();
  const [session, setSession] = useState<"anonymous" | "checking" | "ok" | "expired" | "error">(
    getAdminToken() ? "checking" : "anonymous"
  );
  const [retryKey, setRetryKey] = useState(0);

  // Честное состояние сессии: токен проверяется на сервере. 401 — «сессия
  // истекла» с формой входа; ошибка сети — отдельное сообщение с повтором,
  // чтобы случайный сбой соединения не выглядел как «выкинули из аккаунта».
  useEffect(() => {
    if (!isAdmin) {
      setSession("anonymous");
      return;
    }
    setSession("checking");
    let mounted = true;
    apiFetch("/admin/auth/me", { auth: true })
      .then(() => {
        if (mounted) setSession("ok");
      })
      .catch((error: unknown) => {
        if (mounted) setSession(isAuthError(error) ? "expired" : "error");
      });
    return () => {
      mounted = false;
    };
  }, [isAdmin, retryKey]);

  async function logout() {
    try {
      await logoutAdmin();
    } finally {
      setAdminToken("");
      setToken("");
    }
  }

  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : "Гость";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : "?";

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Профиль" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-2">
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
            {session === "checking" && (
              <div className="glass-panel rounded-2xl border border-white/10 p-4 text-sm text-white/50">
                Проверка сессии…
              </div>
            )}

            {session === "ok" && (
              <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  Администратор авторизован
                </div>
                <p className="text-[11px] leading-relaxed text-white/35">
                  Вход запоминается в этом браузере (токен хранится 8 часов),
                  поэтому при возвращении на сайт профиль сразу авторизован.
                </p>
                <Button variant="glass" fullWidth onClick={() => void logout()}>
                  <LogOut size={16} />
                  Выйти
                </Button>
              </div>
            )}

            {session === "expired" && (
              <>
                <p className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-300">
                  Сохранённая сессия истекла или недействительна. Войдите заново —
                  кнопка «Создать» и панель администрирования снова станут доступны.
                </p>
                <AdminLoginForm onSuccess={() => setToken(getAdminToken() ?? "")} />
              </>
            )}

            {session === "error" && (
              <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
                <p className="text-xs leading-relaxed text-rose-300">
                  Не удалось связаться с сервером для проверки сессии. Это не
                  выход из аккаунта — нажмите «Повторить».
                </p>
                <Button variant="glass" fullWidth onClick={() => setRetryKey((k) => k + 1)}>
                  <RefreshCw size={15} />
                  Повторить
                </Button>
              </div>
            )}

            {session === "anonymous" && (
              <AdminLoginForm onSuccess={() => setToken(getAdminToken() ?? "")} />
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
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1500);
                  }}
                >
                  {saved ? "Сохранено ✓" : "Сохранить токен"}
                </Button>
              </div>
            </details>

            <p className="text-[11px] leading-relaxed text-white/35">
              Администратор может создавать дебаты через кнопку «Создать» в нижней
              панели. JWT хранится только в этом браузере и передаётся в защищённые
              admin-запросы.
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
