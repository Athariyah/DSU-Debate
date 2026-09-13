import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { z } from "zod";
import type { DebateEvent } from "../../types";
import { Button } from "../ui/Button";
import { getDeviceFingerprint } from "../../utils/device";
import { getSavedProfileName, saveProfileName, setVotedParticipant } from "../../utils/votedStore";
import { submitVote } from "../../api/debates";
import { cn } from "../../utils/cn";

const voteSchema = z.object({
  firstName: z.string().trim().min(2, "Введите имя").max(40),
  lastName: z.string().trim().min(2, "Введите фамилию").max(40),
  participantId: z.number().int().positive("Выберите участника"),
});

interface VoteModalProps {
  event: DebateEvent;
  open: boolean;
  onClose: () => void;
  onVoted: (participantId: number) => void;
  preselectedParticipantId?: number | null;
}

export function VoteModal({ event, open, onClose, onVoted, preselectedParticipantId }: VoteModalProps) {
  const saved = getSavedProfileName();
  const [firstName, setFirstName] = useState(saved?.firstName ?? "");
  const [lastName, setLastName] = useState(saved?.lastName ?? "");
  const [participantId, setParticipantId] = useState<number | null>(preselectedParticipantId ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit() {
    const result = voteSchema.safeParse({ firstName, lastName, participantId });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setApiError(null);
    setSubmitting(true);
    try {
      await submitVote({
        eventId: event.id,
        participantId: result.data.participantId,
        voterName: `${result.data.firstName} ${result.data.lastName}`,
        deviceFingerprint: getDeviceFingerprint(),
      });
      saveProfileName(result.data.firstName, result.data.lastName);
      setVotedParticipant(event.id, result.data.participantId);
      onVoted(result.data.participantId);
    } catch (error) {
      const anyError = error as { status?: number; message?: string };
      if (anyError.status === 409) {
        setVotedParticipant(event.id, result.data.participantId);
        onVoted(result.data.participantId);
      } else {
        setApiError(anyError.message ?? "Не удалось отправить голос. Попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(eventClick) => eventClick.stopPropagation()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="glass-panel safe-bottom w-full rounded-t-[2rem] border border-white/10 p-6"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Представьтесь</h3>
                <p className="mt-1 text-sm text-white/50">Чтобы ваш голос был учтён</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">Ваш голос</p>
              <div className="space-y-2">
                {event.participants.map((participant) => (
                  <button
                    key={participant.id}
                    onClick={() => setParticipantId(participant.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                      participantId === participant.id
                        ? "border-indigo-400/60 bg-indigo-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{participant.name}</p>
                      {participant.subtitle && <p className="text-xs text-white/45">{participant.subtitle}</p>}
                    </div>
                    <div
                      className={cn(
                        "h-4 w-4 shrink-0 rounded-full border-2",
                        participantId === participant.id ? "border-indigo-400 bg-indigo-400" : "border-white/25"
                      )}
                    />
                  </button>
                ))}
              </div>
              {errors.participantId && <p className="text-xs text-rose-400">{errors.participantId}</p>}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/40">Имя</label>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Иван"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
                />
                {errors.firstName && <p className="mt-1 text-xs text-rose-400">{errors.firstName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/40">Фамилия</label>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Иванов"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-indigo-400/60"
                />
                {errors.lastName && <p className="mt-1 text-xs text-rose-400">{errors.lastName}</p>}
              </div>
            </div>

            {apiError && <p className="mt-3 text-xs text-rose-400">{apiError}</p>}

            <div className="mt-2 flex items-center gap-1.5 pt-3 text-[11px] text-white/35">
              <ShieldCheck size={13} />
              Один голос с одного устройства и IP-адреса
            </div>

            <Button fullWidth className="mt-4" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : "Отправить голос"}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
