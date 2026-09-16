import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "../../utils/cn";

const pad = (value: number) => String(value).padStart(2, "0");

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
 * Поле даты и времени для телефона: два отдельных нативных виджета вместо
 * одного `datetime-local`. Один `datetime-local` на узком экране растягивает
 * свои внутренние сегменты и вылезает за рамку карточки; раздельные поля
 * помещаются всегда, а если места совсем нет — время переносится на
 * следующую строку (flex-wrap).
 */
export function DateTimeField({ value, onChange, className }: DateTimeFieldProps) {
  const [parts, setParts] = useState(() => splitDateTime(value));

  // Внешнее значение может прийти позже (загрузка мероприятия) или измениться
  // из другого места — синхронизируем поля с ним.
  useEffect(() => {
    setParts(splitDateTime(value));
  }, [value]);

  function update(patch: Partial<{ date: string; time: string }>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const iso = combineDateTime(next.date, next.time);
    if (iso) onChange(iso);
  }

  return (
    <div
      className={cn(
        "date-field glass-panel flex flex-wrap items-stretch gap-1.5 rounded-2xl border border-white/10 p-1.5",
        className
      )}
    >
      <label className="flex min-w-[9rem] flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
        <CalendarDays size={16} className="pointer-events-none shrink-0 text-white/35" />
        <input
          type="date"
          value={parts.date}
          onChange={(event) => update({ date: event.target.value })}
          aria-label="Дата"
          className="min-w-0 flex-1 bg-transparent text-white outline-none"
        />
      </label>

      <label className="flex w-[8.25rem] shrink-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
        <Clock size={16} className="pointer-events-none shrink-0 text-white/35" />
        <input
          type="time"
          value={parts.time}
          onChange={(event) => update({ time: event.target.value })}
          aria-label="Время"
          className="min-w-0 flex-1 bg-transparent text-white outline-none"
        />
      </label>
    </div>
  );
}
