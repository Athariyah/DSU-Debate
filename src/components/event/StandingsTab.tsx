import { useEffect, useState } from "react";
import { fetchStandings } from "../../api/debates";
import { getSocket } from "../../lib/socket";
import type { TournamentStanding } from "../../types";
import { Layers } from "lucide-react";

export function StandingsTab({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<TournamentStanding[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchStandings(eventId).then(r => { setItems(r.items); setLoading(false); }).catch(()=>setLoading(false));
    const socket = getSocket();
    const handler = (payload: { eventId: number; standings: TournamentStanding[] }) => {
      if (Number(payload.eventId) !== eventId) return;
      if (Array.isArray(payload.standings)) setItems(payload.standings as any);
    };
    socket.on("standings:update", handler);
    socket.on("match:update", () => fetchStandings(eventId).then(r=>setItems(r.items)).catch(()=>{}));
    return () => { socket.off("standings:update", handler); socket.off("match:update", handler as any); };
  }, [eventId]);

  if (loading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  if (items.length === 0) return <p className="py-10 text-center text-sm text-white/40">Турнирная таблица пока пуста — добавьте матчи в админке</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30">
        <Layers size={14} /> Турнирная таблица
      </div>
      <div className="glass-panel overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 border-b border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-white/40">
          <span>#</span><span>Участник</span><span>В</span><span>П</span><span>Н</span><span>Очки</span>
        </div>
        {items.map((s) => (
          <div key={s.participant_id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white">{s.position ?? "-"}</span>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{s.name}</p>
              {s.description && <p className="truncate text-xs text-white/40">{s.description}</p>}
            </div>
            <span className="tabular-nums text-emerald-300">{s.wins}</span>
            <span className="tabular-nums text-rose-300">{s.losses}</span>
            <span className="tabular-nums text-white/60">{s.draws}</span>
            <span className="font-bold tabular-nums text-white">{s.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
