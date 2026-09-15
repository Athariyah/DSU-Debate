import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "../ui/Button";
import { loginAdmin, registerAdmin } from "../../api/debates";
import { setAdminToken } from "../../api/httpClient";

interface AdminLoginFormProps {
  title?: string;
  subtitle?: string;
  /** Вызывается после успешного входа (токен уже сохранён). */
  onSuccess: () => void;
}

/**
 * Форма входа администратора. Используется и на вкладке «Профиль», и прямо
 * внутри защищённых экранов (ProtectedRoute), чтобы просроченная сессия не
 * «выкидывала» пользователя, а предлагала войти на месте и сразу продолжать.
 */
export function AdminLoginForm({ title = "Вход администратора", subtitle, onSuccess }: AdminLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerMode, setRegisterMode] = useState(false);
  const [registrationKey, setRegistrationKey] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoggingIn(true);
    try {
      const response = registerMode
        ? await registerAdmin(email.trim(), password, registrationKey)
        : await loginAdmin(email.trim(), password);
      setAdminToken(response.token);
      setPassword("");
      onSuccess();
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
      {registerMode && (
        <input
          value={registrationKey}
          onChange={(event) => setRegistrationKey(event.target.value)}
          type="password"
          placeholder="Ключ регистрации"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
        />
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <Button
        fullWidth
        onClick={() => void submit()}
        disabled={loggingIn || !email || !password || (registerMode && !registrationKey)}
      >
        <LogIn size={16} />
        {loggingIn ? "Подождите…" : registerMode ? "Зарегистрироваться" : "Войти"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setRegisterMode((current) => !current);
          setError(null);
        }}
        className="w-full text-center text-xs text-white/45 hover:text-white/75"
      >
        {registerMode ? "Уже есть аккаунт? Войти" : "Зарегистрировать нового администратора"}
      </button>
    </div>
  );
}
