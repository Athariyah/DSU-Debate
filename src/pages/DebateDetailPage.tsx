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
import { useDebateSocket } from "../hooks/useDebateSocket";
import { getVotedParticipant } from "../utils/votedStore";
import { cn } from "../utils/cn";
import type { DebateEvent, Participant } from "../types";

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
  const [activeTab, setActiveTab] = useState<"vote" | "leaders" | "table" | "podium">("vote");
  const isAdmin = isAdminAuthenticated();

  const loadEvent = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchDebateById(id)
      .then((data) => {
        if (!data) setError("Дебат не найден");
        setEvent(data);
        setJustVotedFor(getVotedParticipant(id)?.participantId ?? null);
      })
      .catch(() => setError("Не удалось загрузить дебат"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) {
      setError("Некорректный идентификатор дебата");
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
      <div className="flex h-full flex-col">
        <TopBar showBack rightSlot="menu" />
        <div className="flex-1 px-5"><div className="h-40 animate-pulse rounded-3xl bg-white/5" /></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col">
        <TopBar showBack />
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-rose-300">
          {error ?? "Дебат не найден"}
        </div>
      </div>
    );
  }

  // Пока страница была открыта, дебат скрыли от обычных пользователей:
  // публичные данные больше недоступны, показываем заглушку.
  if (hiddenFromPublic) {
    return (
      <div className="flex h-full flex-col">
        <TopBar showBack />
        <div className="flex flex-1 items-center justify-center px-5 text-center">
          <div className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10">
              <UserX size={20} className="text-amber-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Дебат скрыт организатором</p>
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
    <div className="relative flex h-full flex-col">
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

      <div className="no-scrollbar mx-auto flex-1 w-full max-w-2xl overflow-y-auto px-5 pb-8 lg:px-8">
        <Badge tone={eventStatus === "active" ? "active" : "neutral"}>
          {eventStatus === "active" ? "Активный дебат" : eventStatus === "completed" ? "Завершён" : "Скоро"}
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
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {event.eventType === "tournament" ? "Турнир" : event.eventType === "poll" ? "Опрос" : event.eventType === "competition" ? "Соревнование" : event.eventType === "quiz" ? "Квиз" : event.eventType === "other" ? "Мероприятие" : "Дебаты"}
        </div>

        {/* Вкладки: Голосование / Лидеры / Таблица / Пьедестал — сохраняем привычный UI, не ломаем логику */}
        <div className="mt-5 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-1">
          {([
            ["vote", "Голосование"],
            ["leaders", "Лидеры"],
            ["table", "Таблица"],
            ["podium", "Пьедестал"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition", activeTab === key ? "bg-white text-black shadow" : "text-white/60 hover:text-white hover:bg-white/10")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === "vote" && (
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
          )}
          {activeTab === "leaders" && (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <LeaderboardTab eventId={event.id} />
            </Suspense>
          )}
          {activeTab === "table" && (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <StandingsTab eventId={event.id} />
            </Suspense>
          )}
          {activeTab === "podium" && (
            <Suspense fallback={<div className="h-20 animate-pulse rounded-2xl bg-white/5" />}>
              <PodiumTab eventId={event.id} />
            </Suspense>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-2 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2 lg:px-8">
        {voted ? (
          <>
            <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-sm font-semibold text-emerald-300">
              <CheckCircle2 size={18} />
              Ваш голос учтён
            </div>
            <Button variant="glass" fullWidth onClick={() => navigate("/home")}>
              <Home size={16} />
              На главный экран
            </Button>
          </>
        ) : (
          <Button fullWidth disabled={!canVote} onClick={() => setVoteModalOpen(true)}>
            {canVote
              ? "Голосовать"
              : timerExpired
                ? "Время голосования истекло"
                : "Голосование ещё не началось"}
          </Button>
        )}
      </div>

      <VoteModal
        event={event}
        open={voteModalOpen}
        onClose={() => setVoteModalOpen(false)}
        onVoted={(participantId) => {
          setJustVotedFor(participantId);
          setVoteModalOpen(false);
        }}
      />
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
