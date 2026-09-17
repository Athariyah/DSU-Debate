import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Award, Check, ChevronDown, ChevronUp, Eye, EyeOff, Filter, LayoutGrid, MonitorPlay, Pencil, Plus, Save, Timer, Trash2, Trophy, UserX, Users } from "lucide-react";
import { EVENT_TYPE_META, getEventTypeMeta } from "../utils/eventType";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { IconChip } from "../components/ui/IconChip";
import { StatusSelect } from "../components/ui/StatusSelect";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { cn } from "../utils/cn";
import type { EventType } from "../types";
import {
  createAdminParticipant,
  createAdminVoting,
  deleteAdminParticipant,
  deleteDebate,
  listAdminDebates,
  listAdminParticipants,
  listAdminVotings,
  type AdminEventSummary,
  type AdminParticipant,
  updateAdminParticipant,
  updateDebate,
} from "../api/debates";

/** Что собираемся удалить — окно подтверждения спрашивает перед запросом. */
type PendingDelete =
  | { kind: "event"; id: number; title: string }
  | { kind: "participant"; eventId: number; id: number; name: string };

const EVENT_TYPE_OPTIONS: EventType[] = ["debate", "tournament", "poll", "competition", "quiz", "other"];

export function AdminPage() {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [participants, setParticipants] = useState<Record<number, AdminParticipant[]>>({});
  const [votings, setVotings] = useState<Record<number, AdminEventSummary[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");

  const filteredEvents = useMemo(() => {
    if (typeFilter === "all") return events;
    return events.filter((e) => (e.eventType ?? "debate") === typeFilter);
  }, [events, typeFilter]);

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
    try {
      if (!participants[eventId]) {
        const loaded = await listAdminParticipants(eventId);
        setParticipants((current) => ({ ...current, [eventId]: loaded }));
      }
      if (!votings[eventId]) {
        const loadedVotings = await listAdminVotings(eventId);
        setVotings((current) => ({ ...current, [eventId]: loadedVotings }));
        // also load participants for each voting
        for (const v of loadedVotings) {
          try {
            const vp = await listAdminParticipants(v.id);
            setParticipants((cur) => ({ ...cur, [v.id]: vp }));
          } catch {}
        }
      }
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
        eventType: event.eventType ?? "debate",
        customTypeLabel: (event as any).customTypeLabel ?? null,
        dateTime: new Date(event.dateTime).toISOString(),
        votingDurationMinutes: event.votingDurationMinutes ?? null,
        votesHidden: event.votesHidden ?? false,
        hiddenFromPublic: event.hiddenFromPublic ?? false,
        showLeaderboard: (event as any).showLeaderboard ?? true,
        showStandings: (event as any).showStandings ?? true,
        showPodium: (event as any).showPodium ?? true,
        broadcastMessage: (event as any).broadcastMessage ?? null,
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
        // try removing from top-level events, then from votings
        setEvents((current) => current.filter((event) => event.id !== eventId));
        setVotings((current) => {
          const next: Record<number, AdminEventSummary[]> = {};
          for (const [pid, list] of Object.entries(current)) {
            next[Number(pid)] = (list as AdminEventSummary[]).filter((v) => v.id !== eventId);
          }
          return next;
        });
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

  const [addingParticipantFor, setAddingParticipantFor] = useState<number | null>(null);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [newParticipantDesc, setNewParticipantDesc] = useState("");
  const [addingVotingFor, setAddingVotingFor] = useState<number | null>(null);
  const [newVotingTitle, setNewVotingTitle] = useState("");

  async function addParticipant(eventId: number) {
    setAddingParticipantFor(eventId);
    setNewParticipantName("");
    setNewParticipantDesc("");
  }
  async function confirmAddParticipant() {
    const eventId = addingParticipantFor;
    if (!eventId || !newParticipantName.trim()) return;
    try {
      const created = await createAdminParticipant(eventId, { name: newParticipantName.trim(), description: newParticipantDesc.trim() || null });
      setParticipants((current) => ({ ...current, [eventId]: [...(current[eventId] ?? []), created] }));
      setAddingParticipantFor(null);
      setNewParticipantName("");
      setNewParticipantDesc("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось добавить участника");
    }
  }

  async function addVoting(eventId: number) {
    setAddingVotingFor(eventId);
    setNewVotingTitle("");
  }
  async function confirmAddVoting() {
    const eventId = addingVotingFor;
    if (!eventId || !newVotingTitle.trim()) return;
    try {
      const created = await createAdminVoting(eventId, { title: newVotingTitle.trim(), participants: [{ name: "Участник 1", description: null }, { name: "Участник 2", description: null }] });
      setVotings((cur) => ({ ...cur, [eventId]: [...(cur[eventId] ?? []), created] }));
      const vp = await listAdminParticipants(created.id);
      setParticipants((cur) => ({ ...cur, [created.id]: vp }));
      setAddingVotingFor(null);
      setNewVotingTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать голосование");
    }
  }

  function updateVotingLocal(parentId: number, votingId: number, patch: Partial<AdminEventSummary>) {
    setVotings((cur) => ({ ...cur, [parentId]: (cur[parentId] ?? []).map((v) => (v.id === votingId ? { ...v, ...patch } : v)) }));
  }

  async function saveVoting(parentId: number, voting: AdminEventSummary) {
    setBusyId(voting.id);
    setError(null);
    try {
      const saved = await updateDebate(voting.id, {
        title: voting.title,
        status: voting.status,
        eventType: voting.eventType ?? "poll",
        customTypeLabel: (voting as any).customTypeLabel ?? null,
        dateTime: new Date(voting.dateTime).toISOString(),
        votingDurationMinutes: voting.votingDurationMinutes ?? null,
        votesHidden: voting.votesHidden ?? false,
        hiddenFromPublic: voting.hiddenFromPublic ?? false,
        showLeaderboard: (voting as any).showLeaderboard ?? true,
        showStandings: (voting as any).showStandings ?? true,
        showPodium: (voting as any).showPodium ?? true,
        broadcastMessage: (voting as any).broadcastMessage ?? null,
      });
      setVotings((cur) => ({ ...cur, [parentId]: (cur[parentId] ?? []).map((v) => (v.id === saved.id ? saved : v)) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить голосование");
    } finally {
      setBusyId(null);
    }
  }

  const navigate = useNavigate();

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Администрирование" showBack onBack={() => navigate("/debates")} rightSlot="profile" />
      <div className="styled-scrollbar mx-auto flex-1 w-full max-w-3xl overflow-y-auto overflow-x-hidden px-5 pb-10 pt-2 lg:px-8 lg:pb-12 lg:pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Protected admin area</p>
            <h1 className="mt-1 text-xl font-bold text-white">Мероприятия</h1>
          </div>
          <Link to="/create"><Button className="inline-flex items-center justify-center gap-1.5 leading-none"><Plus size={16} strokeWidth={2.7} className="shrink-0" /><span className="leading-none translate-y-[0.5px]">Создать</span></Button></Link>
        </div>

        {/* Фильтр по типу мероприятия */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-1.5">
          <span className="ml-2 mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/40"><Filter size={12} /> Тип</span>
          {(["all", ...EVENT_TYPE_OPTIONS] as const).map((opt) => {
            const meta = opt === "all" ? null : EVENT_TYPE_META[opt as EventType];
            const Icon = meta?.Icon;
            return (
            <button key={opt} onClick={() => setTypeFilter(opt as any)} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition", typeFilter === opt ? "bg-white text-black shadow" : "text-white/60 hover:text-white hover:bg-white/10")}>
              {Icon && <Icon size={12} />}{opt === "all" ? "Все" : meta?.label}
            </button>
          )})}

          <span className="ml-auto mr-2 text-xs text-white/30">{filteredEvents.length}/{events.length}</span>
        </div>

        {error && <p className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">{error}</p>}
        {loading && <div className="h-28 animate-pulse rounded-3xl bg-white/5" />}
        {!loading && filteredEvents.length === 0 && <p className="rounded-3xl border border-white/10 p-6 text-center text-sm text-white/50">{events.length===0? "Мероприятий пока нет": "Нет мероприятий этого типа"}</p>}

        <div className="space-y-4">
          {filteredEvents.map((event) => {
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
                    <p className="mt-1 flex items-center gap-2 text-xs text-white/35">
                      <span>ID: {event.id} · участников: {event.participantsCount}</span>
                      {(() => { const meta = getEventTypeMeta(event.eventType as EventType, (event as any).customTypeLabel); const Icon = meta.Icon; return (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                        <Icon size={10} /> {meta.label}
                      </span> )})()}
                    </p>
                  </div>
                  <StatusSelect
                    value={event.status}
                    onChange={(status) => updateEventLocal(event.id, { status })}
                  />
                </div>

                {/* Тип мероприятия — редактирование */}
                <div className="mt-3">
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Тип мероприятия</p>
                  <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
                    {EVENT_TYPE_OPTIONS.map((opt) => {
                      const meta = EVENT_TYPE_META[opt];
                      const Icon = meta.Icon;
                      return (
                      <button key={opt} type="button" onClick={() => updateEventLocal(event.id, { eventType: opt })} className={cn("inline-flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-medium transition", (event.eventType ?? "debate")===opt ? "border-indigo-400/50 bg-indigo-500/20 text-white shadow" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10")}>
                        <Icon size={14} />{meta.label}
                      </button>
                    )})}
                  </div>
                </div>

                <DateTimeField
                  className="mt-3"
                  value={event.dateTime}
                  onChange={(iso) => updateEventLocal(event.id, { dateTime: iso })}
                />

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

                <div
                  className={cn(
                    "mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors duration-300",
                    event.votesHidden
                      ? "border-indigo-300/30 bg-indigo-400/[0.08]"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <IconChip icon={event.votesHidden ? EyeOff : Eye} iconSize={15} tone={event.votesHidden ? "accent" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Скрыть голоса</p>
                    <p className="truncate text-[11px] text-white/35">
                      {event.votesHidden
                        ? "Включено — зрителям участники без цифр"
                        : "Выключено — голоса и проценты видны всем"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={event.votesHidden}
                    aria-label="Скрыть голоса от зрителей"
                    onClick={() => updateEventLocal(event.id, { votesHidden: !event.votesHidden })}
                    className={cn(
                      "relative flex h-[26px] w-11 shrink-0 items-center rounded-full border transition-colors duration-300",
                      event.votesHidden
                        ? "border-indigo-300/50 bg-gradient-to-r from-indigo-500/80 via-violet-500/70 to-sky-400/80 shadow-[0_4px_16px_-4px_rgba(99,102,241,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
                        : "border-white/15 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className="ml-1 h-[18px] w-[18px] shrink-0 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                      animate={{ x: event.votesHidden ? 18 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                <div
                  className={cn(
                    "mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors duration-300",
                    event.hiddenFromPublic
                      ? "border-amber-300/30 bg-amber-400/[0.08]"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <IconChip icon={event.hiddenFromPublic ? UserX : Users} iconSize={15} tone={event.hiddenFromPublic ? "accent" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white">Скрыть от публики</p>
                    <p className="truncate text-[11px] text-white/35">
                      {event.hiddenFromPublic
                        ? "Включено — мероприятие видно только администраторам"
                        : "Выключено — мероприятие видно всем"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={event.hiddenFromPublic}
                    aria-label="Скрыть мероприятие от обычных пользователей"
                    onClick={() => updateEventLocal(event.id, { hiddenFromPublic: !event.hiddenFromPublic })}
                    className={cn(
                      "relative flex h-[26px] w-11 shrink-0 items-center rounded-full border transition-colors duration-300",
                      event.hiddenFromPublic
                        ? "border-amber-300/50 bg-gradient-to-r from-amber-500/80 via-orange-500/70 to-amber-400/80 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
                        : "border-white/15 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className="ml-1 h-[18px] w-[18px] shrink-0 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                      animate={{ x: event.hiddenFromPublic ? 18 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                {(event.eventType === "other") && (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <IconChip icon={EVENT_TYPE_META.other.Icon} iconSize={15} />
                    <input
                      value={(event as any).customTypeLabel ?? ""}
                      onChange={(e) => updateEventLocal(event.id, { customTypeLabel: e.target.value } as any)}
                      placeholder="Название типа — например: Хакатон"
                      maxLength={50}
                      className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                    />
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Вкладки</p>
                  <p className="px-1 text-[11px] leading-relaxed text-white/35">Голосование всегда видно. Остальные можно скрыть.</p>
                  {[
                    { key: "showLeaderboard", label: "Лидеры", icon: Trophy, val: (event as any).showLeaderboard ?? true },
                    { key: "showStandings", label: "Таблица", icon: LayoutGrid, val: (event as any).showStandings ?? true },
                    { key: "showPodium", label: "Пьедестал", icon: Award, val: (event as any).showPodium ?? true },
                  ].map((tab) => (
                    <div key={tab.key} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors", tab.val ? "border-white/10 bg-white/5" : "border-white/5 bg-black/20 opacity-70")}>
                      <IconChip icon={tab.icon} iconSize={15} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">{tab.label}</p>
                        <p className="text-[11px] text-white/35">{tab.val ? "Показывается" : "Скрыта"}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tab.val}
                        onClick={() => updateEventLocal(event.id, { [tab.key]: !tab.val } as any)}
                        className={cn("relative flex h-[26px] w-11 shrink-0 items-center rounded-full border transition-colors", tab.val ? "border-indigo-300/50 bg-gradient-to-r from-indigo-500/80 via-violet-500/70 to-indigo-400/80" : "border-white/15 bg-black/30")}
                      >
                        <motion.span aria-hidden className="ml-1 h-[18px] w-[18px] shrink-0 rounded-full bg-white" animate={{ x: tab.val ? 18 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Текст на экран трансляции</p>
                  <p className="mb-2 px-1 text-[11px] leading-relaxed text-white/35">Показывается крупно по центру на большом экране. Можно менять с телефона — обновится мгновенно.</p>
                  <div className="flex items-center gap-2">
                    <IconChip icon={MonitorPlay} iconSize={15} />
                    <input
                      value={(event as any).broadcastMessage ?? ""}
                      onChange={(e) => updateEventLocal(event.id, { broadcastMessage: e.target.value } as any)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveEvent(event); } }}
                      placeholder="Например: Голосуем до 18:30!"
                      maxLength={200}
                      className="w-full bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                    />
                    {(event as any).broadcastMessage && (
                      <button
                        type="button"
                        onClick={() => updateEventLocal(event.id, { broadcastMessage: "" } as any)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button variant="glass" onClick={() => void saveEvent(event)} disabled={busyId === event.id} className="py-2 text-xs">
                      <MonitorPlay size={14} /> Показать на экране
                    </Button>
                    <span className="self-center text-[10px] text-white/30">Enter — тоже сохранит</span>
                  </div>
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
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    {/* Main participants (if any) — for single-voting events */}
                    {eventParticipants.length > 0 && (
                      <div className="space-y-2">
                        <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Участники мероприятия {event.votingsCount ? `(общие)` : ""}</p>
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
                    {eventParticipants.length === 0 && (
                      <Button variant="glass" fullWidth onClick={() => void addParticipant(event.id)}><Plus size={15} />Добавить участника к мероприятию</Button>
                    )}

                    {/* Votings */}
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">Голосования ({(votings[event.id] ?? []).length})</p>
                        <Button variant="glass" onClick={() => void addVoting(event.id)} className="py-1.5 text-xs"><Plus size={12} />Добавить голосование</Button>
                      </div>
                      {(votings[event.id] ?? []).length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/30">Пока нет отдельных голосований — используется общий список участников. Добавьте голосование, чтобы разбить мероприятие.</p>
                      ) : (
                        <div className="space-y-3">
                          {(votings[event.id] ?? []).map((voting) => {
                            const vParticipants = participants[voting.id] ?? [];
                            return (
                              <div key={voting.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <textarea value={voting.title} onChange={(e) => updateVotingLocal(event.id, voting.id, { title: e.target.value })} rows={2} className="w-full resize-none bg-transparent text-sm font-semibold text-white outline-none" placeholder="Название голосования" />
                                  <Button variant="ghost" className="text-rose-300 p-1" onClick={() => setPendingDelete({ kind: "event", id: voting.id, title: voting.title })} aria-label="Удалить голосование"><Trash2 size={14} /></Button>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <StatusSelect value={voting.status} onChange={(status) => updateVotingLocal(event.id, voting.id, { status } as any)} />
                                  <span className="text-[11px] text-white/30">ID: {voting.id}</span>
                                </div>
                                <DateTimeField className="mt-2" value={voting.dateTime} onChange={(iso) => updateVotingLocal(event.id, voting.id, { dateTime: iso })} />
                                <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                  <IconChip icon={Timer} iconSize={13} />
                                  <input type="number" min={1} max={1440} value={voting.votingDurationMinutes ?? ""} onChange={(e) => { const raw = e.target.value.trim(); const parsed = raw === "" ? null : Number(raw); const minutes = parsed === null || !Number.isFinite(parsed) ? null : Math.min(1440, Math.max(1, Math.round(parsed))); updateVotingLocal(event.id, voting.id, { votingDurationMinutes: minutes } as any); }} placeholder="—" className="w-14 rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-center text-xs text-white outline-none" />
                                  <span className="text-[11px] text-white/40">мин</span>
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <Button variant="glass" onClick={() => void saveVoting(event.id, voting)} disabled={busyId === voting.id} className="py-1.5 text-xs"><Save size={13} />Сохранить</Button>
                                </div>
                                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
                                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Текст на трансляцию</p>
                                  <div className="flex items-center gap-2">
                                    <IconChip icon={MonitorPlay} iconSize={13} />
                                    <input value={(voting as any).broadcastMessage ?? ""} onChange={(e) => updateVotingLocal(event.id, voting.id, { broadcastMessage: e.target.value } as any)} placeholder="Текст для экрана" maxLength={200} className="w-full bg-transparent text-xs text-white placeholder:text-white/30 outline-none" />
                                  </div>
                                  <div className="mt-1.5 flex gap-2">
                                    <Button variant="glass" onClick={() => void saveVoting(event.id, voting)} disabled={busyId === voting.id} className="py-1.5 text-[11px]"><MonitorPlay size={12} />Показать</Button>
                                    {(voting as any).broadcastMessage && <button type="button" onClick={() => updateVotingLocal(event.id, voting.id, { broadcastMessage: "" } as any)} className="text-[11px] text-white/40 hover:text-white">Очистить</button>}
                                  </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                  <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">Участники голосования ({vParticipants.length})</p>
                                  {vParticipants.map((participant) => (
                                    <div key={participant.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
                                      <input value={participant.name} onChange={(e) => setParticipants((cur) => ({ ...cur, [voting.id]: cur[voting.id].map((it) => it.id === participant.id ? { ...it, name: e.target.value } : it) }))} className="w-full bg-transparent text-xs font-semibold text-white outline-none" />
                                      <input value={participant.description ?? ""} onChange={(e) => setParticipants((cur) => ({ ...cur, [voting.id]: cur[voting.id].map((it) => it.id === participant.id ? { ...it, description: e.target.value } : it) }))} placeholder="Описание" className="mt-1 w-full bg-transparent text-[11px] text-white/55 outline-none" />
                                      <div className="mt-1.5 flex gap-1.5">
                                        <Button variant="glass" onClick={() => void saveParticipant(voting.id, participant)} disabled={busyId === participant.id} className="py-1 text-[11px]"><Check size={11} />Сохранить</Button>
                                        <Button variant="ghost" className="text-rose-300 py-1 text-[11px]" onClick={() => setPendingDelete({ kind: "participant", eventId: voting.id, id: participant.id, name: participant.name })}><Trash2 size={11} /></Button>
                                      </div>
                                    </div>
                                  ))}
                                  <Button variant="glass" fullWidth onClick={() => void addParticipant(voting.id)} className="py-1.5 text-xs"><Plus size={12} />Добавить участника</Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* App-style modals for adding participant / voting */}
      {addingParticipantFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="frosted-panel w-full max-w-md rounded-3xl border border-white/15 p-6">
            <h3 className="text-base font-bold text-white">Новый участник</h3>
            <p className="mt-1 text-xs text-white/40">Добавляется к мероприятию #{addingParticipantFor}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Имя</label>
                <input value={newParticipantName} onChange={(e) => setNewParticipantName(e.target.value)} placeholder="Например: Команда А" autoFocus className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-300/50" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Описание (необязательно)</label>
                <input value={newParticipantDesc} onChange={(e) => setNewParticipantDesc(e.target.value)} placeholder="Позиция, слоган — до 2000 символов" className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-indigo-300/50" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddingParticipantFor(null)}>Отмена</Button>
              <Button onClick={() => void confirmAddParticipant()} disabled={!newParticipantName.trim()}>Добавить</Button>
            </div>
          </div>
        </div>
      )}
      {addingVotingFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="frosted-panel w-full max-w-md rounded-3xl border border-white/15 p-6">
            <h3 className="text-base font-bold text-white">Новое голосование</h3>
            <p className="mt-1 text-xs text-white/40">Будет создано в мероприятии #{addingVotingFor} с двумя участниками по умолчанию</p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Название</label>
              <input value={newVotingTitle} onChange={(e) => setNewVotingTitle(e.target.value)} placeholder="Например: Финал — лучший проект" autoFocus className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-300/50" />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddingVotingFor(null)}>Отмена</Button>
              <Button onClick={() => void confirmAddVoting()} disabled={!newVotingTitle.trim()}>Создать</Button>
            </div>
          </div>
        </div>
      )}

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
