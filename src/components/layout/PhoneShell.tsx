import type { ReactNode } from "react";

/**
 * Mobile-first обёртка: на телефоне занимает весь экран, на десктопе —
 * аккуратно центрируется в виде компактного "стекла" шириной телефона,
 * повторяя пропорции референсных макетов.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh w-full bg-[#020204] font-sans text-white sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="app-shell-bg relative flex h-dvh w-full flex-col overflow-hidden sm:h-[880px] sm:w-[430px] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        {children}
      </div>
    </div>
  );
}
