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
 *  - PWA standalone: классы app-shell-screen/app-shell-frame — крючки для
 *    index.css, где высоты экранов переключаются на 100vh (физическая
 *    высота экрана), чтобы градиент заходил под статус-бар сверху и
 *    дотягивался до последнего пикселя снизу без чёрных полос.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell-bg app-shell-screen h-dvh min-h-dvh w-full overflow-hidden font-sans text-white sm:flex sm:items-center sm:justify-center sm:p-3 lg:block lg:p-0">
      <div className="app-shell-bg app-shell-frame relative h-dvh min-h-dvh w-full overflow-hidden text-white sm:h-[min(880px,100dvh-1.5rem)] sm:min-h-0 sm:w-[min(430px,100vw-1.5rem)] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_0_70px_-12px_rgba(99,102,241,0.4)] lg:h-dvh lg:min-h-0 lg:w-full lg:rounded-none lg:border-0 lg:shadow-none">
        {children}
      </div>
    </div>
  );
}
