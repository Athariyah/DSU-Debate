import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

type IconChipTone = "neutral" | "accent" | "danger";

interface IconChipProps {
  /** Линейная иконка lucide (stroke-SVG). */
  icon: LucideIcon;
  iconSize?: number;
  tone?: IconChipTone;
  className?: string;
}

/**
 * Маленькая «чип-подложка» под линейную иконку.
 *
 * Почему так: иконки из векторных линий с полупрозрачным цветом
 * (например, `text-white/35`) имеют НЕ РОВНУЮ прозрачность — там, где
 * штрихи пересекаются, альфа суммируется и пересечения выглядят темнее
 * остальных частей иконки. Здесь штрих рисуется полностью непрозрачным,
 * а прозрачность (если нужна) задаётся на ВСЁМ SVG-элементе: браузер
 * сначала композитит иконку целиком, затем делает её полупрозрачной —
 * и каждая часть иконки остаётся одинаково яркой.
 */
export function IconChip({ icon: Icon, iconSize = 16, tone = "neutral", className }: IconChipProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.65rem] border",
        tone === "neutral" &&
          "border-white/10 bg-gradient-to-br from-white/[0.13] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_-2px_rgba(0,0,0,0.45)]",
        tone === "accent" &&
          "border-indigo-300/30 bg-gradient-to-br from-indigo-500/40 via-violet-500/30 to-sky-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_14px_-4px_rgba(99,102,241,0.6)]",
        tone === "danger" &&
          "border-rose-300/25 bg-gradient-to-br from-rose-500/30 to-rose-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        className
      )}
    >
      {/* Штрих непрозрачный, приглушённость — прозрачностью всего элемента,
          поэтому пересечения линий не темнеют. */}
      <Icon
        size={iconSize}
        className={cn(
          tone === "neutral" && "text-white opacity-80",
          tone === "accent" && "text-white",
          tone === "danger" && "text-rose-100"
        )}
      />
    </span>
  );
}
