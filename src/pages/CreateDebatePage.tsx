import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Flame, Loader2, Plus, Timer, Trophy, Type, UserX, Users, X } from "lucide-react";
import type { EventType } from "../types";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { IconChip } from "../components/ui/IconChip";
import { createDebate } from "../api/debates";
import { cn } from "../utils/cn";

interface DraftParticipant {
  id: string;
  name: string;
  subtitle: string;
}

function emptyParticipant(): DraftParticipant {
  return { id: crypto.randomUUID(), name: "", subtitle: "" };
}

export function CreateDebatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<EventType>("debate");
  const [participants, setParticipants] = useState<DraftParticipant[]>([emptyParticipant(), emptyParticipant()]);
  const [scheduledAt, setScheduledAt] = useState("");
  /** Опциональный таймер голосования, минуты (пусто — выключен). */
  const [durationMinutes, setDurationMinutes] = useState("");
  /** Флажок: дебат не показывать обычным пользователям. */
  const [hiddenFromPublic, setHiddenFromPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateParticipant(id: string, patch: Partial<DraftParticipant>) {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => (prev.length <= 2 ? prev : prev.filter((p) => p.id !== id)));
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, emptyParticipant()]);
  }

  async function handleSubmit() {
    setError(null);
    if (title.trim().length < 4) {
      setError("Введите тему дебата (минимум 4 символа)");
      return;
    }
    if (participants.some((p) => p.name.trim().length < 2)) {
      setError("Заполните имена всех участников");
      return;
    }
    if (!scheduledAt) {
      setError("Выберите дату и время дебата");
      return;
    }

    setSubmitting(true);
    try {
      const parsedDuration = durationMinutes.trim() === "" ? null : Number(durationMinutes);
      await createDebate({
        title: title.trim(),
        format: participants.length,
        eventType,
        participants: participants.map((p) => ({ name: p.name.trim(), subtitle: p.subtitle.trim() || undefined })),
        scheduledAt: new Date(scheduledAt).toISOString(),
        votingDurationMinutes:
          parsedDuration === null || !Number.isFinite(parsedDuration)
            ? null
            : Math.min(1440, Math.max(1, Math.round(parsedDuration))),
        hiddenFromPublic,
      });
      navigate("/admin");
    } catch (createError) {
      // Показываем реальную причину. Если это 401, стор сам перейдёт в
      // «expired» и ProtectedRoute покажет вход на месте — несогласованного
      // состояния «кнопка есть, а доступа нет» не возникает.
      setError(
        createError instanceof Error && createError.message
          ? createError.message
          : "Не удалось создать дебат. Попробуйте ещё раз."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Стрелка «назад» всегда возвращает на панель администрирования. */}
      <TopBar showBack onBack={() => navigate("/admin")} title="Создать дебат" rightSlot="menu" />

      <div className="no-scrollbar mx-auto flex-1 w-full max-w-3xl overflow-y-auto px-5 pb-8 pt-2 lg:px-8 lg:pt-6">
        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Тип мероприятия
          </label>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            {([
              ["debate", "Дебаты", Type],
              ["tournament", "Турнир", Trophy],
              ["poll", "Опрос", Users],
              ["competition", "Конкурс", Flame],
              ["quiz", "Квиз", Type],
              ["other", "Другое", Type],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setEventType(value as EventType)} className={cn("flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-xs font-medium transition", eventType === value ? "border-indigo-400/50 bg-indigo-500/20 text-white shadow" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10")}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/30">Дебаты, турниры и опросы используют одинаковые голосования, но трансляция и таблиц�� адаптируются.</p>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Тема мероприятия
          </label>
          <div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3.5">
            <IconChip icon={Type} iconSize={15} />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите тему"
              className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none"
            />
          </div>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Участники
          </label>
          <div className="space-y-2.5">
            {participants.map((p, idx) => (
              <div
                key={p.id}
                className="glass-panel flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    value={p.name}
                    onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                    placeholder={`Имя участника ${idx + 1}`}
                    className="w-full bg-transparent text-sm font-medium text-white placeholder:text-white/30 outline-none"
                  />
                  <input
                    value={p.subtitle}
                    onChange={(e) => updateParticipant(p.id, { subtitle: e.target.value })}
                    placeholder="Позиция (необязательно)"
                    className="w-full bg-transparent text-xs text-white/45 placeholder:text-white/25 outline-none"
                  />
                </div>
                {participants.length > 2 && (
                  <button
                    onClick={() => removeParticipant(p.id)}
                    className="group flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
                    aria-label="Удалить участника"
                  >
                    <X size={14} className="text-white opacity-30 transition group-hover:opacity-70" />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addParticipant}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3.5 text-sm font-medium text-white/50 transition hover:border-white/30 hover:text-white/80"
            >
              <Plus size={16} />
              Добавить участника
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/35">
            Формат не ограничен: участников может быть сколько угодно (минимум 2).
          </p>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Дата и время
          </label>
          <div className="relative">
            <DateTimeField value={scheduledAt} onChange={setScheduledAt} />
          </div>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Таймер голосования
          </label>
          <div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3">
            <IconChip icon={Timer} iconSize={15} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Автостоп голосования</p>
              <p className="text-[11px] leading-relaxed text-white/35">
                Опционально: после запуска голосование закроется само через этот интервал
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={1440}
              inputMode="numeric"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              placeholder="—"
              aria-label="Длительность таймера в минутах"
              className="w-16 rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center text-sm font-semibold tabular-nums text-white outline-none transition focus:border-indigo-300/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-white/45">мин</span>
          </div>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Видимость
          </label>
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300",
              hiddenFromPublic
                ? "border-amber-300/30 bg-amber-400/[0.08]"
                : "glass-panel border-white/10"
            )}
          >
            <IconChip icon={hiddenFromPublic ? UserX : Users} iconSize={15} tone={hiddenFromPublic ? "accent" : "neutral"} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Скрыть от публики</p>
              <p className="text-[11px] leading-relaxed text-white/35">
                {hiddenFromPublic
                  ? "Дебат будет виден только администраторам"
                  : "Дебат будет виден обычным пользователям"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hiddenFromPublic}
              aria-label="Скрыть дебат от обычных пользователей"
              onClick={() => setHiddenFromPublic((value) => !value)}
              className={cn(
                "relative h-[26px] w-11 shrink-0 rounded-full border transition-colors duration-300",
                hiddenFromPublic
                  ? "border-amber-300/50 bg-gradient-to-r from-amber-500/80 via-orange-500/70 to-amber-400/80 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
                  : "border-white/15 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
              )}
            >
              <motion.span
                aria-hidden
                className="absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                animate={{ x: hiddenFromPublic ? 18 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </section>

        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2 lg:px-8">
        <Button fullWidth onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : "Создать"}
        </Button>
      </div>
    </div>
  );
}
