import { cn } from "../../utils/cn";

interface BadgeProps {
  children: React.ReactNode;
  tone?: "active" | "neutral";
  className?: string;
}

export function Badge({ children, tone = "active", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md",
        tone === "active"
          ? "border-white/15 bg-white/10 text-white"
          : "border-white/10 bg-white/5 text-white/70",
        className
      )}
    >
      {tone === "active" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
        </span>
      )}
      {children}
    </span>
  );
}
