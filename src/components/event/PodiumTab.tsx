import { useEffect, useState } from "react";
import { fetchParticipants, fetchPodium, isAdminAuthenticated, setPodium, setPodiumAuto } from "../../api/debates";
import { getSocket } from "../../lib/socket";
import type { Participant, PodiumEntry } from "../../types";
import { Award, Medal, Trophy } from "lucide-react";
import { Confetti } from "../broadcast/Confetti";
import { Button } from "../ui/Button";

export function PodiumTab({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<PodiumEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAwardOpen, setIsAwardOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [place1, setPlace1] = useState<number | "">("");
  const [place2, setPlace2] = useState<number | "">("");
  const [place3, setPlace3] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = isAdminAuthenticated();
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

  async function openAward() {
    setError(null);
    try {
      const parts = await fetchParticipants(eventId);
      setParticipants(parts);
      // prefill with current podium
      const m = new Map(items.map(i => [i.place, i.participantId] as const));
      setPlace1(m.get(1) ?? "");
      setPlace2(m.get(2) ?? "");
      setPlace3(m.get(3) ?? "");
      setIsAwardOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить участников");
    }
  }

  async function handleSaveAward() {
    if (place1 === "" && place2 === "" && place3 === "") { setError("Выберите хотя бы одного призёра"); return; }
    const uniq = new Set([place1, place2, place3].filter(v => v !== ""));
    if (uniq.size !== [place1, place2, place3].filter(v => v !== "").length) { setError("Участники не должны повторяться"); return; }
    setSaving(true);
    setError(null);
    try {
      const podium: Array<{ place: number; participantId: number }> = [];
      if (place1 !== "") podium.push({ place: 1, participantId: Number(place1) });
      if (place2 !== "") podium.push({ place: 2, participantId: Number(place2) });
      if (place3 !== "") podium.push({ place: 3, participantId: Number(place3) });
      const res = await setPodium(eventId, podium);
      setItems(res.podium);
      setIsAwardOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally { setSaving(false); }
  }

  async function handleAutoAward() {
    setSaving(true);
    setError(null);
    try {
      const res = await setPodiumAuto(eventId);
      setItems(res.podium);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось автоматически назначить");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="h-20 animate-pulse rounded-2xl bg-white/5" />;
  if (items.length === 0) return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Medal size={20} className="text-white/40" />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">Пьедестал пока пуст</p>
      <p className="mx-auto mt-1 max-w-[28ch] text-xs text-white/40">После завершения мероприятия здесь появятся призёры</p>
      {isAdmin && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="glass" onClick={openAward} className="text-xs"><Award size={14} /> Назначить призёров</Button>
          <Button variant="glass" onClick={handleAutoAward} disabled={saving} className="text-xs">Авто (по голосам)</Button>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {isAwardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="frosted-panel w-full max-w-md rounded-3xl border border-white/15 p-6">
            <h3 className="text-base font-bold text-white">Назначить призёров</h3>
            <p className="mt-1 text-xs text-white/40">Выберите участников для каждого места — можно выдать не все три</p>
            <div className="mt-4 space-y-3">
              {[1,2,3].map(place => (
                <div key={place}>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">{place} место</label>
                  <select value={place===1?place1:place===2?place2:place3} onChange={e => { const v = e.target.value ? Number(e.target.value) : ""; if(place===1) setPlace1(v); else if(place===2) setPlace2(v); else setPlace3(v); }} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none">
                    <option value="">— не выдавать —</option>
                    {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
            <div className="mt-5 flex gap-2">
              <Button variant="glass" onClick={() => setIsAwardOpen(false)} className="flex-1">Отмена</Button>
              <Button onClick={handleSaveAward} disabled={saving} className="flex-1">{saving ? "Сохранение…" : "Сохранить"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Визуализация пьедестала 2-1-3
  const order = [1, 0, 2].map(i => items[i]).filter(Boolean);
  const heights = ["h-20", "h-28", "h-16"];
  const colors = ["from-zinc-300 to-zinc-400", "from-amber-300 to-amber-500", "from-amber-700 to-orange-700"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/30">
          <Trophy size={14} /> Пьедестал почёта
        </div>
        {isAdmin && (
          <div className="flex gap-1.5">
            <Button variant="glass" onClick={openAward} className="py-1.5 text-xs"><Award size={12} /> Выдать призы</Button>
            <Button variant="glass" onClick={handleAutoAward} disabled={saving} className="py-1.5 text-xs">Авто</Button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {isAwardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="frosted-panel w-full max-w-md rounded-3xl border border-white/15 p-6">
            <h3 className="text-base font-bold text-white">Назначить призёров</h3>
            <p className="mt-1 text-xs text-white/40">Выберите участников для каждого места</p>
            <div className="mt-4 space-y-3">
              {[1,2,3].map(place => (
                <div key={place}>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">{place} место</label>
                  <select value={place===1?place1:place===2?place2:place3} onChange={e => { const v = e.target.value ? Number(e.target.value) : ""; if(place===1) setPlace1(v); else if(place===2) setPlace2(v); else setPlace3(v); }} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none">
                    <option value="">— не выдавать —</option>
                    {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
            <div className="mt-5 flex gap-2">
              <Button variant="glass" onClick={() => setIsAwardOpen(false)} className="flex-1">Отмена</Button>
              <Button onClick={handleSaveAward} disabled={saving} className="flex-1">{saving ? "Сохранение…" : "Сохранить"}</Button>
            </div>
          </div>
        </div>
      )}
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
