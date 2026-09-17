import { useEffect, useState } from "react";
import { fetchPodium } from "../../api/debates";
import { getSocket } from "../../lib/socket";
import type { PodiumEntry } from "../../types";
import { Medal, Trophy } from "lucide-react";
import { Confetti } from "../broadcast/Confetti";

export function PodiumTab({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<PodiumEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchPodium(eventId).then(r => { setItems(r.podium); setLoading(false); }).catch(()=>setLoading(false));
    const socket = getSocket();
    const handler = (payload: { eventId: number; podium: PodiumEntry[] }) => {
      if (Number(payload.eventId) !== eventId) return;
      if (Array.isArray(payload.podium)) setItems(payload.podium);
    };
    socket.on("podium:update", handler);
    socket.on("leaderboard:update", () => fetchPodium(eventId).then(r=>setItems(r.podium)).catch(()=>{}));
    return () => { socket.off("podium:update", handler); };
  }, [eventId]);

  if (loading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  if (items.length === 0) return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Medal size={20} className="text-white/40" />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">Пьедестал пока пуст</p>
      <p className="mx-auto mt-1 max-w-[28ch] text-xs text-white/40">После завершения мероприятия здесь появятся призёры</p>
    </div>
  );

  // Визуализация пьедестала 2-1-3
  const order = [1, 0, 2].map(i => items[i]).filter(Boolean);
  const heights = ["h-20", "h-28", "h-16"];
  const colors = ["from-zinc-300 to-zinc-400", "from-amber-300 to-amber-500", "from-amber-700 to-orange-700"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30">
        <Trophy size={14} /> Пьедестал почёта
      </div>
      <div className="relative glass-panel rounded-[2rem] border border-white/10 p-6 pt-8">
        {items[0] && <Confetti />}
        <div className="flex items-end justify-center gap-2">
          {order.map((entry, idx) => {
            const place = entry.place;
            const height = heights[idx] ?? "h-16";
            const color = colors[idx] ?? "from-white/10 to-white/5";
            const isWinner = place === 1;
            return (
              <div key={place} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-center">
                  <p className="text-sm font-bold text-white">{entry.name}</p>
                  <p className="text-[11px] text-white/40">#{place} место</p>
                </div>
                <div className={`flex w-full flex-col items-center justify-end rounded-t-2xl bg-gradient-to-b ${color} ${height} border border-white/10 p-2 shadow-lg ${isWinner ? "shadow-amber-500/20" : ""}`}>
                  <span className="text-lg font-black text-white drop-shadow">{place}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 grid gap-2">
          {items.map(entry => (
            <div key={entry.place} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${entry.place===1?"bg-amber-300 text-black": entry.place===2?"bg-zinc-300 text-black":"bg-amber-700 text-white"}`}>{entry.place}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{entry.name}</p>
                {entry.description && <p className="truncate text-xs text-white/40">{entry.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
