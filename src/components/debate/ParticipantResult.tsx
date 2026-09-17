import { motion } from "framer-motion";
import type { Participant } from "../../types";
import { ProgressBar } from "./ProgressBar";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { cn } from "../../utils/cn";

const rankGradients = [
  "from-indigo-400 via-blue-400 to-violet-500",
  "from-sky-400 via-indigo-400 to-blue-500",
  "from-violet-400 via-fuchsia-400 to-indigo-400",
];

interface ParticipantResultProps {
  participant: Participant;
  index: number;
  highlighted?: boolean;
  /** Закрытое голосование: имя и позиция видны, цифры скрыты организатором. */
  hidden?: boolean;
}

export function ParticipantResult({ participant, index, highlighted, hidden }: ParticipantResultProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className={cn(
        "glass-panel rounded-2xl border border-white/10 p-4",
        highlighted && "border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,0.4)]"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
          {participant.rank ?? index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15px] font-semibold text-white">{participant.name}</p>
            {hidden ? (
              <p className="shrink-0 text-[15px] font-bold tabular-nums text-white/30" aria-label="Результат скрыт">
                ••
              </p>
            ) : (
              <p className="shrink-0 text-[15px] font-bold text-white">
                <AnimatedNumber value={participant.percentage} suffix="%" />
              </p>
            )}
          </div>
          {participant.subtitle && (
            <p className="truncate text-xs text-white/45">{participant.subtitle}</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        {hidden ? (
          // Пустая колея с мягким пробегающим бликом: голосование живое,
          // но цифры закрыты до раскрытия организатором.
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07] shadow-inner">
            <motion.div
              aria-hidden
              className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
              animate={{ x: ["-120%", "360%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
            />
          </div>
        ) : (
          <ProgressBar percentage={participant.percentage} gradient={rankGradients[index % rankGradients.length]} />
        )}
      </div>
    </motion.div>
  );
}
