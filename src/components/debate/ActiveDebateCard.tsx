import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Users } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { DebateEvent } from "../../types";

interface ActiveDebateCardProps {
  event: DebateEvent;
  voted: boolean;
  onVoteClick: () => void;
}

/**
 * Крупная карточка активного дебата на главном экране.
 * Точно повторяет референс: бейдж "Активный дебат", заголовок,
 * мета-строка (участники + дата) и белая CTA-кнопка внизу.
 */
export function ActiveDebateCard({ event, voted, onVoteClick }: ActiveDebateCardProps) {
  const date = new Date(event.scheduledAt);
  const isToday = new Date().toDateString() === date.toDateString();
  const timeLabel = `${isToday ? "Сегодня" : date.toLocaleDateString("ru-RU")}, ${date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[1.75rem] border border-white/10 p-5"
    >
      {/* Фоновый неоновый градиент карточки */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/40 via-[#2a2d5c] to-slate-900" />
      <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-56 w-56 rounded-full bg-violet-500/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 -z-10 h-48 w-48 rounded-full bg-sky-400/30 blur-3xl" />
      <div className="glass-panel absolute inset-0 -z-10" />

      {/* Декоративный мотив логотипа (пересекающиеся полупрозрачные плашки) */}
      <div className="pointer-events-none absolute -right-6 bottom-4 h-24 w-24 opacity-40">
        <div className="absolute h-16 w-16 rotate-6 rounded-2xl border border-white/30 bg-white/10 backdrop-blur-sm" />
        <div className="absolute left-6 top-4 h-16 w-16 -rotate-6 rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm" />
      </div>

      <Badge tone="active">Активный дебат</Badge>

      <h2 className="mt-4 max-w-[85%] text-xl font-bold leading-snug text-white">{event.title}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/70">
        <span className="inline-flex items-center gap-1.5">
          <Users size={14} />
          {event.participantsCount} участника
        </span>
        <span className="text-white/30">·</span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={14} />
          {timeLabel}
        </span>
      </div>

      <Button className="mt-5" onClick={onVoteClick}>
        {voted ? "Результаты" : "Голосовать"}
        <ArrowRight size={16} />
      </Button>
    </motion.div>
  );
}
