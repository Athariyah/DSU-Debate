import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "glass" | "ghost";
  fullWidth?: boolean;
}

/**
 * Основная кнопка приложения — белая "пилюля" с мягким свечением,
 * как на референсе ("Начать", "Голосовать", "Создать").
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", fullWidth, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-[15px] font-semibold leading-none transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary" &&
            "glow-btn bg-white text-slate-900 hover:bg-white/90",
          variant === "glass" &&
            "glass-panel border border-white/10 text-white hover:border-white/20",
          variant === "ghost" && "text-white/70 hover:text-white",
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
