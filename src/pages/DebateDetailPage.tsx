import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, Users, Wifi, WifiOff } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ParticipantResult } from "../components/debate/ParticipantResult";
import { VoteModal } from "../components/debate/VoteModal";
import { fetchDebateById } from "../api/debates";
import { useDebateSocket } from "../hooks/useDebateSocket";
import { getVotedParticipant } from "../utils/votedStore";
import type { DebateEvent } from "../types";

export function DebateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<DebateEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const votedRecord = event ? getVotedParticipant(event.id) : null;
  const [justVotedFor, setJustVotedFor] = useState<number | null>(votedRecord?.participantId ?? null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    if (!id) return;
    fetchDebateById(id).then((data) => {
      if (!mounted) return;
      setEvent(data);
      setJustVotedFor(getVotedParticipant(id)?.participantId ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [id]);

  const { participants, totalVotes, status } = useDebateSocket({
    eventId: event?.id,
    initialParticipants: event?.participants ?? [],
    initialTotalVotes: event?.totalVotes ?? 0,
  });

  if (loading || !event) {
    return (
      <div className="flex h-full flex-col">
        <TopBar showBack rightSlot="menu" />
        <div className="flex-1 px-5">
          <div className="h-40 animate-pulse rounded-3xl bg-white/5" />
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
  const canVote = event.status === "active";

  return (
    <div className="relative flex h-full flex-col">
      <TopBar showBack rightSlot="menu" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8">
        <Badge tone={event.status === "active" ? "active" : "neutral"}>
          {event.status === "active" ? "Активный дебат" : "Скоро"}
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
            {status === "live" ? "Live" : status === "connecting" ? "Подключение…" : "Демо-режим"}
          </span>
        </div>

        <div className="mt-6 space-y-3">
          {participants.map((p, idx) => (
            <ParticipantResult key={p.id} participant={p} index={idx} highlighted={p.id === justVotedFor} />
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-white/30">Всего голосов: {totalVotes}</p>
      </div>

      <div className="safe-bottom px-5 pb-5 pt-2">
        {voted ? (
          <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={18} />
            Ваш голос учтён
          </div>
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
