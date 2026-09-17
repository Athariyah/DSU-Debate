import type { ReactNode } from "react";

/**
 * Mobile-first обёртка.
 *  - Телефон: весь экран.
 *  - Планшет (sm–lg): «стеклянный» телефон по центру. Размер рамки жидкий:
 *    min(430×880, окно минус 12px с каждой стороны) — контент всегда
 *    целиком умещается на экране, ничего не обрезается, а нижняя панель
 *    с кнопками прижимается к самому низу экрана (фон вокруг рамки — тот же
 *    градиент приложения, без чёрных полос).
 *  - Компьютер (lg+): полноценное веб-приложение на всю высоту окна —
 *    без рамки телефона, с боковой навигацией (см. BottomNav) и широким
 *    контентом.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh w-full font-sans text-white sm:flex sm:items-center sm:justify-center sm:p-3 lg:block lg:p-0">
      <div className="app-shell-bg relative h-dvh w-full overflow-hidden text-white sm:h-[min(880px,100dvh-1.5rem)] sm:w-[min(430px,100vw-1.5rem)] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_0_70px_-12px_rgba(99,102,241,0.4)] lg:h-dvh lg:w-full lg:rounded-none lg:border-0 lg:shadow-none">
        {children}
      </div>
    </div>
  );
}
