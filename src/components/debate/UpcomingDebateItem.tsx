import { motion } from "framer-motion";
import { ChevronRight, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DebateEvent } from "../../types";
import { getEventTypeMeta } from "../../utils/eventType";

const MONTHS_SHORT = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

interface UpcomingDebateItemProps {
  event: DebateEvent;
  /** Позиция в списке — для лесенки появления. */
  index?: number;
}

export function UpcomingDebateItem({ event, index = 0 }: UpcomingDebateItemProps) {
  const navigate = useNavigate();
  const date = new Date(event.scheduledAt);
  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/debate/${event.id}`)}
      className="glass-panel flex w-full items-center gap-3 rounded-2xl border border-white/10 p-3 text-left transition-colors hover:border-white/25"
    >
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.03]">
        <span className="text-base font-bold leading-none text-white">{day}</span>
        <span className="mt-1 text-[10px] font-medium uppercase text-white/50">{month}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{event.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
          <span className="inline-flex items-center gap-1"><Users size={13} className="text-white opacity-45" />{event.participantsCount}</span>
          <span className="mx-0.5">·</span>
          <span>{time}</span>
          <span className="mx-0.5">·</span>
          {(() => { const meta = getEventTypeMeta(event.eventType, event.customTypeLabel); const Icon = meta.Icon; return <span className="inline-flex items-center gap-1"><Icon size={11} />{meta.label}</span> })()}
        </div>
      </div>

      <ChevronRight size={18} className="shrink-0 text-white opacity-30 transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
