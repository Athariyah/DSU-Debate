import { ChevronLeft, MoreVertical, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  rightSlot?: "menu" | "profile" | "none";
  onMenuClick?: () => void;
}

export function TopBar({ title, showBack, rightSlot = "none", onMenuClick }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <div className="safe-top flex items-center justify-between px-5 pb-2 pt-5">
      <div className="flex min-w-9 items-center">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
            aria-label="Назад"
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {title && <h1 className="text-[17px] font-semibold text-white">{title}</h1>}

      <div className="flex min-w-9 items-center justify-end">
        {rightSlot === "menu" && (
          <button
            onClick={onMenuClick}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"
            aria-label="Меню"
          >
            <MoreVertical size={18} />
          </button>
        )}
        {rightSlot === "profile" && (
          <button
            onClick={() => navigate("/profile")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10"
            aria-label="Профиль"
          >
            <UserRound size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
