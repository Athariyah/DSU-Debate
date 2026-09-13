import { motion } from "framer-motion";
import { cn } from "../../utils/cn";

interface ProgressBarProps {
  percentage: number;
  className?: string;
  trackClassName?: string;
  gradient?: string;
}

/**
 * Прогресс-бар результатов голосования. Ширина заливки анимируется через
 * Framer Motion при каждом новом значении percentage, приходящем из
 * Socket.io (событие vote_update), — без дерганья и без перезагрузки.
 */
export function ProgressBar({
  percentage,
  className,
  trackClassName,
  gradient = "from-indigo-400 via-blue-400 to-violet-500",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));

  return (
    <div
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-white/10 shadow-inner",
        trackClassName,
        className
      )}
    >
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-r shadow-[0_0_12px_rgba(129,140,248,0.7)]", gradient)}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
