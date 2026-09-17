import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Award, EyeOff, Flame, LayoutGrid, Loader2, Plus, Timer, Trophy, Type, UserX, Users, X } from "lucide-react";
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
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [participants, setParticipants] = useState<DraftParticipant[]>([emptyParticipant(), emptyParticipant()]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [hiddenFromPublic, setHiddenFromPublic] = useState(false);
  const [votesHidden, setVotesHidden] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [showStandings, setShowStandings] = useState(true);
  const [showPodium, setShowPodium] = useState(true);
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
      setError("Введите тему мероприятия (минимум 4 символа)");
      return;
    }
    if (eventType === "other" && customTypeLabel.trim().length > 0 && customTypeLabel.trim().length < 2) {
      setError("Название типа мероприятия — минимум 2 символа");
      return;
    }
    if (participants.some((p) => p.name.trim().length < 2)) {
      setError("Заполните имена всех участников");
      return;
    }
    if (!scheduledAt) {
      setError("Выберите дату и время мероприятия");
      return;
    }

    setSubmitting(true);
    try {
      const parsedDuration = durationMinutes.trim() === "" ? null : Number(durationMinutes);
      await createDebate({
        title: title.trim(),
        format: participants.length,
        eventType,
        customTypeLabel: eventType === "other" ? (customTypeLabel.trim() || null) : null,
        participants: participants.map((p) => ({ name: p.name.trim(), subtitle: p.subtitle.trim() || undefined })),
        scheduledAt: new Date(scheduledAt).toISOString(),
        votingDurationMinutes:
          parsedDuration === null || !Number.isFinite(parsedDuration)
            ? null
            : Math.min(1440, Math.max(1, Math.round(parsedDuration))),
        votesHidden,
        hiddenFromPublic,
        showLeaderboard,
        showStandings,
        showPodium,
      });
      navigate("/admin");
    } catch (createError) {
      setError(
        createError instanceof Error && createError.message
          ? createError.message
          : "Не удалось создать мероприятие. Попробуйте ещё раз."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar showBack onBack={() => navigate("/admin")} title="Создать мероприятие" rightSlot="menu" />

      <div className="styled-scrollbar mx-auto flex-1 w-full max-w-3xl overflow-y-auto px-5 pb-8 pt-2 lg:px-8 lg:pt-6">
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
          {eventType === "other" && (
            <div className="mt-3 glass-panel flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3.5">
              <IconChip icon={Type} iconSize={15} />
              <input
                value={customTypeLabel}
                onChange={(e) => setCustomTypeLabel(e.target.value)}
                placeholder="Название типа — например: Хакатон"
                maxLength={50}
                className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none"
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-white/30">Мероприятия, турниры и опросы используют одинаковые голосования, но трансляция и таблицы адаптируются.</p>
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
            Видимость и доступ
          </label>
          <div className="space-y-2.5">
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
                    ? "Мероприятие будет видно только администраторам"
                    : "Мероприятие будет видно обычным пользователям"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hiddenFromPublic}
                aria-label="Скрыть мероприятие от обычных пользователей"
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

            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300",
                votesHidden ? "border-violet-300/30 bg-violet-400/[0.08]" : "glass-panel border-white/10"
              )}
            >
              <IconChip icon={EyeOff} iconSize={15} tone={votesHidden ? "accent" : "neutral"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">Скрыть голоса</p>
                <p className="text-[11px] leading-relaxed text-white/35">
                  {votesHidden ? "Зрители не видят голоса и проценты до раскрытия" : "Голоса и проценты видны всем"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={votesHidden}
                aria-label="Скрыть голоса"
                onClick={() => setVotesHidden((v) => !v)}
                className={cn(
                  "relative h-[26px] w-11 shrink-0 rounded-full border transition-colors duration-300",
                  votesHidden
                    ? "border-violet-300/50 bg-gradient-to-r from-violet-500/80 via-indigo-500/70 to-violet-400/80 shadow-[0_4px_16px_-4px_rgba(124,58,237,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
                    : "border-white/15 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                )}
              >
                <motion.span
                  aria-hidden
                  className="absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                  animate={{ x: votesHidden ? 18 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Отображение вкладок
          </label>
          <p className="mb-2 text-[11px] leading-relaxed text-white/35">Голосование показывается всегда. Остальные вкладки можно скрыть.</p>
          <div className="space-y-2.5">
            {[
              { key: "leaderboard", label: "Лидеры", desc: "Вкладка с топом участников", icon: Trophy, value: showLeaderboard, setter: setShowLeaderboard },
              { key: "standings", label: "Таблица", desc: "Турнирная таблица по очкам", icon: LayoutGrid, value: showStandings, setter: setShowStandings },
              { key: "podium", label: "Пьедестал", desc: "Пьедестал призёров", icon: Award, value: showPodium, setter: setShowPodium },
            ].map((item) => (
              <div key={item.key} className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors", item.value ? "glass-panel border-white/10" : "border-white/5 bg-black/20 opacity-70")}>
                <IconChip icon={item.icon} iconSize={15} tone={item.value ? "neutral" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-[11px] leading-relaxed text-white/35">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.value}
                  onClick={() => item.setter((v) => !v)}
                  className={cn(
                    "relative h-[26px] w-11 shrink-0 rounded-full border transition-colors duration-300",
                    item.value
                      ? "border-indigo-300/50 bg-gradient-to-r from-indigo-500/80 via-violet-500/70 to-indigo-400/80 shadow-[0_4px_16px_-4px_rgba(99,102,241,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
                      : "border-white/15 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                  )}
                >
                  <motion.span
                    aria-hidden
                    className="absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
                    animate={{ x: item.value ? 18 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2 lg:px-8">
        <Button fullWidth onClick={handleSubmit} disabled={submitting} className="inline-flex items-center justify-center gap-2 leading-none">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <span className="translate-y-[0.5px] leading-none">Создать мероприятие</span>}
        </Button>
      </div>
    </div>
  );
}
