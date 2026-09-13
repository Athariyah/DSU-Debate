import { useState } from "react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { Button } from "../components/ui/Button";
import { getSavedProfileName } from "../utils/votedStore";
import { getDeviceFingerprint } from "../utils/device";
import { getAdminToken, setAdminToken } from "../api/httpClient";

export function ProfilePage() {
  const profile = getSavedProfileName();
  const fingerprint = getDeviceFingerprint();
  const [token, setToken] = useState(getAdminToken() ?? "");
  const [saved, setSaved] = useState(false);

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
          <div className="glass-panel space-y-3 rounded-2xl border border-white/10 p-4">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <KeyRound size={15} className="text-white/35" />
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Вставьте JWT администратора"
                className="w-full bg-transparent text-xs text-white placeholder:text-white/25 outline-none"
              />
            </div>
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
            <p className="text-[11px] leading-relaxed text-white/35">
              Токен передаётся в заголовке Authorization при создании дебатов
              (защищённые маршруты admin на бэкенде).
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
