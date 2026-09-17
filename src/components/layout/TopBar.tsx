import { ChevronLeft, MoreVertical, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../utils/cn";

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  rightSlot?: "menu" | "profile" | "none";
  onMenuClick?: () => void;
  /** Куда ведёт стрелка «назад»; по умолчанию — предыдущая страница истории. */
  onBack?: () => void;
}

/**
 * Шапка страницы: заголовок по центру и круглые «стеклянные» кнопки.
 * Отступ сверху увеличен, кнопки 44px — удобно попадать пальцем, ничего
 * не прижато к краю экрана.
 */
export function TopBar({ title, showBack, rightSlot = "none", onMenuClick, onBack }: TopBarProps) {
  const navigate = useNavigate();

  const slotButtonClass = cn(
    "glass-panel flex h-11 w-11 items-center justify-center rounded-full",
    "border border-white/10 text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)]",
    "transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-95"
  );

  return (
    <header className="z-20 flex items-center justify-between gap-3 px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] sm:px-6 lg:pt-[calc(env(safe-area-inset-top,0px)+2rem)]">
      <div className="flex min-w-11 items-center">
        {showBack && (
          <button onClick={onBack ?? (() => navigate(-1))} className={slotButtonClass} aria-label="Назад">
            <ChevronLeft size={20} />
          </button>
        )}
      </div>

      {title && (
        <h1 className="min-w-0 truncate bg-gradient-to-b from-white to-white/65 bg-clip-text text-center text-[19px] font-bold tracking-tight text-transparent">
          {title}
        </h1>
      )}

      <div className="flex min-w-11 items-center justify-end">
        {rightSlot === "menu" && (
          <button onClick={onMenuClick} className={slotButtonClass} aria-label="Меню">
            <MoreVertical size={20} />
          </button>
        )}
        {rightSlot === "profile" && (
          <button onClick={() => navigate("/profile")} className={slotButtonClass} aria-label="Профиль">
            <UserRound size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
