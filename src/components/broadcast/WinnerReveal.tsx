import { AnimatePresence, motion } from "framer-motion";
import { Crown, Flag, Handshake, Users } from "lucide-react";
import type { Participant } from "../../types";
import type { Standings } from "./standings";
import { Confetti } from "./Confetti";
import { cn } from "../../utils/cn";

interface WinnerRevealProps {
  topic: string;
  standings: Standings;
  totalVotes: number;
  open: boolean;
  onDismiss: () => void;
}

/**
 * Финальная анимация: как только статус голосования стал «завершён»,
 * поверх таблицы результатов показываем победителя (наибольший процент)
 * и проигравшего (наименьший процент). Ничья, отсутствие голосов и
 * неоднозначный проигравший показаны отдельными плашками — на большом
 * экране не должно быть пустого места или неверного «победителя».
 */
export function WinnerReveal({ topic, standings, totalVotes, open, onDismiss }: WinnerRevealProps) {
  const { top, bottom, others, hasVotes, winner, loser } = standings;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="winner-reveal"
          role="dialog"
          aria-label="Итоги голосования"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          onClick={onDismiss}
          className="broadcast-bg fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-[clamp(1rem,4vw,4rem)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-black/55 backdrop-blur-xl"
          />

          {winner && <Confetti />}

          <div className="relative flex w-full max-w-[100rem] flex-col items-center">
            <motion.p
              initial={{ opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[clamp(0.7rem,1.1vw,1.3rem)] font-semibold uppercase tracking-[0.4em] text-indigo-300/80"
            >
              Голосование завершено
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: -24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-3 max-w-[70ch] text-center text-[clamp(1.2rem,2.6vw,3.25rem)] font-extrabold leading-tight text-white"
            >
              {topic}
            </motion.h2>

            <div className="mt-[clamp(1rem,2.5vw,3rem)] flex w-full flex-wrap items-stretch justify-center gap-[clamp(0.75rem,2vw,2.5rem)]">
              {winner ? (
                <>
                  <Podium
                    delay={0.45}
                    from={-70}
                    tone="winner"
                    label="Победитель"
                    icon={<Crown size={22} />}
                    participant={winner}
                  />

                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.85 }}
                    className="flex items-center text-[clamp(0.9rem,1.6vw,2rem)] font-black uppercase tracking-[0.2em] text-white/25"
                  >
                    vs
                  </motion.div>

                  {loser ? (
                    <Podium
                      delay={0.7}
                      from={70}
                      tone="loser"
                      label="Проигравший"
                      icon={<Flag size={20} />}
                      participant={loser}
                    />
                  ) : (
                    <MutedPanel delay={0.7} from={70} title="Минимум голосов" icon={<Flag size={20} />}>
                      {bottom.map((participant) => participant.name).join(" · ")}
                      <span className="mt-2 block text-[clamp(0.8rem,1.3vw,1.6rem)] tabular-nums text-white/45">
                        по {bottom[0]?.percentage ?? 0}% — {bottom[0]?.votesCount ?? 0} голосов
                      </span>
                    </MutedPanel>
                  )}
                </>
              ) : (
                <MutedPanel
                  delay={0.4}
                  from={0}
                  wide
                  title={hasVotes ? "Ничья" : "Голосов не поступило"}
                  icon={hasVotes ? <Handshake size={20} /> : <Users size={20} />}
                >
                  {hasVotes
                    ? top.map((participant) => participant.name).join(" · ")
                    : "Ни один зритель не проголосовал"}
                  {hasVotes && (
                    <span className="mt-2 block text-[clamp(0.8rem,1.3vw,1.6rem)] tabular-nums text-white/45">
                      {top[0]?.percentage ?? 0}% — по {top[0]?.votesCount ?? 0} голосов
                    </span>
                  )}
                </MutedPanel>
              )}
            </div>

            {others.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1 }}
                className="mt-[clamp(0.75rem,1.5vw,1.75rem)] flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
              >
                {others.map((participant) => (
                  <li
                    key={participant.id}
                    className="text-[clamp(0.75rem,1.15vw,1.4rem)] tabular-nums text-white/45"
                  >
                    {participant.name} — {participant.percentage}% ({participant.votesCount})
                  </li>
                ))}
              </motion.ul>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.15 }}
              className="mt-[clamp(0.75rem,1.5vw,1.75rem)] text-[clamp(0.75rem,1.1vw,1.35rem)] tabular-nums uppercase tracking-[0.2em] text-white/40"
            >
              Всего голосов: {totalVotes}
            </motion.p>

            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.3 }}
              onClick={onDismiss}
              className="mt-6 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-[clamp(0.7rem,1vw,1.2rem)] text-white/60 transition hover:border-white/30 hover:text-white"
            >
              Показать таблицу результатов
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Podium({
  participant,
  label,
  icon,
  tone,
  delay,
  from,
}: {
  participant: Participant;
  label: string;
  icon: React.ReactNode;
  tone: "winner" | "loser";
  delay: number;
  from: number;
}) {
  const isWinner = tone === "winner";

  return (
    <motion.div
      initial={{ opacity: 0, x: from, scale: 0.85 }}
      animate={{ opacity: isWinner ? 1 : 0.72, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 130, damping: 15, delay }}
      className={cn(
        "relative flex min-w-[16rem] flex-1 flex-col items-center overflow-hidden rounded-[clamp(1rem,1.8vw,2.25rem)] border px-[clamp(1rem,2.5vw,3rem)] py-[clamp(1rem,2vw,2.5rem)] text-center backdrop-blur-md",
        isWinner
          ? "border-amber-300/50 bg-gradient-to-b from-amber-300/20 via-white/[0.05] to-transparent shadow-[0_0_120px_-30px_rgba(251,191,36,0.9)]"
          : "border-white/10 bg-white/[0.03]"
      )}
    >
      {isWinner && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-24 h-56 w-56 rounded-full bg-amber-300/25 blur-3xl"
          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
        />
      )}

      <RevealLabel winner={isWinner} icon={icon}>
        {label}
      </RevealLabel>

      <p
        className={cn(
          "relative mt-4 max-w-[22ch] text-[clamp(1.1rem,2.2vw,2.75rem)] font-extrabold leading-tight",
          isWinner ? "text-white" : "text-white/70"
        )}
      >
        {participant.name}
      </p>

      {participant.subtitle && (
        <p className="relative mt-1 max-w-[28ch] text-[clamp(0.7rem,1.1vw,1.35rem)] text-white/45">
          {participant.subtitle}
        </p>
      )}

      <p
        className={cn(
          "relative mt-[clamp(0.5rem,1.2vw,1.5rem)] text-[clamp(2rem,5vw,6rem)] font-black leading-none tabular-nums tracking-tight",
          isWinner ? "text-amber-200" : "text-white/60"
        )}
      >
        {participant.percentage}%
      </p>

      <p className="relative mt-2 text-[clamp(0.75rem,1.15vw,1.45rem)] tabular-nums text-white/50">
        {participant.votesCount} голосов
      </p>
    </motion.div>
  );
}

/** Нейтральная плашка: ничья, отсутствие голосов, несколько проигравших. */
function MutedPanel({
  title,
  icon,
  children,
  delay,
  from,
  wide = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay: number;
  from: number;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: from, y: from === 0 ? 24 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={cn(
        "flex flex-col items-center rounded-[clamp(1rem,1.6vw,2rem)] border border-white/15 bg-white/[0.06] px-[clamp(1rem,2.5vw,3rem)] py-[clamp(1rem,2vw,2.5rem)] text-center backdrop-blur-md",
        wide ? "w-full max-w-3xl" : "min-w-[16rem] flex-1 justify-center"
      )}
    >
      <RevealLabel winner={false} icon={icon}>
        {title}
      </RevealLabel>
      <p className="relative mt-4 text-[clamp(1rem,2vw,2.5rem)] font-bold leading-snug text-white">
        {children}
      </p>
    </motion.div>
  );
}

function RevealLabel({
  winner,
  icon,
  children,
}: {
  winner: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[clamp(0.65rem,0.95vw,1.15rem)] font-bold uppercase tracking-[0.22em]",
        winner ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 bg-white/5 text-white/50"
      )}
    >
      {icon}
      {children}
    </span>
  );
}
