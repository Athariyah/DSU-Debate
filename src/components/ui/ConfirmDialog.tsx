import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Trash2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  /** Заголовок окна, например «Удалить мероприятие?». */
  title: string;
  /** Пояснение под заголовкомом — что именно будет удалено. */
  message: string;
  confirmLabel?: string;
  /** Показывает спиннер на кнопке удаления (идёт запрос). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Собственное окно подтверждения в стилистике приложения — вместо
 * системного `window.confirm`. Матовая «стеклянная» карточка по центру,
 * затемнённый blur-фон, красный акцент опасного действия. Закрытие:
 * «Отмена», клик по фону или Escape.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Удалить",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape закрывает окно (если не идёт запрос).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Затемнение + blur; клик мимо карточки отменяет действие. */}
          <button
            type="button"
            aria-label="Закрыть окно"
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (!busy) onCancel();
            }}
          />

          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="frosted-panel relative w-full max-w-sm max-h-[85vh] overflow-y-auto styled-scrollbar rounded-3xl border border-white/15 p-6"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-500/25 to-red-600/20 shadow-[0_10px_30px_-10px_rgba(244,63,94,0.7)]">
              <Trash2 size={22} className="text-rose-300" />
            </div>

            <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">{message}</p>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="glass-panel inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-[15px] font-semibold text-white transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 px-4 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.8)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
