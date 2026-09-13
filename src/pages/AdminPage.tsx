import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import {
  createAdminParticipant,
  deleteAdminParticipant,
  deleteDebate,
  listAdminDebates,
  listAdminParticipants,
  type AdminEventSummary,
  type AdminParticipant,
  updateAdminParticipant,
  updateDebate,
} from "../api/debates";
import type { DebateStatus } from "../types";

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminPage() {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [participants, setParticipants] = useState<Record<number, AdminParticipant[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setError(null);
    try {
      setEvents(await listAdminDebates());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить мероприятия");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function toggleParticipants(eventId: number) {
    if (expanded === eventId) {
      setExpanded(null);
      return;
    }
    setExpanded(eventId);
    if (participants[eventId]) return;
    try {
      const loaded = await listAdminParticipants(eventId);
      setParticipants((current) => ({ ...current, [eventId]: loaded }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить участников");
    }
  }

  async function saveEvent(event: AdminEventSummary) {
    setBusyId(event.id);
    setError(null);
    try {
      const saved = await updateDebate(event.id, {
        title: event.title,
        status: event.status,
        dateTime: new Date(event.dateTime).toISOString(),
      });
      setEvents((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      if (saved.status === "active") await loadEvents();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить мероприятие");
    } finally {
      setBusyId(null);
    }
  }

  async function removeEvent(eventId: number) {
    if (!window.confirm("Удалить мероприятие вместе с участниками и голосами?")) return;
    setBusyId(eventId);
    try {
      await deleteDebate(eventId);
      setEvents((current) => current.filter((event) => event.id !== eventId));
      setParticipants((current) => {
        const next = { ...current };
        delete next[eventId];
        return next;
      });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Не удалось удалить мероприятие");
    } finally {
      setBusyId(null);
    }
  }

  function updateEventLocal(eventId: number, patch: Partial<AdminEventSummary>) {
    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
  }

  async function saveParticipant(eventId: number, participant: AdminParticipant) {
    setBusyId(participant.id);
    try {
      const saved = await updateAdminParticipant(participant.id, {
        name: participant.name,
        description: participant.description,
      });
      setParticipants((current) => ({
        ...current,
        [eventId]: current[eventId].map((item) => (item.id === saved.id ? saved : item)),
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить участника");
    } finally {
      setBusyId(null);
    }
  }

  async function removeParticipant(eventId: number, participantId: number) {
    if (!window.confirm("Удалить участника и его голоса?")) return;
    setBusyId(participantId);
    try {
      await deleteAdminParticipant(participantId);
      setParticipants((current) => ({
        ...current,
        [eventId]: current[eventId].filter((participant) => participant.id !== participantId),
      }));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Не удалось удалить участника");
    } finally {
      setBusyId(null);
    }
  }

  async function addParticipant(eventId: number) {
    const name = window.prompt("Имя нового участника");
    if (!name?.trim()) return;
    try {
      const created = await createAdminParticipant(eventId, { name: name.trim(), description: null });
      setParticipants((current) => ({ ...current, [eventId]: [...(current[eventId] ?? []), created] }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось добавить участника");
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Администрирование" showBack rightSlot="profile" />
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-28 pt-2">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Protected admin area</p>
            <h1 className="mt-1 text-xl font-bold text-white">Мероприятия</h1>
          </div>
          <Link to="/create"><Button><Plus size={16} />Создать</Button></Link>
        </div>

        {error && <p className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">{error}</p>}
        {loading && <div className="h-28 animate-pulse rounded-3xl bg-white/5" />}
        {!loading && events.length === 0 && <p className="rounded-3xl border border-white/10 p-6 text-center text-sm text-white/50">Мероприятий пока нет</p>}

        <div className="space-y-4">
          {events.map((event) => {
            const eventParticipants = participants[event.id] ?? [];
            const isExpanded = expanded === event.id;
            return (
              <section key={event.id} className="glass-panel rounded-3xl border border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <input
                      value={event.title}
                      onChange={(inputEvent) => updateEventLocal(event.id, { title: inputEvent.target.value })}
                      className="w-full bg-transparent text-base font-semibold text-white outline-none"
                    />
                    <p className="mt-1 text-xs text-white/35">ID: {event.id} · участников: {event.participantsCount}</p>
                  </div>
                  <select
                    value={event.status}
                    onChange={(selectEvent) => updateEventLocal(event.id, { status: selectEvent.target.value as DebateStatus })}
                    className="rounded-xl border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white outline-none"
                  >
                    <option value="upcoming">upcoming</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                  </select>
                </div>

                <input
                  type="datetime-local"
                  value={toDateTimeLocal(event.dateTime)}
                  onChange={(inputEvent) => updateEventLocal(event.id, { dateTime: new Date(inputEvent.target.value).toISOString() })}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
                  style={{ colorScheme: "dark" }}
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="glass" onClick={() => void saveEvent(event)} disabled={busyId === event.id}><Save size={15} />Сохранить</Button>
                  <Button variant="ghost" onClick={() => void toggleParticipants(event.id)}>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}Участники</Button>
                  <Button variant="ghost" className="text-rose-300" onClick={() => void removeEvent(event.id)} disabled={busyId === event.id}><Trash2 size={15} />Удалить</Button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                    {eventParticipants.map((participant) => (
                      <div key={participant.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <input
                          value={participant.name}
                          onChange={(inputEvent) => setParticipants((current) => ({
                            ...current,
                            [event.id]: current[event.id].map((item) => item.id === participant.id ? { ...item, name: inputEvent.target.value } : item),
                          }))}
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                        />
                        <input
                          value={participant.description ?? ""}
                          onChange={(inputEvent) => setParticipants((current) => ({
                            ...current,
                            [event.id]: current[event.id].map((item) => item.id === participant.id ? { ...item, description: inputEvent.target.value } : item),
                          }))}
                          placeholder="Описание / позиция"
                          className="mt-1 w-full bg-transparent text-xs text-white/55 outline-none"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button variant="glass" onClick={() => void saveParticipant(event.id, participant)} disabled={busyId === participant.id}><Check size={14} />Сохранить</Button>
                          <Button variant="ghost" className="text-rose-300" onClick={() => void removeParticipant(event.id, participant.id)}><Trash2 size={14} /></Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="glass" fullWidth onClick={() => void addParticipant(event.id)}><Plus size={15} />Добавить участника</Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
