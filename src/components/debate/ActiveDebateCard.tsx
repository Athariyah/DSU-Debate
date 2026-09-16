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
 *
 * Фон — НЕПРОЗРАЧНЫЙ градиент: раньше карточка была полупрозрачной и при
 * появлении «просвечивала» фиолетовый фон страницы (сначала синяя, потом
 * темнеет — выглядело рвано). Теперь вход — один пружинный подъём, а палитра
 * держится в глубоком индиго с мягкими свечениями.
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
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 130, damping: 19, mass: 0.9 }}
      className="relative overflow-hidden rounded-[1.75rem] border border-indigo-300/25 p-5 shadow-[0_24px_70px_-24px_rgba(88,80,236,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
      style={{
        background: "linear-gradient(155deg, #262a5e 0%, #1a1d43 38%, #10122b 72%, #0b0d20 100%)",
      }}
    >
      {/* Мягкие свечения по углам — карточка «светится изнутри», но не кричит. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-violet-500/30 blur-3xl"
        animate={{ opacity: [0.55, 0.9, 0.55], scale: [1, 1.06, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl"
      />

      {/* Редкий блик, пробегающий по карточке. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        initial={{ x: "-160%" }}
        animate={{ x: "420%" }}
        transition={{ duration: 2.4, delay: 0.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 7 }}
      />

      {/* Декоративный мотив логотипа (пересекающиеся полупрозрачные плашки) */}
      <div className="pointer-events-none absolute -right-6 bottom-4 h-24 w-24 opacity-25">
        <div className="absolute h-16 w-16 rotate-6 rounded-2xl border border-white/30 bg-white/10" />
        <div className="absolute left-6 top-4 h-16 w-16 -rotate-6 rounded-2xl border border-white/20 bg-white/5" />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <Badge tone="active">Активный дебат</Badge>
        <LiveEqualizer />
      </div>

      <h2 className="relative mt-4 max-w-[85%] text-xl font-bold leading-snug text-white">
        {event.title}
      </h2>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/65">
        <span className="inline-flex items-center gap-1.5">
          <Users size={14} className="text-white/40" />
          {event.participantsCount} участника
        </span>
        <span className="text-white/25">·</span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={14} className="text-white/40" />
          {timeLabel}
        </span>
      </div>

      <div className="relative mt-5 flex items-center gap-3">
        <Button onClick={onVoteClick} className="glow-live">
          {voted ? "Результаты" : "Голосовать"}
          <ArrowRight size={16} />
        </Button>
        {event.totalVotes > 0 && (
          <span className="text-xs tabular-nums text-white/45">
            {event.totalVotes} голосов
          </span>
        )}
      </div>
    </motion.div>
  );
}

/** Три «дышащих» столбика — живой эфир прямо в карточке. */
function LiveEqualizer() {
  return (
    <div aria-hidden className="flex h-5 items-end gap-[3px]">
      {[0, 1, 2, 3].map((index) => (
        <motion.span
          key={index}
          className="w-[3px] rounded-full bg-gradient-to-t from-indigo-400 to-sky-300"
          animate={{ height: ["30%", "95%", "45%", "80%", "30%"] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.18,
          }}
        />
      ))}
    </div>
  );
}
