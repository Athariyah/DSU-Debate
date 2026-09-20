import { useCallback, useEffect, useState, lazy, Suspense, useMemo, memo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  EyeOff,
  Home,
  Link2,
  MonitorPlay,
  RefreshCw,
  Settings2,
  Timer,
  UserX,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ParticipantResult } from "../components/debate/ParticipantResult";
import { VoteModal } from "../components/debate/VoteModal";
import { fetchDebateById, isAdminAuthenticated } from "../api/debates";
import { getSocket } from "../lib/socket";
import { useDebateSocket } from "../hooks/useDebateSocket";
import { getVotedParticipant } from "../utils/votedStore";
import { cn } from "../utils/cn";
import type { DebateEvent, Participant } from "../types";
import { getEventTypeMeta } from "../utils/eventType";

import { formatCountdown } from "../utils/formatCountdown";

const LeaderboardTab = lazy(() => import("../components/event/LeaderboardTab").then(m => ({ default: m.LeaderboardTab })));
const StandingsTab = lazy(() => import("../components/event/StandingsTab").then(m => ({ default: m.StandingsTab })));
const PodiumTab = lazy(() => import("../components/event/PodiumTab").then(m => ({ default: m.PodiumTab })));

const ParticipantResultMemo = memo(ParticipantResult);

const EMPTY_PARTICIPANTS: Participant[] = [];

export function DebateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<DebateEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  /** Дебат скрыли от публики, пока страница была открыта (event:public_visibility). */
  const [hiddenFromPublic, setHiddenFromPublic] = useState(false);
  const votedRecord = event ? getVotedParticipant(event.id) : null;
  const [justVotedFor, setJustVotedFor] = useState<number | null>(votedRecord?.participantId ?? null);
  const [activeTab, setActiveTab] = useState<string>("vote");
  const isAdmin = isAdminAuthenticated();

  // Если админ скрыл вкладку — переключаем на первое голосование
  useEffect(() => {
    if (!event) return;
    if (activeTab === "leaders" && event.showLeaderboard === false) setActiveTab(event.votings && event.votings.length > 0 ? "vote-0" : "vote");
    if (activeTab === "table" && event.showStandings === false) setActiveTab(event.votings && event.votings.length > 0 ? "vote-0" : "vote");
    if (activeTab === "podium" && event.showPodium === false) setActiveTab(event.votings && event.votings.length > 0 ? "vote-0" : "vote");
    // If activeTab is vote-N and votings changed, ensure it stays valid
    if (activeTab.startsWith("vote-")) {
      const idx = parseInt(activeTab.split("-")[1] ?? "0", 10);
      if (!event.votings || idx >= event.votings.length) setActiveTab(event.votings && event.votings.length > 0 ? "vote-0" : "vote");
    }
  }, [event?.showLeaderboard, event?.showStandings, event?.showPodium, activeTab, event]);

  const loadEvent = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchDebateById(id)
      .then((data) => {
        if (!data) setError("Мероприятие не найдено");
        setEvent(data);
        setJustVotedFor(getVotedParticipant(id)?.participantId ?? null);
      })
      .catch(() => setError("Не удалось загрузить мероприятие"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) {
      setError("Некорректный идентификатор мероприятия");
      setLoading(false);
      return;
    }
    // При смене дебата сбрасываем признак «скрыт от публики» предыдущего.
    setHiddenFromPublic(false);
    loadEvent();
  }, [id, loadEvent]);

  const { participants, totalVotes, eventStatus, votesHidden, status } = useDebateSocket({
    eventId: event?.id,
    initialStatus: event?.status ?? "upcoming",
    initialParticipants: event?.participants ?? EMPTY_PARTICIPANTS,
    initialTotalVotes: event?.totalVotes ?? 0,
    initialVotesHidden: event?.votesHidden ?? false,
    onPublicVisibility: (hidden) => {
      if (hidden) {
        // Админ скрыл дебат: данные публичных маршрутов больше недоступны —
        // показываем заглушку вместо последнего состояния.
        setHiddenFromPublic(true);
      } else {
        // Скрыли обратно: данные снова отдаёт сервер — перечитываем их.
        setHiddenFromPublic(false);
        loadEvent();
      }
    },
  });

  // Таймер голосования: тикаем раз в секунду, пока дебат активен и есть
  // дедлайн. Когда интервал истекает — кнопка блокируется (бэкенд в этот же
  // момент переводит событие в completed и рассылает смену статуса).
  // ВАЖНО: хуки — до всех ранних return ниже.
  const endsAtMs = event?.votingEndsAt ? new Date(event.votingEndsAt).getTime() : null;
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (eventStatus !== "active" || endsAtMs === null) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [eventStatus, endsAtMs]);

  const voteList = useMemo(() => participants.map((p, idx) => (
    <ParticipantResultMemo key={p.id} participant={p} index={idx} highlighted={p.id === justVotedFor} hidden={votesHidden} />
  )), [participants, justVotedFor, votesHidden]);

  async function copyLink() {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMenuNotice("Ссылка скопирована");
    } catch {
      setMenuNotice("Не удалось скопировать ссылку");
    }
    setTimeout(() => setMenuNotice(null), 1600);
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col lg:pl-64">
        <TopBar showBack rightSlot="menu" />
        <div className="flex-1 px-5"><div className="h-40 animate-pulse rounded-3xl bg-white/5" /></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col lg:pl-64">
        <TopBar showBack />
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-rose-300">
          {error ?? "Мероприятие не найдено"}
        </div>
      </div>
    );
  }

  // Пока страница была открыта, дебат скрыли от обычных пользователей:
  // публичные данные больше недоступны, показываем заглушку.
  if (hiddenFromPublic) {
    return (
      <div className="flex h-full flex-col lg:pl-64">
        <TopBar showBack />
        <div className="flex flex-1 items-center justify-center px-5 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10">
              <UserX size={20} className="text-amber-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Мероприятие скрыто организатором</p>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-xs leading-relaxed text-white/40">
                Он снова появится на главном экране, когда организатор сделает его публичным.
              </p>
            </div>
            <Button variant="glass" onClick={() => navigate("/home")}>
              <Home size={16} />
              На главный экран
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const date = new Date(event.scheduledAt);
  const timeLabel = `${date.toLocaleDateString("ru-RU")}, ${date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  const voted = Boolean(justVotedFor);

  // Таймер голосования: тикаем раз в секунду, пока дебат активен и есть
  // дедлайн. Когда интервал истекает — кнопка блокируется (бэкенд в этот же
  // момент переводит событие в completed и рассылает смену статуса).
  const msLeft = endsAtMs === null ? null : endsAtMs - nowTick;
  const timerExpired = msLeft !== null && msLeft <= 0;
  const canVote = eventStatus === "active" && !timerExpired;

  return (
    <div className="relative flex h-full flex-col lg:pl-64">
      <TopBar showBack rightSlot="menu" onMenuClick={() => setMenuOpen((open) => !open)} />

      {menuOpen && (
        <>
          <button
            className="absolute inset-0 z-30 cursor-default"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          />
          <div className="frosted-panel absolute right-5 top-16 z-40 w-60 overflow-hidden rounded-2xl border border-white/15">
            <MenuItem
              icon={MonitorPlay}
              label="Трансляция на экран"
              className="hidden lg:flex"
              onClick={() => {
                setMenuOpen(false);
                navigate(`/broadcast/${event.id}`);
              }}
            />
            <MenuItem icon={Link2} label="Скопировать ссылку" onClick={copyLink} />
            <MenuItem
              icon={RefreshCw}
              label="Обновить"
              onClick={() => {
                setMenuOpen(false);
                loadEvent();
              }}
            />
            {isAdmin && (
              <MenuItem
                icon={Settings2}
                label="Управлять в админке"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/admin");
                }}
              />
            )}
          </div>
        </>
      )}

      {menuNotice && (
        <div className="frosted-panel absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full border border-white/15 px-4 py-2 text-xs text-white/80">
          {menuNotice}
        </div>
      )}

      <div className="styled-scrollbar mx-auto flex-1 w-full max-w-2xl overflow-y-auto overflow-x-hidden px-5 pb-8 lg:px-8">
        <Badge tone={eventStatus === "active" ? "active" : "neutral"}>
          {eventStatus === "active" ? "Активное мероприятие" : eventStatus === "completed" ? "Завершён" : "Скоро"}
        </Badge>

        <h1 className="mt-3 text-[22px] font-bold leading-snug text-white">{event.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} />
            {event.participantsCount} участника
          </span>
          <span className="text-white/20">·</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={14} />
            {timeLabel}
          </span>
          <span className="text-white/20">·</span>
          <span className="inline-flex items-center gap-1.5 text-white/40">
            {status === "live" ? <Wifi size={13} className="text-emerald-400" /> : <WifiOff size={13} />}
            {status === "live"
              ? "Live"
              : status === "connecting"
                ? "Подключение…"
                : status === "offline"
                  ? "Нет realtime-соединения"
                  : "Демо-режим"}
          </span>
        </div>

        {eventStatus === "active" && endsAtMs !== null && (
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-2 self-start rounded-full border px-3.5 py-1.5 text-[13px] font-semibold tabular-nums",
              timerExpired
                ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
                : "border-indigo-300/30 bg-indigo-400/10 text-indigo-200 shadow-[0_6px_20px_-8px_rgba(99,102,241,0.6)]"
            )}
          >
            <Timer size={14} />
            {timerExpired ? "Таймер истёк — голосование закрывается" : `Осталось ${formatCountdown(msLeft!)}`}
          </div>
        )}

        {/* Тип мероприятия — визуальный контекст */}
        {(() => { const meta = getEventTypeMeta(event.eventType, event.customTypeLabel); const Icon = meta.Icon; return (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          <Icon size={12} />{meta.label}
        </div> )})()}

        {/* Вкладки: голосования (каждое как отдельный таб) + таблицы/пьедестал для основных участников */}
        {(() => {
          const votings = event.votings ?? [];
          const tabs: Array<[string, string]> = [];
          if (votings.length > 0) {
            votings.forEach((v, idx) => {
              const label = votings.length === 1 ? (v.title || "Голосование") : `Голосование №${idx + 1}`;
              // Если у голосования есть заголовок, показываем его после номера
              const fullLabel = v.title && votings.length > 1 ? `${label}: ${v.title}` : label;
              tabs.push([`vote-${idx}`, fullLabel]);
            });
          } else {
            tabs.push(["vote", "Голосование"]);
          }
          if (event.showLeaderboard ?? true) tabs.push(["leaders", "Лидеры"]);
          if (event.showStandings ?? true) tabs.push(["table", "Таблица"]);
          if (event.showPodium ?? true) tabs.push(["podium", "Пьедестал"]);
          return (
            <div className="mt-5 flex gap-1.5 overflow-x-auto styled-scrollbar rounded-2xl border border-white/10 bg-black/20 p-1">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition", activeTab === key ? "bg-white text-black shadow" : "text-white/60 hover:text-white hover:bg-white/10")}
                >
                  {label}
                </button>
              ))}
            </div>
          );
        })()}

        <div className="mt-6">
          {(activeTab === "vote" || activeTab.startsWith("vote-")) && (
            <>
              {(() => {
                const votings = event.votings ?? [];
                if (votings.length === 0) {
                  // Одиночное голосование — показываем основных участников
                  return (
                    <>
                      <div className="space-y-3">
                        {voteList}
                      </div>
                      {votesHidden ? (
                        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-white/30">
                          <EyeOff size={13} className="opacity-70" />
                          Результаты скрыты организатором
                        </p>
                      ) : (
                        <p className="mt-4 text-center text-xs text-white/30">Всего голосов: {totalVotes}</p>
                      )}
                    </>
                  );
                }
                // Множественные голосования — каждое в своём табе
                const idx = activeTab === "vote" ? 0 : parseInt(activeTab.split("-")[1] ?? "0", 10);
                const voting = votings[Math.min(idx, votings.length - 1)];
                if (!voting) return null;
                // Для голосования используем его участников; socket для основного события не подходит — показываем статично
                // Но если голосование имеет live данные, они уже в voting.participants
                return (
                  <VotingTab voting={voting} votesHidden={votesHidden} />
                );
              })()}
            </>
          )}
          {activeTab === "leaders" && (event.showLeaderboard ?? true) && (
            eventStatus !== "completed" ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <span className="text-lg">🏆</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Лидеры будут определены после завершения</p>
                <p className="mx-auto mt-1 max-w-[28ch] text-xs text-white/40">Голосование ещё не завершено — итоги скрыты до финала</p>
              </div>
            ) : (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <LeaderboardTab eventId={event.id} />
            </Suspense>
            )
          )}
          {activeTab === "table" && (event.showStandings ?? true) && (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <StandingsTab eventId={event.id} participants={participants} eventType={event.eventType} />
            </Suspense>
          )}
          {activeTab === "podium" && (event.showPodium ?? true) && (
            eventStatus !== "completed" ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <span className="text-lg">🥇</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Пьедестал пока пуст</p>
                <p className="mx-auto mt-1 max-w-[28ch] text-xs text-white/40">Призовые места появятся после завершения мероприятия</p>
              </div>
            ) : (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <PodiumTab eventId={event.id} />
            </Suspense>
            )
          )}
        </div>
      </div>

      {(() => {
        // Кнопка голосования — только во вкладке голосования, на Лидерах/Таблице/Пьедестале её не показываем
        const isVotingTab = activeTab.startsWith("vote");
        if (!isVotingTab) return null;
        return (
        <div className="mx-auto w-full max-w-2xl space-y-2 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2 lg:px-8">
        {voted ? (
          <>
            <div className="glass-panel flex flex-col items-center justify-center gap-1 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 size={18} />
                Ваш голос учтён{participants.find((p) => p.id === justVotedFor) ? ` — ${participants.find((p) => p.id === justVotedFor)!.name}` : ""}
              </span>
              <span className="text-xs text-emerald-200/60">Можно изменить, пока голосование активно</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button fullWidth disabled={!canVote} onClick={() => setVoteModalOpen(true)}>
                {canVote ? "Изменить голос" : timerExpired ? "Время вышло" : "Голосование закрыто"}
              </Button>
              <Button variant="glass" fullWidth onClick={() => navigate("/home")}>
                <Home size={16} />
                На главный
              </Button>
            </div>
          </>
        ) : (
          <Button fullWidth disabled={!canVote} onClick={() => setVoteModalOpen(true)}>
            {canVote ? "Голосовать" : timerExpired ? "Время голосования истекло" : "Голосование ещё не началось"}
          </Button>
        )}
      </div>
        );
      })()}

      <VoteModal
        event={event}
        open={voteModalOpen}
        preselectedParticipantId={justVotedFor}
        onClose={() => setVoteModalOpen(false)}
        onVoted={(participantId) => {
          setJustVotedFor(participantId);
          setVoteModalOpen(false);
        }}
      />
    </div>
  );
}

function VotingTab({ voting, votesHidden }: { voting: any; votesHidden: boolean }) {
  const [localVoting, setLocalVoting] = useState(voting);
  const [justVoted] = useState<number | null>(null);
  useEffect(() => setLocalVoting(voting), [voting]);
  // Подписываемся на обновления голосов для этого голосования
  useEffect(() => {
    if (!localVoting) return;
    const socket = getSocket();
    const handler = (payload: any) => {
      if (Number(payload.eventId) !== Number(localVoting.id)) return;
      if (Array.isArray(payload.participants)) {
        setLocalVoting((prev: any) => ({ ...prev, participants: payload.participants.map((p: any) => ({ id: p.id ?? p.participantId, eventId: localVoting.id, name: p.name, subtitle: p.description ?? p.subtitle, votesCount: p.votesCount, percentage: p.percentage })), totalVotes: payload.totalVotes }));
      }
    };
    socket.on("vote:update", handler);
    socket.on("voteUpdate", handler);
    return () => { socket.off("vote:update", handler); socket.off("voteUpdate", handler); };
  }, [localVoting?.id]);
  const participants = (localVoting.participants ?? []) as Participant[];
  const totalVotes = localVoting.totalVotes ?? participants.reduce((a: number, p: Participant) => a + (p.votesCount ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{localVoting.title || `Голосование`}</h3>
        <span className="text-xs text-white/40">ID {localVoting.id} · {participants.length} участника</span>
      </div>
      <div className="space-y-3">
        {participants.map((p, idx) => (
          <ParticipantResultMemo key={p.id} participant={p} index={idx} highlighted={p.id === justVoted} hidden={votesHidden} />
        ))}
        {participants.length === 0 && <p className="py-6 text-center text-sm text-white/40">Участники не добавлены</p>}
      </div>
      {votesHidden ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-white/30"><EyeOff size={13} className="opacity-70" />Результаты скрыты организатором</p>
      ) : (
        <p className="text-center text-xs text-white/30">Всего голосов: {totalVotes}</p>
      )}
      {justVoted && <p className="text-center text-xs text-emerald-300">Ваш голос за {participants.find(pp => pp.id === justVoted)?.name} учтён</p>}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: typeof Link2;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/10",
        className
      )}
    >
      <Icon size={16} className="text-white opacity-50" />
      {label}
    </button>
  );
}
