import { motion } from "framer-motion";
import { Crown, EyeOff, TrendingDown } from "lucide-react";
import type { Participant } from "../../types";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { ProgressBar } from "../debate/ProgressBar";
import { cn } from "../../utils/cn";

const GRADIENTS = [
  "from-indigo-400 via-blue-400 to-violet-500",
  "from-sky-400 via-indigo-400 to-blue-500",
  "from-violet-400 via-fuchsia-400 to-indigo-400",
  "from-emerald-400 via-teal-400 to-sky-400",
];

interface BroadcastParticipantCardProps {
  participant: Participant;
  index: number;
  /** Показать чип «Лидер» (идёт голосование). */
  leader?: boolean;
  /** Финал: карточка победителя. */
  winner?: boolean;
  /** Финал: карточка проигравшего. */
  loser?: boolean;
  /** Закрытое голосование: цифры заменены «••» до раскрытия организатором. */
  hidden?: boolean;
}

/**
 * Карточка участника для большого экрана. Все размеры через clamp() по
 * ширине вьюпорта — на телевизоре текст крупный, на телефоне читаемый.
 * Числа и полоса анимируются при каждом realtime-обновлении.
 */
export function BroadcastParticipantCard({
  participant,
  index,
  leader = false,
  winner = false,
  loser = false,
  hidden = false,
}: BroadcastParticipantCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{
        opacity: loser ? 0.5 : 1,
        y: 0,
        scale: winner ? 1.015 : 1,
      }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: index * 0.04 }}
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-[clamp(1rem,1.6vw,2rem)] border p-[clamp(0.9rem,1.6vw,2.25rem)] backdrop-blur-md transition-colors duration-500",
        "border-white/10 bg-white/[0.05]",
        leader && !winner && !loser && "border-sky-300/40 bg-sky-400/[0.08]",
        winner &&
          "border-amber-300/50 bg-gradient-to-br from-amber-300/20 via-white/[0.04] to-transparent shadow-[0_0_80px_-20px_rgba(251,191,36,0.75)]",
        loser && "border-white/5 bg-white/[0.02]"
      )}
    >
      {winner && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl"
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-[clamp(1.5rem,2.2vw,2.75rem)] w-[clamp(1.5rem,2.2vw,2.75rem)] shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[clamp(0.75rem,1.2vw,1.5rem)] font-bold text-white">
              {index + 1}
            </span>
            <h3 className="truncate text-[clamp(1rem,1.9vw,2.25rem)] font-bold leading-tight text-white">
              {participant.name}
            </h3>
          </div>
          {participant.subtitle && (
            <p className="mt-1.5 text-[clamp(0.7rem,1.15vw,1.4rem)] leading-snug text-white/50">
              {participant.subtitle}
            </p>
          )}
        </div>

        {hidden ? (
          <Chip className="border-white/10 bg-white/5 text-white/40">
            <EyeOff size={14} />
            Скрыто
          </Chip>
        ) : winner ? (
          <Chip className="border-amber-300/50 bg-amber-300/15 text-amber-200">
            <Crown size={14} />
            Победитель
          </Chip>
        ) : loser ? (
          <Chip className="border-white/10 bg-white/5 text-white/45">
            <TrendingDown size={14} />
            Проигравший
          </Chip>
        ) : leader ? (
          <Chip className="border-sky-300/40 bg-sky-400/15 text-sky-200">Лидер</Chip>
        ) : null}
      </div>

      <div className="relative mt-[clamp(0.6rem,1.4vw,1.75rem)] flex items-end justify-between gap-4">
        {hidden ? (
          <>
            <p className="text-[clamp(1.9rem,4.6vw,5.5rem)] font-black leading-none tracking-tight text-white/25" aria-label="Процент скрыт">
              ••%
            </p>
            <p className="shrink-0 text-right">
              <span className="block text-[clamp(1.1rem,2.1vw,2.5rem)] font-bold leading-none text-white/25">
                ••
              </span>
              <span className="mt-1 block text-[clamp(0.6rem,0.95vw,1.1rem)] uppercase tracking-[0.2em] text-white/30">
                скрыто
              </span>
            </p>
          </>
        ) : (
          <>
            <p
              className={cn(
                "text-[clamp(1.9rem,4.6vw,5.5rem)] font-black leading-none tracking-tight tabular-nums",
                winner ? "text-amber-200" : "text-white"
              )}
            >
              <AnimatedNumber value={participant.percentage} suffix="%" />
            </p>

            <p className="shrink-0 text-right">
              <span className="block text-[clamp(1.1rem,2.1vw,2.5rem)] font-bold leading-none tabular-nums text-white">
                <AnimatedNumber value={participant.votesCount} />
              </span>
              <span className="mt-1 block text-[clamp(0.6rem,0.95vw,1.1rem)] uppercase tracking-[0.2em] text-white/40">
                голосов
              </span>
            </p>
          </>
        )}
      </div>

      {hidden ? (
        // Пустая колея с медленным бликом: голосование идёт, цифры закрыты.
        <div className="relative mt-[clamp(0.5rem,1vw,1.25rem)] h-[clamp(0.4rem,0.75vw,0.9rem)] overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            aria-hidden
            className="absolute inset-y-0 w-1/4 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ["-130%", "420%"] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.25 }}
          />
        </div>
      ) : (
        <ProgressBar
          percentage={participant.percentage}
          gradient={winner ? "from-amber-300 via-amber-400 to-orange-400" : GRADIENTS[index % GRADIENTS.length]}
          className={cn(
            "mt-[clamp(0.5rem,1vw,1.25rem)] h-[clamp(0.4rem,0.75vw,0.9rem)]",
            loser && "opacity-60"
          )}
        />
      )}
    </motion.div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[clamp(0.6rem,0.9vw,1.05rem)] font-semibold uppercase tracking-[0.12em]",
        className
      )}
    >
      {children}
    </span>
  );
}
