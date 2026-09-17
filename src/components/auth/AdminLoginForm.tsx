import { useState } from "react";
import { LogIn } from "lucide-react";
import { cn } from "../../utils/cn";
import { Button } from "../ui/Button";
import { loginAdmin } from "../../api/debates";
import { getAdminToken, setAdminToken } from "../../api/httpClient";
import { apiFetch } from "../../api/httpClient";
import { markAuthed } from "../../api/authStore";

interface AdminLoginFormProps {
  title?: string;
  subtitle?: string;
  /** Компактная версия для профиля на небольших экранах. */
  compact?: boolean;
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
export function AdminLoginForm({
  title = "Вход администратора",
  subtitle,
  compact = false,
  onSuccess,
}: AdminLoginFormProps) {
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
      // Маячок в журнал backend: дошёл ли токен до хранилища браузера и
      // какие auth-каналы видит сервер сквозь прокси (эхо).
      void (async () => {
        let echo: unknown = "n/a";
        try {
          echo = await apiFetch("/_echo-auth", { auth: true });
        } catch {
          echo = "echo-failed";
        }
        return apiFetch("/_diag", {
          method: "POST",
          body: JSON.stringify({
            step: "after-login",
            respToken: typeof response.token === "string" && response.token.length > 20,
            stored: Boolean(getAdminToken()),
            echo,
          }),
        });
      })().catch(() => undefined);
      setPassword("");
      onSuccess?.();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось войти");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div
      className={cn(
        "glass-panel space-y-3 rounded-2xl border border-white/10 p-4",
        compact && "space-y-2 p-3"
      )}
    >
      <div>
        <p className={cn("text-sm font-semibold text-white", compact && "text-xs")}>{title}</p>
        {subtitle && (
          <p className={cn("mt-1 text-xs leading-relaxed text-white/45", compact && "text-[10px]")}>{subtitle}</p>
        )}
      </div>

      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        placeholder="Email администратора"
        className={cn(
          "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60",
          compact && "py-2"
        )}
      />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        placeholder="Пароль"
        className={cn(
          "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60",
          compact && "py-2"
        )}
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Button
        fullWidth
        onClick={() => void submit()}
        disabled={loggingIn || !email || !password}
        className={compact ? "py-2.5 text-xs" : undefined}
      >
        <LogIn size={compact ? 14 : 16} />
        {loggingIn ? "Подождите…" : "Войти"}
      </Button>
    </div>
  );
}
