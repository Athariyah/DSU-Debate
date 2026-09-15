import { Home, MessagesSquare, Plus, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { cn } from "../../utils/cn";
import { isAdminAuthenticated } from "../../api/debates";

const items = [
  { to: "/home", label: "Главная", icon: Home },
  { to: "/debates", label: "Дебаты", icon: MessagesSquare },
];

const profileItem = { to: "/profile", label: "Профиль", icon: UserRound };

export function BottomNav() {
  // Кнопка «Создать» видна только администратору, вошедшему через вкладку
  // «Профиль», ведёт на экран администрирования и сидит ВНУТРИ панели —
  // ничего не торчит наружу.
  const isAdmin = isAdminAuthenticated();

  return (
    <div className="safe-bottom absolute inset-x-0 bottom-0 z-30 px-5 pb-4">
      <div className="glass-panel flex items-center justify-between rounded-[1.75rem] border border-white/10 px-4 py-3">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <AnimatePresence initial={false}>
          {isAdmin && (
            <motion.div
              key="admin-create"
              initial={{ scale: 0, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.8 }}
            >
              <NavLink
                to="/admin"
                className="flex flex-col items-center gap-1 px-2 py-1"
                aria-label="Создать мероприятие"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-[0.7rem] border border-white/25 bg-gradient-to-br from-indigo-400 via-violet-500 to-sky-400 text-white shadow-[0_4px_14px_-4px_rgba(99,102,241,0.65),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all duration-200 active:scale-90",
                        isActive && "ring-2 ring-white/40"
                      )}
                    >
                      <Plus size={15} strokeWidth={2.75} />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isActive ? "text-white" : "text-white/40"
                      )}
                    >
                      Создать
                    </span>
                  </>
                )}
              </NavLink>
            </motion.div>
          )}
        </AnimatePresence>

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
