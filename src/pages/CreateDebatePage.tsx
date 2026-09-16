import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Type, X } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Button } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { createDebate } from "../api/debates";

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
  const [participants, setParticipants] = useState<DraftParticipant[]>([emptyParticipant(), emptyParticipant()]);
  const [scheduledAt, setScheduledAt] = useState("");
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
      await createDebate({
        title: title.trim(),
        format: participants.length,
        participants: participants.map((p) => ({ name: p.name.trim(), subtitle: p.subtitle.trim() || undefined })),
        scheduledAt: new Date(scheduledAt).toISOString(),
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

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-2">
        <section>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/40">
            Тема дебата
          </label>
          <div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3.5">
            <Type size={16} className="text-white/35" />
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
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70"
                    aria-label="Удалить участника"
                  >
                    <X size={14} />
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

        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      </div>

      <div className="safe-bottom px-5 pb-5 pt-2">
        <Button fullWidth onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : "Создать"}
        </Button>
      </div>
    </div>
  );
}
