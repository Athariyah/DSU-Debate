import { Home, MessagesSquare, Plus, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { cn } from "../../utils/cn";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { BrandMark } from "../brand/BrandLogo";

const items = [
  { to: "/home", label: "Главная", icon: Home },
  { to: "/debates", label: "Мероприятия", icon: MessagesSquare },
];

const profileItem = { to: "/profile", label: "Профиль", icon: UserRound };

export function BottomNav() {
  // Кнопка «Создать» видна только администратору с живой сессией (вход через
  // «Профиль»), ведёт на экран администрирования и сидит ВНУТРИ панели.
  const isAdmin = useAdminAuth();

  return (
    <>
      {/* Mobile / планшет: нижняя «стеклянная» пилюля */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-5 pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
        <div className="glass-panel flex items-center justify-between rounded-[1.75rem] border border-white/10 px-4 py-3">
          {items.map((item) => (
            <MobileNavItem key={item.to} {...item} />
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
                          "text-[10px] font-medium leading-none translate-y-[0.5px]",
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

          <MobileNavItem {...profileItem} />
        </div>
      </div>

      {/* Компьютер: левая боковая панель на всю высоту */}
      <div className="absolute inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <div className="flex h-full flex-col border-r border-white/10 bg-black/25 px-4 py-6 backdrop-blur-2xl">
          <div className="mb-6 flex items-center gap-3 px-2">
            {/* Актуальный знак бренда — тот же, что в иконке приложения. */}
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)] ring-1 ring-white/15">
              <BrandMark className="h-full w-full" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold leading-5 tracking-tight text-white">DSU Event</p>
              {/* Явный leading-4 (16px при 10px шрифта): строка не может
                  «срезаться» снизу ни при каком рендере. */}
              <p className="block text-[10px] font-medium uppercase leading-4 tracking-[0.18em] text-white/35">
                live голосования
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {items.map((item) => (
              <DesktopNavItem key={item.to} {...item} />
            ))}

            <AnimatePresence initial={false}>
              {isAdmin && (
                <motion.div
                  key="admin-create-desktop"
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 480, damping: 30 }}
                >
                  <NavLink
                    to="/admin"
                    aria-label="Создать мероприятие"
                    className={({ isActive }) =>
                      cn(
                        "mt-2 flex items-center justify-center gap-1.5 rounded-2xl border border-white/25 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 px-4 py-3 text-sm font-bold leading-none text-white shadow-[0_10px_28px_-10px_rgba(99,102,241,0.9),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]",
                        isActive && "ring-2 ring-white/40"
                      )
                    }
                  >
                    <Plus size={16} strokeWidth={2.75} className="shrink-0" />
                    <span className="leading-none translate-y-[0.5px]">Создать</span>
                  </NavLink>
                </motion.div>
              )}
            </AnimatePresence>

            <DesktopNavItem {...profileItem} />
          </nav>

          <div className="mt-auto px-2 pb-1">
            <p className="text-[10px] leading-relaxed text-white/30">
              Разработано для СНО ДГУ
              <br />
              от СНО ФИиИТ
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function MobileNavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink to={to} className="flex flex-col items-center gap-1 px-2 py-1">
      {({ isActive }) => (
        <>
          <Icon size={20} className={isActive ? "text-white" : "text-white opacity-40"} />
          <span className={cn("text-[10px] font-medium", isActive ? "text-white" : "text-white/40")}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function DesktopNavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all duration-200",
          isActive
            ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "text-white/45 hover:bg-white/5 hover:text-white"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={18}
            className={cn("transition-transform duration-200", !isActive && "group-hover:scale-105")}
          />
          <span className="flex-1">{label}</span>
          {isActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]" />
          )}
        </>
      )}
    </NavLink>
  );
}
