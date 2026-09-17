import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { mockSubscribe } from "../mock/mockRealtime";
import type { DebateStatus, Participant, VoteUpdatePayload } from "../types";

export type RealtimeStatus = "connecting" | "live" | "offline" | "demo-offline";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

interface UseDebateSocketArgs {
  eventId: number | null | undefined;
  initialStatus: DebateStatus;
  initialParticipants: Participant[];
  initialTotalVotes: number;
  /** Закрытое голосование: флажок «Скрыть голоса» из админки. */
  initialVotesHidden: boolean;
}

interface UseDebateSocketResult {
  participants: Participant[];
  totalVotes: number;
  eventStatus: DebateStatus;
  votesHidden: boolean;
  status: RealtimeStatus;
}

interface BackendRealtimeParticipant {
  participantId: number;
  name: string;
  description?: string | null;
  votesCount: number;
  percentage: number;
}

interface BackendRealtimePayload {
  eventId: number;
  totalVotes: number;
  participants: BackendRealtimeParticipant[];
}

interface StatusPayload {
  eventId: number;
  status: DebateStatus;
}

interface VisibilityPayload {
  eventId: number;
  votesHidden: boolean;
}

type RealtimePayload = VoteUpdatePayload | BackendRealtimePayload;

export function useDebateSocket({
  eventId,
  initialStatus,
  initialParticipants,
  initialTotalVotes,
  initialVotesHidden,
}: UseDebateSocketArgs): UseDebateSocketResult {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [totalVotes, setTotalVotes] = useState(initialTotalVotes);
  const [eventStatus, setEventStatus] = useState<DebateStatus>(initialStatus);
  const [votesHidden, setVotesHidden] = useState(initialVotesHidden);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const hasLiveConnection = useRef(false);

  useEffect(() => {
    setParticipants(initialParticipants);
    setTotalVotes(initialTotalVotes);
    setEventStatus(initialStatus);
    setVotesHidden(initialVotesHidden);
  }, [eventId, initialParticipants, initialTotalVotes, initialStatus, initialVotesHidden]);

  useEffect(() => {
    if (eventId === undefined || eventId === null) return;

    const socket = getSocket();
    let demoUnsubscribe: (() => void) | null = null;
    hasLiveConnection.current = socket.connected;

    const applyUpdate = (payload: RealtimePayload) => {
      if (Number(payload.eventId) !== eventId) return;
      const nextParticipants = payload.participants.map((participant) => {
        if ("participantId" in participant) {
          return {
            id: participant.participantId,
            eventId,
            name: participant.name,
            subtitle: participant.description ?? undefined,
            votesCount: participant.votesCount,
            percentage: participant.percentage,
          };
        }
        return participant;
      });
      setParticipants(nextParticipants);
      setTotalVotes(payload.totalVotes);
    };

    const applyStatus = (payload: StatusPayload) => {
      if (Number(payload.eventId) === eventId) setEventStatus(payload.status);
    };

    // Флажок «Скрыть голоса» переключился в админке: прячем/раскрываем цифры
    // мгновенно. Числа прилетают отдельным vote:update до этого события.
    const applyVisibility = (payload: VisibilityPayload) => {
      if (Number(payload.eventId) === eventId) setVotesHidden(Boolean(payload.votesHidden));
    };

    const handleConnect = () => {
      hasLiveConnection.current = true;
      setStatus("live");
      socket.emit("join_debate", eventId);
    };

    const handleDisconnect = () => {
      hasLiveConnection.current = false;
      setStatus("connecting");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("vote:update", applyUpdate);
    socket.on("event:status_changed", applyStatus);
    socket.on("event:votes_visibility", applyVisibility);

    if (socket.connected) handleConnect();

    const fallbackTimer = window.setTimeout(() => {
      if (!hasLiveConnection.current) {
        setStatus(USE_MOCKS ? "demo-offline" : "offline");
        if (USE_MOCKS) demoUnsubscribe = mockSubscribe(eventId, applyUpdate);
      }
    }, 2500);

    return () => {
      window.clearTimeout(fallbackTimer);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("vote:update", applyUpdate);
      socket.off("event:status_changed", applyStatus);
      socket.off("event:votes_visibility", applyVisibility);
      if (socket.connected) socket.emit("leave_debate", eventId);
      demoUnsubscribe?.();
    };
  }, [eventId]);

  return { participants, totalVotes, eventStatus, votesHidden, status };
}
