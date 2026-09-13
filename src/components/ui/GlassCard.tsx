import { type HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export function GlassCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass-panel rounded-3xl border border-white/10",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
