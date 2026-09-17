import { useEffect, useState } from "react";
import { createMatchApi, fetchMatches, fetchStandings } from "../../api/debates";
import { getSocket } from "../../lib/socket";
import type { Match, TournamentStanding, Participant } from "../../types";
import { isAdminAuthenticated } from "../../api/debates";
import { Layers, Plus, Trophy, Swords } from "lucide-react";
import { Button } from "../ui/Button";

export function StandingsTab({ eventId, participants, eventType }: { eventId: number; participants?: Participant[]; eventType?: string }) {
  const [items, setItems] = useState<TournamentStanding[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [p1, setP1] = useState<number | "">("");
  const [p2, setP2] = useState<number | "">("");
  const [score1, setScore1] = useState("0");
  const [score2, setScore2] = useState("0");
  const [winner, setWinner] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = isAdminAuthenticated();
  const isTournament = (eventType ?? "tournament") === "tournament";

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStandings(eventId), fetchMatches(eventId)]).then(([s, m]) => { setItems(s.items); setMatches(m.items); setLoading(false); }).catch(()=>setLoading(false));
    const socket = getSocket();
    const handler = (payload: { eventId: number; standings: TournamentStanding[] }) => {
      if (Number(payload.eventId) !== eventId) return;
      if (Array.isArray(payload.standings)) setItems(payload.standings as any);
    };
    const matchHandler = () => {
      fetchStandings(eventId).then(r=>setItems(r.items)).catch(()=>{});
      fetchMatches(eventId).then(r=>setMatches(r.items)).catch(()=>{});
    };
    socket.on("standings:update", handler);
    socket.on("match:update", matchHandler);
    socket.on("match:created", matchHandler);
    return () => { socket.off("standings:update", handler); socket.off("match:update", matchHandler as any); socket.off("match:created", matchHandler as any); };
  }, [eventId]);

  async function handleAddMatch() {
    if (p1 === "" || p2 === "" || Number(p1) === Number(p2)) {
      setError("Выберите двух разных участников");
      return;
    }
    const s1 = Math.max(0, parseInt(score1 || "0", 10) || 0);
    const s2 = Math.max(0, parseInt(score2 || "0", 10) || 0);
    setSubmitting(true);
    setError(null);
    try {
      await createMatchApi(eventId, {
        participant1Id: Number(p1),
        participant2Id: Number(p2),
        score1: s1,
        score2: s2,
        winnerId: winner === "" ? null : Number(winner),
        status: winner === "" ? "draw" : "completed",
        round: 1,
      } as any);
      setAdding(false);
      setP1(""); setP2(""); setWinner(""); setScore1("0"); setScore2("0");
      const [s, m] = await Promise.all([fetchStandings(eventId), fetchMatches(eventId)]);
      setItems(s.items); setMatches(m.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать матч");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30">
          <Layers size={14} /> Турнирная таблица
        </div>
        {isTournament && isAdmin && participants && participants.length >= 2 && (
          <Button variant="glass" onClick={() => setAdding(true)} className="py-1.5 text-xs"><Plus size={12} />Матч</Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">Турнирная таблица пока пуста — добавьте матчи</p>
      ) : (
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
      )}
      {matches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30"><Swords size={14} /> Матчи</div>
          <div className="space-y-2">
            {matches.slice(0, 10).map((m) => {
              const n1 = participants?.find(pp=>pp.id===m.participant1Id)?.name ?? `#${m.participant1Id}`;
              const n2 = participants?.find(pp=>pp.id===m.participant2Id)?.name ?? `#${m.participant2Id}`;
              return (
                <div key={m.id} className="glass-panel flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm">
                  <span className="text-xs text-white/30">#{m.id}</span>
                  <span className="flex-1 truncate text-white">{n1} <span className="text-white/40">vs</span> {n2}</span>
                  <span className="font-bold tabular-nums text-white">{m.score1}:{m.score2}</span>
                  {m.winnerId && <Trophy size={12} className="text-amber-300" />}
                  <span className="text-xs text-white/30">{m.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="frosted-panel w-full max-w-md rounded-3xl border border-white/15 p-6">
            <h3 className="text-base font-bold text-white">Новый матч</h3>
            <p className="mt-1 text-xs text-white/40">Выберите участников и счёт — standings обновится автоматически</p>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Участник 1</label>
                  <select value={p1} onChange={(e) => setP1(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none">
                    <option value="">Выберите</option>
                    {(participants ?? []).map(pp => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Участник 2</label>
                  <select value={p2} onChange={(e) => setP2(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none">
                    <option value="">Выберите</option>
                    {(participants ?? []).map(pp => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Счёт 1</label>
                  <input type="number" min={0} value={score1} onChange={(e) => setScore1(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Счёт 2</label>
                  <input type="number" min={0} value={score2} onChange={(e) => setScore2(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Победитель (необязательно)</label>
                <select value={winner} onChange={(e) => setWinner(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none">
                  <option value="">Ничья / не выбран</option>
                  {(participants ?? []).filter(pp => pp.id === p1 || pp.id === p2).map(pp => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                </select>
              </div>
              {error && <p className="text-xs text-rose-300">{error}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Отмена</Button>
              <Button onClick={() => void handleAddMatch()} disabled={submitting || p1==="" || p2===""}>{submitting ? "Создание..." : "Создать"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
