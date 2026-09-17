import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Clock, type LucideIcon } from "lucide-react";
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
const MONTHS_BY_INDEX = Array.from({ length: 12 }, (_, month) => month);

/** Высота одного значения в колесе времени, px. */
const WHEEL_ITEM_HEIGHT = 44;
/** Высота колеса, px (7.5rem): в поле зрения ~3 значения. */
const WHEEL_HEIGHT = 120;
/**
 * Вертикальные отступы внутри скроллера: (H − item) / 2. Без них первое
 * значение нельзя идеально выровнять по центру (scrollTop не уходит в
 * минус), и расчёт «какое значение в центре» смещается — колесо после
 * прокрутки «прыгает назад». С симметричными отступами центр i-го
 * значения ровно на `i * WHEEL_ITEM_HEIGHT`.
 */
const WHEEL_INSET = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
/**
 * Копий списка в ленте колеса. Лента циклическая: когда «центр» уходит
 * за среднюю копию, скролл мгновенно переносят на один список — визуально
 * ничего не меняется (значения одинаковые), а крутить можно в обе
 * стороны без тупиков: 00 → 59 → 00, декабрь → январь, годы — без границ.
 */
const WHEEL_COPIES = 3;
/** Диапазон лет в колесе «Год»: ±50 от года открытия панели. */
const YEAR_SPAN = 101;

/**
 * Мышь/трекпад против пальца: на «тонком» указателе включаем десктопные
 * способы крутить колесо — перетаскивание мышью, пошаговое колесо мыши
 * и стрелки клавиатуры. CSS scroll-snap при этом отключаем, чтобы не
 * конфликтовать с программным скроллом (на телефоне snap остаётся —
 * там он даёт «родное» ощущение барабана).
 */
const FINE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: fine)").matches;

/** Накопленный deltaY колеса мыши, после которого делаем один шаг значения. */
const WHEEL_STEP_DELTA = 40;

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

  // Колёса месяца и года: смена месяца/года не шлёт ISO, пока день не
  // выбран; если день уже выбран — дата обновляется (день «обрезается»,
  // если в новом месяце его нет: 31 января → 28 февраля).
  function applyCalendarShift(year: number, month: number) {
    setView({ year, month });
    if (!parts.date) return;
    const day = Math.min(
      Number(parts.date.split("-")[2]),
      new Date(year, month + 1, 0).getDate()
    );
    update({ date: `${year}-${pad(month + 1)}-${pad(day)}` });
  }

  // Диапазон лет для колеса «Год»: фиксируем при открытии панели
  // (от года события или текущего), дальше колесо крутится циклически
  // в обе стороны. Массив живёт один — при каждом рендере новый список
  // ломал бы связь «индекс → год».
  const yearValues = useMemo(() => {
    const base = view.year;
    return Array.from({ length: YEAR_SPAN }, (_, i) => base - 50 + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <div className="mb-2 flex gap-2">
                    <TimeWheel
                      label="Месяц"
                      values={MONTHS_BY_INDEX}
                      selected={view.month}
                      onPick={(month) => applyCalendarShift(view.year, month)}
                      format={(month) => MONTHS[month]}
                    />
                    <TimeWheel
                      label="Год"
                      values={yearValues}
                      selected={view.year}
                      onPick={(year) => applyCalendarShift(year, view.month)}
                      format={(year) => String(year)}
                    />
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

/**
 * Колесо выбора значения в духе будильника iPhone: вертикальный список
 * со snap-скроллом, центральная подсветка активного значения.
 * Нативный touch-скролл телефона + scroll-snap даёт «родное» ощущение.
 * На десктопе (pointer: fine) — свои эргономичные управления: колесо мыши
 * крутит по одному значению за нотч, список можно перетаскивать мышью
 * (с доводкой до ближайшего значения), работают стрелки клавиатуры
 * и клики по значениям.
 *
 * Лента циклическая: значений WHEEL_COPIES копий подряд, «домой» —
 * средняя. Когда центр уходит в крайнюю копию, скролл мгновенно переносят
 * на один список — значения одинаковые, визуально прыжок незаметен, а
 * крутить колесо можно в обе стороны без тупиков.
 *
 * Скроллер имеет симметричные вертикальные отступы (WHEEL_INSET), поэтому
 * центр i-го элемента ленты ровно на `i * WHEEL_ITEM_HEIGHT` от начала
 * скролла — расчёт «что в центре» честный для любого значения.
 */
function TimeWheel({
  label,
  values,
  selected,
  onPick,
  format = pad,
}: {
  label: string;
  values: number[];
  selected: number;
  onPick: (value: number) => void;
  /** Формат значения на строке колеса (по умолчанию — «07», «59»...). */
  format?: (value: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const count = values.length;
  const total = count * WHEEL_COPIES;
  // Абсолютный индекс в ленте, стоящий в центре (средняя копия — «дом»).
  const [centerIdx, setCenterIdx] = useState(() => count + Math.max(0, values.indexOf(selected)));
  // Последнее значение, отправленное наружу этим колесом (скроллом или
  // кликом). Эффект-синхронизация его пропускает: иначе каждый onPick
  // возвращал бы ре-рендер родителя, и тот «дотягивал» scrollTop обратно
  // к committed-значению — колесо прыгало бы назад посреди жеста.
  const lastEmittedRef = useRef<number | null>(null);
  // Перетаскивание мышью (десктоп): захват указателя включаем после порога
  // в пару пикселей, чтобы обычный клик по значению продолжал работать.
  const dragRef = useRef({ pointerId: null as number | null, active: false, pending: 0, lastY: 0, moved: 0 });
  // Аккумулятор deltaY колеса мыши для пошаговой прокрутки.
  const wheelAccRef = useRef(0);
  // Подавить click по значению сразу после перетаскивания.
  const suppressClickRef = useRef(false);

  const homeIndexFor = (value: number) => count + Math.max(0, values.indexOf(value));

  // Внешняя смена значения (загрузка события, правка в другом месте) —
  // мгновенно доводим колесо до него в средней копии. При монтировании
  // lastEmitted ещё null, поэтому колесо сразу встаёт на своё значение.
  useEffect(() => {
    if (selected === lastEmittedRef.current) return;
    lastEmittedRef.current = selected;
    const target = homeIndexFor(selected) * WHEEL_ITEM_HEIGHT;
    const el = containerRef.current;
    if (el && Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
    setCenterIdx(homeIndexFor(selected));
    // values — стабильный массив на время жизни панели, учитывать его
    // в зависимостях не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function pick(value: number) {
    if (value === selected) return;
    lastEmittedRef.current = value;
    onPick(value);
  }

  function syncFromScroll() {
    const el = containerRef.current;
    if (!el) return;
    let index = Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT);
    index = Math.max(0, Math.min(total - 1, index));
    // Держим «центр» в средней копии: ушли в край — переносим скролл на
    // один список. Лента зациклена, тупиков нет — обе стороны работают.
    if (index < count) {
      el.scrollTop += count * WHEEL_ITEM_HEIGHT;
      index += count;
    } else if (index >= count * 2) {
      el.scrollTop -= count * WHEEL_ITEM_HEIGHT;
      index -= count;
    }
    const value = values[index % count];
    if (value === undefined) return;
    setCenterIdx(index);
    pick(value);
  }

  /** Шаг на одно значение в направлении dir — колесо мыши и стрелки. */
  function stepBy(dir: number) {
    const el = containerRef.current;
    if (!el) return;
    const current = Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT);
    const target = Math.max(0, Math.min(total - 1, current + dir));
    el.scrollTo({ top: target * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
  }

  // Колесо мыши на десктопе: один нотч — ровно одно значение, без
  // прострела сразу нескольких пунктов. React вешает onWheel пассивно
  // (preventDefault невозможен), поэтому — нативный слушатель.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !FINE_POINTER) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? WHEEL_HEIGHT : 1;
      wheelAccRef.current += event.deltaY * scale;
      while (Math.abs(wheelAccRef.current) >= WHEEL_STEP_DELTA) {
        const dir = wheelAccRef.current > 0 ? 1 : -1;
        wheelAccRef.current -= dir * WHEEL_STEP_DELTA;
        stepBy(dir);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!FINE_POINTER || event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, active: false, pending: 0, lastY: event.clientY, moved: 0 };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const el = containerRef.current;
    if (!el) return;
    const dy = event.clientY - drag.lastY;
    drag.lastY = event.clientY;
    if (!drag.active) {
      drag.pending += dy;
      if (Math.abs(drag.pending) < 4) return;
      drag.active = true;
      el.setPointerCapture(event.pointerId);
      drag.moved += Math.abs(drag.pending);
      el.scrollTop -= drag.pending;
      return;
    }
    drag.moved += Math.abs(dy);
    el.scrollTop -= dy;
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const el = containerRef.current;
    if (el && drag.active) {
      // Доводим до ближайшего значения.
      const target = Math.max(0, Math.min(total - 1, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT)));
      el.scrollTo({ top: target * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
      if (drag.moved > 6) suppressClickRef.current = true;
    }
    dragRef.current = { pointerId: null, active: false, pending: 0, lastY: 0, moved: 0 };
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!FINE_POINTER) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      stepBy(-1);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div
        role="group"
        aria-label={label}
        className="no-scrollbar relative w-full overflow-hidden"
        style={{ height: WHEEL_HEIGHT }}
      >
        {/* Центральная «линза» под активным значением. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-xl border border-indigo-300/25 bg-indigo-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
        {/* Затемнение краёв — ощущение барабана. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-9 bg-gradient-to-b from-[rgba(4,5,12,0.92)] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-[rgba(4,5,12,0.92)] to-transparent" />

        <div
          ref={containerRef}
          onScroll={syncFromScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
          tabIndex={0}
          aria-label={`${label}: прокрутка, перетаскивание или стрелки`}
          className={cn(
            "no-scrollbar wheel-scroller h-full overflow-y-auto rounded-xl outline-none",
            "focus-visible:ring-2 focus-visible:ring-indigo-300/40",
            FINE_POINTER
              ? "snap-none cursor-grab select-none active:cursor-grabbing"
              : "snap-y snap-mandatory"
          )}
          style={{ paddingTop: WHEEL_INSET, paddingBottom: WHEEL_INSET }}
        >
          {Array.from({ length: WHEEL_COPIES }, (_, copy) =>
            values.map((value, i) => {
              const absoluteIndex = copy * count + i;
              return (
                <button
                  key={`${copy}-${i}`}
                  type="button"
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    pick(value);
                    const el = containerRef.current;
                    // jsdom не реализует Element.scrollTo — прокидываем без ошибок.
                    if (el && typeof el.scrollTo === "function") {
                      el.scrollTo({ top: homeIndexFor(value) * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
                    }
                  }}
                  className={cn(
                    "flex h-11 w-full snap-center items-center justify-center text-lg tabular-nums transition-colors duration-150",
                    absoluteIndex === centerIdx
                      ? "font-bold text-indigo-200"
                      : "text-white/35 hover:text-white/60"
                  )}
                >
                  {format(value)}
                </button>
              );
            })
          )}
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{label}</span>
    </div>
  );
}
