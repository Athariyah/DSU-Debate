import { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { mockSubscribe } from "../mock/mockRealtime";
import type { Participant, VoteUpdatePayload } from "../types";

export type RealtimeStatus = "connecting" | "live" | "demo-offline";

interface UseDebateSocketArgs {
  eventId: string | null | undefined;
  initialParticipants: Participant[];
  initialTotalVotes: number;
}

interface UseDebateSocketResult {
  participants: Participant[];
  totalVotes: number;
  status: RealtimeStatus;
}

/**
 * Подключается к комнате конкретного дебата через Socket.io:
 *  - client:  socket.emit('join_debate', eventId)
 *  - server:  io.to(`debate:${eventId}`).emit('vote_update', payload)
 *
 * Если реальный сервер недоступен (например, при локальной верстке без
 * поднятого бэкенда), хук через 2.5с переключается в демо-режим и слушает
 * локальную шину mockRealtime, чтобы прогресс-бары всё равно обновлялись
 * плавно в реальном времени при голосовании внутри этой же вкладки.
 */
export function useDebateSocket({
  eventId,
  initialParticipants,
  initialTotalVotes,
}: UseDebateSocketArgs): UseDebateSocketResult {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [totalVotes, setTotalVotes] = useState<number>(initialTotalVotes);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const hasLiveConnection = useRef(false);

  // Синхронизируем локальный стейт, когда сменился сам eventId / первичные данные
  useEffect(() => {
    setParticipants(initialParticipants);
    setTotalVotes(initialTotalVotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;

    const socket = getSocket();
    let demoUnsubscribe: (() => void) | null = null;

    const applyUpdate = (payload: VoteUpdatePayload) => {
      if (payload.eventId !== eventId) return;
      setParticipants(payload.participants);
      setTotalVotes(payload.totalVotes);
    };

    const handleConnect = () => {
      hasLiveConnection.current = true;
      setStatus("live");
      socket.emit("join_debate", eventId);
    };

    const handleDisconnect = () => {
      setStatus("connecting");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("vote_update", applyUpdate);
    socket.on("results_update", applyUpdate);

    if (socket.connected) {
      handleConnect();
    }

    // Демо-фолбэк: если через 2.5с настоящего сокета так и нет — не блокируем UX
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
      socket.off("vote_update", applyUpdate);
      socket.off("results_update", applyUpdate);
      if (socket.connected) socket.emit("leave_debate", eventId);
      demoUnsubscribe?.();
    };
  }, [eventId]);

  return { participants, totalVotes, status };
}
