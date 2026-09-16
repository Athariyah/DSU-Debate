import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "../ui/Button";
import { loginAdmin } from "../../api/debates";
import { getAdminToken, setAdminToken } from "../../api/httpClient";
import { apiFetch } from "../../api/httpClient";
import { markAuthed } from "../../api/authStore";

interface AdminLoginFormProps {
  title?: string;
  subtitle?: string;
  /** Вызывается после успешного входа (токен уже сохранён). */
  onSuccess?: () => void;
}

/**
 * Форма входа администратора. Используется и на вкладке «Профиль», и прямо
 * внутри защищённых экранов, чтобы просроченная сессия не «выкидывала»
 * пользователя, а предлагала войти на месте и сразу продолжать.
 * Регистрации здесь намеренно нет: новые администраторы создаются только
 * серверными командами (npm run admin:add), а не из публичной формы.
 */
export function AdminLoginForm({ title = "Вход администратора", subtitle, onSuccess }: AdminLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoggingIn(true);
    try {
      const response = await loginAdmin(email.trim(), password);
      setAdminToken(response.token);
      markAuthed();
      // Маячок в журнал backend: видно, дошёл ли токен до хранилища браузера.
      void apiFetch("/_diag", {
        method: "POST",
        body: JSON.stringify({
          step: "after-login",
          respToken: typeof response.token === "string" && response.token.length > 20,
          stored: Boolean(getAdminToken()),
        }),
      }).catch(() => undefined);
      setPassword("");
      onSuccess?.();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось войти");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-white/45">{subtitle}</p>}
      </div>

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
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Button fullWidth onClick={() => void submit()} disabled={loggingIn || !email || !password}>
        <LogIn size={16} />
        {loggingIn ? "Подождите…" : "Войти"}
      </Button>
    </div>
  );
}
