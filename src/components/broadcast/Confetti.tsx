import { useMemo } from "react";
import { motion } from "framer-motion";

const COLORS = ["#fbbf24", "#f8fafc", "#38bdf8", "#a78bfa", "#34d399", "#f472b6"];

interface Piece {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  color: string;
  round: boolean;
}

/**
 * Лёгкое конфетти на чистом Framer Motion (без дополнительных зависимостей).
 * Значения генерируются один раз и мемоизируются, чтобы перерисовки не
 * «перетряхивали» частицы.
 */
export function Confetti({ pieces = 80 }: { pieces?: number }) {
  const items = useMemo<Piece[]>(
    () =>
      Array.from({ length: pieces }, (_, index) => ({
        left: (index * 97) % 100 + ((index * 13) % 7) / 10,
        size: 6 + ((index * 7) % 10),
        delay: ((index * 11) % 14) / 10,
        duration: 2.6 + ((index * 5) % 20) / 10,
        drift: (((index * 37) % 200) - 100) * 1.6,
        color: COLORS[index % COLORS.length],
        round: index % 3 === 0,
      })),
    [pieces]
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute top-0"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.45,
            backgroundColor: piece.color,
            borderRadius: piece.round ? "9999px" : "2px",
            opacity: 0,
          }}
          initial={{ y: "-8vh", opacity: 0, rotate: 0, x: 0 }}
          animate={{ y: "108vh", opacity: [0, 1, 1, 0.9, 0], rotate: 720, x: piece.drift }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
