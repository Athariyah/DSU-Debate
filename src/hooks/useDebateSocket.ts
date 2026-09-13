import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { mockSubscribe } from "../mock/mockRealtime";
import type { Participant, VoteUpdatePayload } from "../types";

export type RealtimeStatus = "connecting" | "live" | "demo-offline";

interface UseDebateSocketArgs {
  eventId: number | null | undefined;
  initialParticipants: Participant[];
  initialTotalVotes: number;
}

interface UseDebateSocketResult {
  participants: Participant[];
  totalVotes: number;
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

type RealtimePayload = VoteUpdatePayload | BackendRealtimePayload;

export function useDebateSocket({
  eventId,
  initialParticipants,
  initialTotalVotes,
}: UseDebateSocketArgs): UseDebateSocketResult {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [totalVotes, setTotalVotes] = useState(initialTotalVotes);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const hasLiveConnection = useRef(false);

  useEffect(() => {
    setParticipants(initialParticipants);
    setTotalVotes(initialTotalVotes);
  }, [eventId, initialParticipants, initialTotalVotes]);

  useEffect(() => {
    if (eventId === undefined || eventId === null) return;

    const socket = getSocket();
    let demoUnsubscribe: (() => void) | null = null;
    hasLiveConnection.current = socket.connected;

    const applyUpdate = (payload: RealtimePayload) => {
      if (Number(payload.eventId) !== eventId) return;

      const participants = payload.participants.map((participant) => {
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

      setParticipants(participants);
      setTotalVotes(payload.totalVotes);
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

    if (socket.connected) handleConnect();

    const fallbackTimer = window.setTimeout(() => {
      if (!hasLiveConnection.current) {
        setStatus("demo-offline");
        demoUnsubscribe = mockSubscribe(eventId, applyUpdate);
      }
    }, 2500);

    return () => {
      window.clearTimeout(fallbackTimer);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("vote:update", applyUpdate);
      if (socket.connected) socket.emit("leave_debate", eventId);
      demoUnsubscribe?.();
    };
  }, [eventId]);

  return { participants, totalVotes, status };
}
