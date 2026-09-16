import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Home,
  Link2,
  RefreshCw,
  Settings2,
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
import type { DebateEvent, Participant } from "../types";

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
  const votedRecord = event ? getVotedParticipant(event.id) : null;
  const [justVotedFor, setJustVotedFor] = useState<number | null>(votedRecord?.participantId ?? null);
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
    loadEvent();
  }, [id, loadEvent]);

  const { participants, totalVotes, eventStatus, status } = useDebateSocket({
    eventId: event?.id,
    initialStatus: event?.status ?? "upcoming",
    initialParticipants: event?.participants ?? EMPTY_PARTICIPANTS,
    initialTotalVotes: event?.totalVotes ?? 0,
  });

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

  const date = new Date(event.scheduledAt);
  const timeLabel = `${date.toLocaleDateString("ru-RU")}, ${date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  const voted = Boolean(justVotedFor);
  const canVote = eventStatus === "active";

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
          <div className="glass-panel absolute right-5 top-16 z-40 w-56 overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
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
        <div className="glass-panel absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/80">
          {menuNotice}
        </div>
      )}

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8">
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

        <div className="mt-6 space-y-3">
          {participants.map((p, idx) => (
            <ParticipantResult key={p.id} participant={p} index={idx} highlighted={p.id === justVotedFor} />
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-white/30">Всего голосов: {totalVotes}</p>
      </div>

      <div className="safe-bottom space-y-2 px-5 pb-5 pt-2">
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
            {canVote ? "Голосовать" : "Голосование ещё не началось"}
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
}: {
  icon: typeof Link2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/10"
    >
      <Icon size={16} className="text-white/50" />
      {label}
    </button>
  );
}
