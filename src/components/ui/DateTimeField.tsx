import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { IconChip } from "./IconChip";

const pad = (value: number) => String(value).padStart(2, "0");

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

/** Высота одного значения в колесе времени, px. */
const WHEEL_ITEM_HEIGHT = 44;

/**
 * Разбирает ISO-строку на локальные части для полей `date` и `time`.
 * Пустая или невалидная строка даёт пустые части — поле остаётся незаполненным.
 */
export function splitDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "" };
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

/**
 * Собирает локальные дату и время обратно в ISO. Пока не выбрана дата,
 * возвращает null — наружу уходит только полноценное значение.
 */
export function combineDateTime(datePart: string, timePart: string): string | null {
  if (!datePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
  const parts = [year, month, day, hours, minutes];
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

interface DateTimeFieldProps {
  /** ISO-строка (как в API). */
  value: string;
  /** Вызывается только когда дата выбрана — всегда с валидным ISO. */
  onChange: (iso: string) => void;
  className?: string;
}

/**
 * Поле даты и времени без системных виджетов: вместо нативных
 * `input[type=date|time]` — две ясные кнопки-переключатели. Первое нажатие
 * открывает свою панель в стилистике сайта (календарь или сетка часов/минут),
 * второе закрывает; клик мимо или «Готово» тоже сворачивают панель.
 * Системных иконок-дублёров больше нет: слева — одна иконка-чип, значение
 * видно прямо на кнопке.
 */
export function DateTimeField({ value, onChange, className }: DateTimeFieldProps) {
  const [parts, setParts] = useState(() => splitDateTime(value));
  const [openPanel, setOpenPanel] = useState<null | "date" | "time">(null);
  const [view, setView] = useState(() => {
    const selected = parts.date ? new Date(`${parts.date}T00:00`) : new Date();
    return { year: selected.getFullYear(), month: selected.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // Внешнее значение может прийти позже (загрузка мероприятия) или измениться
  // из другого места — синхронизируем поля с ним.
  useEffect(() => {
    const next = splitDateTime(value);
    setParts(next);
    const selected = next.date ? new Date(`${next.date}T00:00`) : null;
    if (selected) setView({ year: selected.getFullYear(), month: selected.getMonth() });
  }, [value]);

  // Клик мимо поля закрывает открытую панель.
  useEffect(() => {
    if (!openPanel) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenPanel(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openPanel]);

  function update(patch: Partial<{ date: string; time: string }>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const iso = combineDateTime(next.date, next.time);
    if (iso) onChange(iso);
  }

  function togglePanel(panel: "date" | "time") {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  // Календарь: неделя начинается с понедельника.
  const firstDay = new Date(view.year, view.month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const now = new Date();
  const monthKey = `${view.year}-${pad(view.month + 1)}`;
  const todayDay = now.getFullYear() === view.year && now.getMonth() === view.month ? now.getDate() : null;

  const [currentHour, currentMinute] = (parts.time || "00:00").split(":").map(Number);

  return (
    <div
      ref={rootRef}
      className={cn(
        "glass-panel rounded-2xl border border-white/10 p-1.5",
        openPanel && "border-white/15",
        className
      )}
    >
      <div className="flex flex-wrap items-stretch gap-1.5">
        <FieldToggle
          icon={CalendarDays}
          ariaLabel="Дата"
          valueText={parts.date ? formatDateRu(parts.date) : ""}
          placeholder="Выбрать дату"
          open={openPanel === "date"}
          onToggle={() => togglePanel("date")}
          className="min-w-[9rem] flex-1"
        />
        <FieldToggle
          icon={Clock}
          ariaLabel="Время"
          valueText={parts.time}
          placeholder="Выбрать время"
          open={openPanel === "time"}
          onToggle={() => togglePanel("time")}
          className="min-w-[7rem] flex-1"
        />
      </div>

      <AnimatePresence initial={false}>
        {openPanel && (
          <motion.div
            key={openPanel}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-xl border border-white/10 bg-black/30 p-3">
              <PanelHeader title={openPanel === "date" ? "Выбор даты" : "Выбор времени"} onDone={() => setOpenPanel(null)} />
              {openPanel === "date" ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <MonthNavButton direction="prev" onClick={() => shiftMonth(view, -1, setView)} />
                    <p className="text-sm font-bold tracking-wide text-white">
                      {MONTHS[view.month]} {view.year}
                    </p>
                    <MonthNavButton direction="next" onClick={() => shiftMonth(view, 1, setView)} />
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map((weekday, index) => (
                      <span
                        key={weekday}
                        className={cn(
                          "pb-1 text-[10px] font-bold uppercase tracking-wide",
                          index >= 5 ? "text-indigo-200/70" : "text-white/35"
                        )}
                      >
                        {weekday}
                      </span>
                    ))}
                    {cells.map((day, index) =>
                      day === null ? (
                        <span key={`blank-${index}`} />
                      ) : (
                        <button
                          key={day}
                          type="button"
                          onClick={() => update({ date: `${monthKey}-${pad(day)}` })}
                          className={cn(
                            "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-[13px] tabular-nums transition-all duration-150 active:scale-90",
                            parts.date === `${monthKey}-${pad(day)}`
                              ? "bg-gradient-to-br from-indigo-400 to-violet-500 font-bold text-white shadow-[0_6px_16px_-6px_rgba(99,102,241,0.9)]"
                              : day === todayDay
                                ? "border border-indigo-300/50 text-indigo-100 hover:bg-white/10"
                                : cn(
                                    "hover:bg-white/10",
                                    index % 7 >= 5 ? "text-white/65" : "text-white/85"
                                  )
                          )}
                        >
                          {day}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <TimeWheel
                    label="Часы"
                    values={HOURS}
                    selected={Number.isFinite(currentHour) ? currentHour : 0}
                    onPick={(hour) => update({ time: `${pad(hour)}:${pad(currentMinute)}` })}
                  />
                  <TimeWheel
                    label="Минуты"
                    values={MINUTES}
                    selected={Number.isFinite(currentMinute) ? currentMinute : 0}
                    onPick={(minute) => update({ time: `${pad(currentHour)}:${pad(minute)}` })}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** «18.09.2026» из «2026-09-18». */
function formatDateRu(datePart: string): string {
  const [year, month, day] = datePart.split("-");
  return `${day}.${month}.${year}`;
}

function shiftMonth(view: { year: number; month: number }, delta: number, setView: (view: { year: number; month: number }) => void) {
  const date = new Date(view.year, view.month + delta, 1);
  setView({ year: date.getFullYear(), month: date.getMonth() });
}

/** Кнопка-«шторка» поля: иконка-чип + значение + стрелка; переключает панель. */
function FieldToggle({
  icon: Icon,
  ariaLabel,
  valueText,
  placeholder,
  open,
  onToggle,
  className,
}: {
  icon: LucideIcon;
  ariaLabel: string;
  valueText: string;
  placeholder: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all duration-200 active:scale-[0.99]",
        open
          ? "border-indigo-300/40 bg-indigo-400/10 shadow-[0_0_0_1px_rgba(129,140,248,0.3),0_10px_28px_-12px_rgba(99,102,241,0.8)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
        className
      )}
    >
      <IconChip icon={Icon} iconSize={15} tone={open ? "accent" : "neutral"} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[15px] font-semibold tabular-nums",
          valueText ? "text-white" : "text-white/40"
        )}
      >
        {valueText || placeholder}
      </span>
      <ChevronDown
        size={14}
        className={cn("shrink-0 text-white/40 transition-transform duration-200", open && "rotate-180 text-indigo-200")}
      />
    </button>
  );
}

/** Заголовок панели: название + «Готово». */
function PanelHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{title}</p>
      <button
        type="button"
        onClick={onDone}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300/25 bg-indigo-400/15 px-2.5 py-1 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-400/25 active:scale-95"
      >
        <Check size={13} />
        Готово
      </button>
    </div>
  );
}

function MonthNavButton({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Предыдущий месяц" : "Следующий месяц"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-90"
    >
      {direction === "prev" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

/**
 * Колесо выбора времени в духе будильника iPhone: вертикальный список
 * со snap-скроллом, центральная подсветка активного значения.
 * Нативный touch-скролл телефона + scroll-snap даёт «родное» ощущение,
 * на десктопе работает колесом мыши и кликами по значениям.
 */
function TimeWheel({
  label,
  values,
  selected,
  onPick,
}: {
  label: string;
  values: number[];
  selected: number;
  onPick: (value: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Значение, стоящее в центре в этот момент (может опережать committed
  // `selected` на время прокрутки).
  const [center, setCenter] = useState(selected);

  const scrollOffsetFor = (value: number) => {
    const el = containerRef.current;
    const index = Math.max(0, values.indexOf(value));
    if (!el) return index * WHEEL_ITEM_HEIGHT;
    return index * WHEEL_ITEM_HEIGHT - el.clientHeight / 2 + WHEEL_ITEM_HEIGHT / 2;
  };

  // Внешняя смена значения (например, синхронизация с событием) —
  // мгновенно доводим колесо до него.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = scrollOffsetFor(selected);
    if (Math.abs(el.scrollTop - target) > 1 && "scrollTop" in el) el.scrollTop = target;
    setCenter(values[Math.max(0, values.indexOf(selected))] ?? selected);
  }, [selected]);

  function syncFromScroll() {
    const el = containerRef.current;
    if (!el) return;
    const index = Math.round((el.scrollTop - el.clientHeight / 2 + WHEEL_ITEM_HEIGHT / 2) / WHEEL_ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(values.length - 1, index));
    const value = values[clamped];
    if (value === undefined) return;
    setCenter(value);
    if (value !== selected) onPick(value);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div
        role="group"
        aria-label={label}
        className="no-scrollbar relative h-[7.5rem] w-full overflow-hidden"
      >
        {/* Центральная «линза» под активным значением. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-xl border border-indigo-300/25 bg-indigo-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
        {/* Затемнение краёв — ощущение барабана. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-9 bg-gradient-to-b from-[rgba(4,5,12,0.92)] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-[rgba(4,5,12,0.92)] to-transparent" />

        <div
          ref={containerRef}
          onScroll={syncFromScroll}
          className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto"
        >
          {values.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                const el = containerRef.current;
                // jsdom не реализует Element.scrollTo — прокидываем без ошибок.
                if (el && typeof el.scrollTo === "function") {
                  el.scrollTo({ top: scrollOffsetFor(value), behavior: "smooth" });
                }
                onPick(value);
              }}
              className={cn(
                "flex h-11 w-full snap-center items-center justify-center text-lg tabular-nums transition-colors duration-150",
                value === center
                  ? "font-bold text-indigo-200"
                  : "text-white/35 hover:text-white/60"
              )}
            >
              {pad(value)}
            </button>
          ))}
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</span>
    </div>
  );
}
