import { Home, MessagesSquare, Plus, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../utils/cn";
import { isAdminAuthenticated } from "../../api/debates";

const items = [
  { to: "/home", label: "Главная", icon: Home },
  { to: "/debates", label: "Дебаты", icon: MessagesSquare },
];

const profileItem = { to: "/profile", label: "Профиль", icon: UserRound };

export function BottomNav() {
  // Кнопка «+» (создание мероприятий) видна только администратору, вошедшему
  // через вкладку «Профиль», и ведёт исключительно на экран администрирования.
  const isAdmin = isAdminAuthenticated();

  return (
    <div className="safe-bottom absolute inset-x-0 bottom-0 z-30 px-5 pb-4">
      <div className="glass-panel flex items-center justify-between rounded-[1.75rem] border border-white/10 px-4 py-3">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {isAdmin && (
          <NavLink to="/admin" aria-label="Администрирование">
            {({ isActive }) => (
              <div
                className={cn(
                  "-mt-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-indigo-400 via-violet-500 to-sky-400 text-white shadow-[0_10px_25px_-5px_rgba(99,102,241,0.7)] transition-transform active:scale-95",
                  isActive && "scale-105"
                )}
              >
                <Plus size={24} strokeWidth={2.5} />
              </div>
            )}
          </NavLink>
        )}

        <NavItem {...profileItem} />
      </div>
    </div>
  );
}

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink to={to} className="flex flex-col items-center gap-1 px-2 py-1">
      {({ isActive }) => (
        <>
          <Icon size={20} className={isActive ? "text-white" : "text-white/40"} />
          <span className={cn("text-[10px] font-medium", isActive ? "text-white" : "text-white/40")}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
