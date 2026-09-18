import { useEffect, useState } from "react";
import { Trophy, Crown } from "lucide-react";
import { fetchLeaderboard } from "../../api/debates";
import { getSocket } from "../../lib/socket";
import type { LeaderboardEntry } from "../../types";
import { cn } from "../../utils/cn";
import { memo } from "react";

interface Props { eventId: number; }

const LeaderboardRow = memo(function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const isTop3 = index < 3;
  return (
    <div className={cn("glass-panel flex items-center gap-3 rounded-2xl border p-4", isTop3 ? "border-amber-300/30 bg-amber-400/5" : "border-white/10")}>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold", index === 0 ? "bg-amber-300 text-black" : index === 1 ? "bg-zinc-300 text-black" : index === 2 ? "bg-amber-700 text-white" : "border border-white/10 bg-white/10 text-white")}>
        {entry.rank}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{entry.name}</p>
        {entry.description && <p className="truncate text-xs text-white/45">{entry.description}</p>}
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-white">{entry.score}</p>
        <p className="text-[11px] uppercase tracking-widest text-white/30">очков</p>
      </div>
      {index === 0 && <Crown size={16} className="text-amber-300" />}
    </div>
  );
});

export function LeaderboardTab({ eventId }: Props) {
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(eventId).then(r => { setItems(r.items); setLoading(false); }).catch(() => setLoading(false));
    const socket = getSocket();
    const handler = (payload: { eventId: number; items?: LeaderboardEntry[]; leaderboard?: any }) => {
      if (Number(payload.eventId) !== eventId) return;
      const next = (payload as any).items ?? (payload as any).leaderboard?.items ?? (payload as any).leaderboard;
      if (Array.isArray(next)) setItems(next);
    };
    socket.on("leaderboard:update", handler);
    // Also update on vote
    const voteHandler = (payload: { eventId: number }) => {
      if (Number(payload.eventId) === eventId) fetchLeaderboard(eventId).then(r => setItems(r.items)).catch(()=>{});
    };
    socket.on("vote:update", voteHandler);
    return () => { socket.off("leaderboard:update", handler); socket.off("vote:update", voteHandler); };
  }, [eventId]);

  if (loading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  if (items.length === 0) return <p className="py-10 text-center text-sm text-white/40">Пока нет данных для лидерборда</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30">
        <Trophy size={14} /> Лидерборд
      </div>
      {items.map((e, idx) => <LeaderboardRow key={e.participantId} entry={e} index={idx} />)}
    </div>
  );
}
