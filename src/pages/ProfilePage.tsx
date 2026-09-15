import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { Button } from "../components/ui/Button";
import { getSavedProfileName } from "../utils/votedStore";
import { getDeviceFingerprint } from "../utils/device";
import { getAdminToken, setAdminToken } from "../api/httpClient";
import { loginAdmin, logoutAdmin, registerAdmin } from "../api/debates";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profile = getSavedProfileName();
  const fingerprint = getDeviceFingerprint();
  const [token, setToken] = useState(getAdminToken() ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [registrationKey, setRegistrationKey] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : "Гость";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : "?";
  // Живое состояние сессии: протухший токен сбрасывается проверкой на сервере,
  // поэтому «авторизован» не показывается с мёртвым JWT и нет цикла
  // «плюс → профиль».
  const isAdmin = useAdminAuth();

  async function handleLogin() {
    setLoginError(null);
    setLoggingIn(true);
    try {
      const response = registerMode
        ? await registerAdmin(email.trim(), password, registrationKey)
        : await loginAdmin(email.trim(), password);
      setAdminToken(response.token);
      setToken(response.token);
      setPassword("");
      const redirect = searchParams.get("redirect");
      if (redirect?.startsWith("/") && !redirect.startsWith("//")) navigate(redirect);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Не удалось войти");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await logoutAdmin();
    } finally {
      setAdminToken("");
      setToken("");
    }
  }

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
          <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck size={16} className={isAdmin ? "text-emerald-400" : "text-white/35"} />
              {isAdmin ? "Администратор авторизован" : registerMode ? "Регистрация администратора" : "Вход администратора"}
            </div>

            {!isAdmin && (
              <>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="Email администратора"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
                />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Пароль"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
                />
                {registerMode && (
                  <input
                    value={registrationKey}
                    onChange={(event) => setRegistrationKey(event.target.value)}
                    type="password"
                    placeholder="Ключ регистрации"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
                  />
                )}
                {loginError && <p className="text-xs text-rose-400">{loginError}</p>}
                <Button fullWidth onClick={handleLogin} disabled={loggingIn || !email || !password || (registerMode && !registrationKey)}>
                  <LogIn size={16} />
                  {loggingIn ? "Подождите…" : registerMode ? "Зарегистрироваться" : "Войти"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setRegisterMode((current) => !current); setLoginError(null); }}
                  className="w-full text-center text-xs text-white/45 hover:text-white/75"
                >
                  {registerMode ? "Уже есть аккаунт? Войти" : "Зарегистрировать нового администратора"}
                </button>
              </>
            )}

            {isAdmin && (
              <Button variant="glass" fullWidth onClick={logout}>
                <LogOut size={16} />
                Выйти
              </Button>
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
                  className="w-full bg-transparent font-mono text-[10px] text-white placeholder:text-white/25 outline-none"
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
              Администратор может создавать дебаты через кнопку «+». JWT хранится только
              в localStorage и передаётся в защищённые admin-запросы.
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
