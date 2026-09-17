import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock3, Loader2, Maximize2, Minimize2, Wifi, WifiOff, X } from "lucide-react";
import { fetchDebateById } from "../api/debates";
import { useDebateSocket, type RealtimeStatus } from "../hooks/useDebateSocket";
import { AnimatedNumber } from "../components/ui/AnimatedNumber";
import { BroadcastParticipantCard } from "../components/broadcast/BroadcastParticipantCard";
import { WinnerReveal } from "../components/broadcast/WinnerReveal";
import { computeStandings } from "../components/broadcast/standings";
import { cn } from "../utils/cn";
import { formatCountdown } from "../utils/formatCountdown";
import type { DebateEvent, DebateStatus, Participant } from "../types";

const EMPTY_PARTICIPANTS: Participant[] = [];

/** Как часто перечитывать результаты по REST, если realtime-канал не жив. */
const FALLBACK_POLL_MS = 5000;

const STATUS_TEXT: Record<DebateStatus, string> = {
  active: "Голосование идёт",
  upcoming: "Голосование ещё не началось",
  completed: "Голосование завершено",
};

const CONNECTION_TEXT: Record<RealtimeStatus, string> = {
  live: "Realtime",
  connecting: "Подключение…",
  offline: `Обновление каждые ${FALLBACK_POLL_MS / 1000} с`,
  "demo-offline": "Демо-режим",
};

/**
 * Экран трансляции голосования для больших экранов (телевизор, проектор).
 * Открывается из меню «три точки» на странице дебата по адресу
 * `/broadcast/:id`. Показывает тему голосования, участников с их позицией,
 * количество голосов, процент и статус — всё обновляется в реальном времени.
 * Как только статус становится «завершён», проигрывается анимация итогов.
 */
export function BroadcastPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<DebateEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1920 : window.innerWidth
  );
  const revealedRef = useRef(false);

  /** Назад в приложение: если экран открыт прямой ссылкой — на страницу дебата. */
  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else if (id) navigate(`/debate/${id}`);
  }, [id, navigate]);

  /** silent = true: без скелетона, чтобы экран не мигал на фоновых обновлениях. */
  const loadEvent = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchDebateById(id);
        if (!data) {
          setError("Дебат не найден");
          return;
        }
        setEvent(data);
        setError(null);
      } catch {
        // На уже открытом экране ошибку показываем, но данные не стираем:
        // трансляция продолжает показывать последние известные результаты.
        if (!silent) setError("Не удалось загрузить дебат");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const { participants, totalVotes, eventStatus, status } = useDebateSocket({
    eventId: event?.id,
    initialStatus: event?.status ?? "upcoming",
    initialParticipants: event?.participants ?? EMPTY_PARTICIPANTS,
    initialTotalVotes: event?.totalVotes ?? 0,
  });

  // Подстраховка для большого экрана: если realtime-соединения нет, регулярно
  // перечитываем REST, чтобы трансляция не «застыла» на старых цифрах.
  useEffect(() => {
    if (status === "live") return;
    const timer = window.setInterval(() => void loadEvent(true), FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, loadEvent]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Итоги показываем один раз за переход в статус «завершён» — новые голоса
  // не должны заново запускать анимацию.
  useEffect(() => {
    if (eventStatus !== "completed") {
      revealedRef.current = false;
      setRevealOpen(false);
      return;
    }
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealOpen(true);
  }, [eventStatus]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (revealOpen) setRevealOpen(false);
      else goBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealOpen, goBack]);

  const standings = useMemo(() => computeStandings(participants), [participants]);
  const columns = useMemo(
    () => columnsFor(participants.length, viewportWidth),
    [participants.length, viewportWidth]
  );

  // Таймер голосования на большом экране: сколько осталось до автостопа.
  const votingEndsAtMs = event?.votingEndsAt ? new Date(event.votingEndsAt).getTime() : null;
  const votingMsLeft =
    votingEndsAtMs !== null && eventStatus === "active"
      ? votingEndsAtMs - clock.getTime()
      : null;

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Браузер не разрешил полный экран (например, без жеста пользователя) —
      // это не ломает трансляцию.
    }
  }

  if (!id) {
    return <BroadcastFallback text="Некорректный адрес трансляции" onBack={() => navigate("/debates")} />;
  }

  if (loading && !event) {
    return (
      <BroadcastFallback
        text="Загрузка трансляции…"
        icon={<Loader2 size={28} className="animate-spin text-white opacity-50" />}
        onBack={goBack}
      />
    );
  }

  if (!event) {
    return <BroadcastFallback text={error ?? "Дебат не найден"} onBack={goBack} />;
  }

  const finished = eventStatus === "completed";
  const scheduled = new Date(event.scheduledAt);

  return (
    <div className="broadcast-bg relative flex min-h-dvh w-full flex-col overflow-hidden font-sans text-white">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-[clamp(1rem,3vw,3.5rem)] pt-[clamp(1rem,2.5vw,2.5rem)]">
        <div className="flex min-w-0 items-center gap-4">
          <StatusPill status={eventStatus} />
          <span className="hidden text-[clamp(0.65rem,0.95vw,1.1rem)] font-semibold uppercase tracking-[0.35em] text-white/30 sm:inline">
            DSU Debate
          </span>
        </div>

        <div className="flex items-center gap-[clamp(0.75rem,2vw,2.5rem)]">
          <div className="text-right">
            <span className="block text-[clamp(1.1rem,2.1vw,2.5rem)] font-bold leading-none tabular-nums text-white">
              <AnimatedNumber value={totalVotes} />
            </span>
            <span className="mt-1 block text-[clamp(0.55rem,0.85vw,1rem)] uppercase tracking-[0.2em] text-white/35">
              всего голосов
            </span>
          </div>

          {votingMsLeft !== null && (
            <div className="hidden text-right md:block">
              <span
                className={cn(
                  "flex items-center justify-end gap-2 text-[clamp(1.1rem,2.1vw,2.5rem)] font-bold leading-none tabular-nums",
                  votingMsLeft <= 0 ? "text-rose-300" : "text-indigo-200"
                )}
              >
                <Clock3 size="1em" className="opacity-70" />
                {votingMsLeft > 0 ? formatBroadcastCountdown(votingMsLeft) : "00:00"}
              </span>
              <span className="mt-1 block text-[clamp(0.55rem,0.85vw,1rem)] uppercase tracking-[0.2em] text-white/35">
                {votingMsLeft > 0 ? "до конца голосования" : "таймер истёк"}
              </span>
            </div>
          )}

          <span className="text-[clamp(0.9rem,1.6vw,1.9rem)] font-semibold tabular-nums text-white/70">
            {clock.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[clamp(0.6rem,0.85vw,1rem)] font-medium",
              status === "live"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-white/45"
            )}
          >
            {status === "live" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {CONNECTION_TEXT[status]}
          </span>

          <div className="flex items-center gap-1">
            <IconButton label={isFullscreen ? "Выйти из полного экрана" : "Во весь экран"} onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            <IconButton label="Закрыть трансляцию" onClick={goBack}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="px-[clamp(1rem,3vw,3.5rem)] pt-[clamp(0.75rem,2vw,2rem)]">
        <p className="text-[clamp(0.65rem,0.95vw,1.1rem)] font-semibold uppercase tracking-[0.3em] text-indigo-300/70">
          Тема голосования
        </p>
        <h1 className="mt-2 max-w-[40ch] text-[clamp(1.5rem,3.8vw,4.5rem)] font-extrabold leading-[1.05] tracking-tight">
          {event.title}
        </h1>
        <p className="mt-2 text-[clamp(0.75rem,1.25vw,1.5rem)] text-white/45">
          {STATUS_TEXT[eventStatus]} · {scheduled.toLocaleDateString("ru-RU")},{" "}
          {scheduled.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
          {finished
            ? "итоги подведены"
            : eventStatus === "active"
              ? "результаты обновляются в реальном времени"
              : "старт по расписанию"}
        </p>
      </div>

      <main className="no-scrollbar flex-1 overflow-y-auto px-[clamp(1rem,3vw,3.5rem)] pb-[clamp(1rem,2.5vw,2.5rem)] pt-[clamp(0.75rem,2vw,2rem)]">
        {participants.length === 0 ? (
          <p className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center text-[clamp(0.9rem,1.4vw,1.75rem)] text-white/45">
            Участники ещё не добавлены
          </p>
        ) : (
          <div
            className="grid gap-[clamp(0.75rem,1.5vw,2rem)]"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {standings.sorted.map((participant, index) => (
              <BroadcastParticipantCard
                key={participant.id}
                participant={participant}
                index={index}
                leader={eventStatus === "active" && standings.leaderUnique && standings.top[0]?.id === participant.id}
                winner={finished && standings.winner?.id === participant.id}
                loser={finished && standings.loser?.id === participant.id}
              />
            ))}
          </div>
        )}
      </main>

      <WinnerReveal
        topic={event.title}
        standings={standings}
        totalVotes={totalVotes}
        open={revealOpen}
        onDismiss={() => setRevealOpen(false)}
      />
    </div>
  );
}

/** Таймер на большом экране использует общий человекочитаемый формат
 * (для длинных интервалов — «N дн. H ч» вместо гигантского числа часов). */
const formatBroadcastCountdown = formatCountdown;

/** Число колонок сетки: на телевизоре — по количеству участников, на узком экране — одна. */
function columnsFor(count: number, width: number): number {
  if (count <= 1) return 1;
  if (width < 700) return 1;
  if (width < 1100) return Math.min(count, 2);
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function StatusPill({ status }: { status: DebateStatus }) {
  const tone =
    status === "active"
      ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
      : status === "completed"
        ? "border-white/15 bg-white/10 text-white/80"
        : "border-white/10 bg-white/5 text-white/50";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[clamp(0.65rem,1vw,1.2rem)] font-bold uppercase tracking-[0.2em]",
        tone
      )}
    >
      {status === "active" && (
        <motion.span
          aria-hidden
          className="h-2 w-2 rounded-full bg-rose-400"
          animate={{ opacity: [1, 0.25, 1], scale: [1, 0.8, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {status === "active" ? "В эфире" : status === "completed" ? "Завершено" : "Скоро"}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 transition hover:border-white/25 hover:text-white"
    >
      {children}
    </button>
  );
}

function BroadcastFallback({
  text,
  icon,
  onBack,
}: {
  text: string;
  icon?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="broadcast-bg flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-8 text-center font-sans text-white">
      <div className="flex items-center gap-3 text-[clamp(1rem,1.8vw,2rem)] font-semibold text-white/70">
        {icon}
        {text}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Назад
      </button>
    </div>
  );
}
