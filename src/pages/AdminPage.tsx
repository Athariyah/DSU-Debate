import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Save, Timer, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { IconChip } from "../components/ui/IconChip";
import { StatusSelect } from "../components/ui/StatusSelect";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
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

/** Что собираемся удалить — окно подтверждения спрашивает перед запросом. */
type PendingDelete =
  | { kind: "event"; id: number; title: string }
  | { kind: "participant"; eventId: number; id: number; name: string };

export function AdminPage() {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [participants, setParticipants] = useState<Record<number, AdminParticipant[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  // Тема в карточке показана сокращённой; редактирование — по клику.
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Вместо системного window.confirm — собственное окно подтверждения
  // в стилистике приложения (ConfirmDialog).
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

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
        votingDurationMinutes: event.votingDurationMinutes ?? null,
      });
      setEvents((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      if (saved.status === "active") await loadEvents();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить мероприятие");
    } finally {
      setBusyId(null);
    }
  }

  async function runPendingDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "event") {
      const eventId = pendingDelete.id;
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
        setPendingDelete(null);
      }
      return;
    }
    const { eventId, id: participantId } = pendingDelete;
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
      setPendingDelete(null);
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

  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Администрирование" showBack onBack={() => navigate("/debates")} rightSlot="profile" />
      <div className="no-scrollbar mx-auto flex-1 w-full max-w-3xl overflow-y-auto px-5 pb-10 pt-2 lg:px-8 lg:pb-12 lg:pt-6">
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
                    {editingTitleId === event.id ? (
                      <div>
                        <textarea
                          value={event.title}
                          rows={3}
                          autoFocus
                          onChange={(inputEvent) => updateEventLocal(event.id, { title: inputEvent.target.value })}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
                              keyEvent.preventDefault();
                              setEditingTitleId(null);
                            }
                          }}
                          aria-label="Редактировать тему"
                          className="w-full resize-none rounded-xl border border-indigo-300/30 bg-white/5 px-3 py-2 text-base font-semibold leading-snug text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingTitleId(null)}
                          className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-indigo-300/25 bg-indigo-400/15 px-2.5 py-1 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-400/25 active:scale-95"
                        >
                          <Check size={13} />
                          Готово
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingTitleId(event.id)}
                        title="Нажмите, чтобы увидеть полностью и отредактировать"
                        className="group -mx-1 flex w-[calc(100%+0.5rem)] items-start gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/5"
                      >
                        <span className="line-clamp-2 min-w-0 flex-1 break-words text-base font-semibold leading-snug text-white">
                          {event.title}
                        </span>
                        <Pencil size={14} className="mt-1 shrink-0 text-white opacity-0 transition group-hover:opacity-50" />
                      </button>
                    )}
                    <p className="mt-1 text-xs text-white/35">ID: {event.id} · участников: {event.participantsCount}</p>
                  </div>
                  <StatusSelect
                    value={event.status}
                    onChange={(status) => updateEventLocal(event.id, { status })}
                  />
                </div>

                <DateTimeField
                  className="mt-3"
                  value={event.dateTime}
                  onChange={(iso) => updateEventLocal(event.id, { dateTime: iso })}
                />

                {/* Таймер: после интервала голосование закрывается само. */}
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <IconChip icon={Timer} iconSize={15} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Таймер голосования</p>
                    <p className="truncate text-[11px] text-white/35">
                      {event.votingDurationMinutes
                        ? `После запуска: ${event.votingDurationMinutes} мин. до автостопа`
                        : "Выключен — до смены статуса вручную"}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    inputMode="numeric"
                    value={event.votingDurationMinutes ?? ""}
                    onChange={(inputEvent) => {
                      const raw = inputEvent.target.value.trim();
                      const parsed = raw === "" ? null : Number(raw);
                      const minutes =
                        parsed === null || !Number.isFinite(parsed)
                          ? null
                          : Math.min(1440, Math.max(1, Math.round(parsed)));
                      updateEventLocal(event.id, { votingDurationMinutes: minutes });
                    }}
                    placeholder="—"
                    aria-label="Длительность таймера в минутах"
                    className="w-16 shrink-0 rounded-xl border border-white/10 bg-black/25 px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-white outline-none transition focus:border-indigo-300/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-white/45">мин</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="glass" onClick={() => void saveEvent(event)} disabled={busyId === event.id}><Save size={15} />Сохранить</Button>
                  <Button variant="ghost" onClick={() => void toggleParticipants(event.id)}>{isExpanded ? <ChevronUp size={15} className="text-white opacity-70" /> : <ChevronDown size={15} className="text-white opacity-70" />}Участники</Button>
                  <Button
                    variant="ghost"
                    className="text-rose-300"
                    onClick={() => setPendingDelete({ kind: "event", id: event.id, title: event.title })}
                    disabled={busyId === event.id}
                  >
                    <Trash2 size={15} />Удалить
                  </Button>
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
                          <Button
                            variant="ghost"
                            className="text-rose-300"
                            aria-label={`Удалить участника ${participant.name}`}
                            onClick={() =>
                              setPendingDelete({ kind: "participant", eventId: event.id, id: participant.id, name: participant.name })
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
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

      {/* Собственное окно подтверждения удаления — вместо системного confirm. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "participant" ? "Удалить участника?" : "Удалить мероприятие?"}
        message={
          pendingDelete?.kind === "participant"
            ? `«${pendingDelete.name}» и все его голоса будут удалены. Действие необратимо.`
            : pendingDelete
              ? `«${pendingDelete.title}» будет удалено вместе с участниками и голосами. Действие необратимо.`
              : ""
        }
        busy={busyId !== null}
        onConfirm={() => void runPendingDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
