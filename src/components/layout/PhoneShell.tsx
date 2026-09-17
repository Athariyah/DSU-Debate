import type { ReactNode } from "react";

/**
 * Mobile-first обёртка.
 *  - Телефон: весь экран.
 *  - Планшет (sm–lg): компактный «стеклянный» телефон по центру,
 *    как на референсных макетах.
 *  - Компьютер (lg+): полноценное веб-приложение на всю высоту окна —
 *    без рамки телефона, с боковой навигацией (см. BottomNav) и широким
 *    контентом.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh w-full bg-[#020204] font-sans text-white sm:flex sm:items-center sm:justify-center sm:p-6 lg:block lg:p-0">
      <div className="app-shell-bg relative h-dvh w-full overflow-hidden text-white sm:h-[880px] sm:w-[430px] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] lg:h-dvh lg:w-full lg:rounded-none lg:border-0 lg:shadow-none">
        {children}
      </div>
    </div>
  );
}
