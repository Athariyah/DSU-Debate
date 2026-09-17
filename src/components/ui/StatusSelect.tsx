import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";
import type { DebateStatus } from "../../types";

const STATUSES: DebateStatus[] = ["upcoming", "active", "completed"];

const STATUS_META: Record<DebateStatus, { label: string; dot: string; labelClass: string }> = {
  upcoming: {
    label: "upcoming",
    dot: "bg-gradient-to-br from-indigo-400 to-violet-500 shadow-[0_0_10px_rgba(129,140,248,0.7)]",
    labelClass: "text-indigo-100",
  },
  active: {
    label: "active",
    dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
    labelClass: "text-emerald-100",
  },
  completed: {
    label: "completed",
    dot: "bg-white/40",
    labelClass: "text-white/70",
  },
};

interface StatusSelectProps {
  value: DebateStatus;
  onChange: (status: DebateStatus) => void;
  className?: string;
}

/**
 * Стильный селектор статуса мероприятия (upcoming / active / completed)
 * вместо голого системного <select>: «пилюля» с цветной точкой статуса,
 * раскрывающаяся в тёмное «матовое стекло» с галочкой у выбранного пункта.
 *
 * Список рендерится порталом в <body> с фиксированной позицией: карточки
 * админки имеют backdrop-filter (это отдельный stacking context), и
 * абсолютный dropdown внутри карточки оказался бы под следующей карточкой.
 */
export function StatusSelect({ value, onChange, className }: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Клик мимо (кнопки и списка), Escape, скролл и ресайз закрывают список.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const meta = STATUS_META[value];

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    setOpen(true);
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Статус мероприятия: ${meta.label}`}
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold tracking-wide transition-all duration-200 active:scale-[0.98]",
          open
            ? "border-indigo-300/40 bg-indigo-400/15 shadow-[0_0_0_1px_rgba(129,140,248,0.25),0_10px_30px_-12px_rgba(99,102,241,0.7)]"
            : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10"
        )}
      >
        <StatusDot status={value} />
        <span className={meta.labelClass}>{meta.label}</span>
        <ChevronDown
          size={14}
          className="text-white/50 transition-transform duration-200"
          style={open ? { transform: "rotate(180deg)" } : undefined}
        />
      </button>

      {createPortal(
        <AnimatePresence initial={false}>
          {open && anchor && (
            <motion.ul
              ref={listRef}
              role="listbox"
              aria-label="Статус мероприятия"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              style={{ position: "fixed", top: anchor.top, right: anchor.right, width: 192, zIndex: 90 }}
              className="frosted-panel origin-top-right overflow-hidden rounded-2xl border border-white/15 p-1.5"
            >
              {STATUSES.map((status) => {
                const statusMeta = STATUS_META[status];
                const selected = status === value;
                return (
                  <li key={status}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(status);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors",
                        selected ? "bg-white/10" : "hover:bg-white/5"
                      )}
                    >
                      <StatusDot status={status} />
                      <span className={cn("flex-1", statusMeta.labelClass)}>{statusMeta.label}</span>
                      {selected && <Check size={14} className="text-indigo-300" />}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/** Цветная точка статуса; у «active» — лёгкий пульс, как у «Активный дебат». */
function StatusDot({ status }: { status: DebateStatus }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "active" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", STATUS_META[status].dot)} />
    </span>
  );
}
