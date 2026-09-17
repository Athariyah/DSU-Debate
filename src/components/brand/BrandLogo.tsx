import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";

interface BrandLogoMarkProps {
  className?: string;
}

/**
 * Компактный знак бренда — тот же, что в фавиконке и иконках PWA:
 * градиентный пузырь с «живыми» столбиками голосования + контур пузыря
 * собеседника и орбита голосов. Чистый SVG, масштабируется без потерь.
 * Используется в сайдбаре, в шапке трансляции и в центре QR-кода.
 */
export function BrandMark({ className }: BrandLogoMarkProps) {
  const uid = useId();
  const bubbleId = `brand-bubble-${uid}`;
  const glowId = `brand-glow-${uid}`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={bubbleId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <radialGradient id={glowId} cx="0.2" cy="0.05" r="1">
          <stop offset="0" stopColor="#6366f1" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Тёмная плитка фона — как в иконке приложения. */}
      <rect width="64" height="64" fill="#0a0c1e" />
      <rect width="64" height="64" fill={`url(#${glowId})`} />

      {/* Орбита «голосов» и спутники. */}
      <circle
        cx="32"
        cy="28.5"
        r="22"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.12"
        strokeWidth="1"
        strokeDasharray="1.5 6"
        strokeLinecap="round"
      />
      <circle cx="52.5" cy="13.5" r="1.6" fill="#7dd3fc" />
      <circle cx="12.5" cy="15" r="1.2" fill="#a78bfa" fillOpacity="0.9" />

      {/* Задний пузырь: стекло собеседника. */}
      <rect
        x="31"
        y="12"
        width="22"
        height="17"
        rx="6"
        fill="#ffffff"
        fillOpacity="0.08"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="2"
      />

      {/* Передний пузырь: живое голосование. */}
      <path d="M21 37L18 46L30 39Z" fill={`url(#${bubbleId})`} />
      <rect x="14" y="18" width="28" height="21" rx="8" fill={`url(#${bubbleId})`} />
      <rect x="20" y="25" width="4" height="8" rx="2" fill="#ffffff" />
      <rect x="26" y="21" width="4" height="12" rx="2" fill="#ffffff" />
      <rect x="32" y="23" width="4" height="10" rx="2" fill="#ffffff" />
    </svg>
  );
}

/**
 * Минималистичный бренд-марк стартового экрана: монограмма «D», внутри —
 * живой эквалайзер голосов, вокруг — орбита со спутниками. Никакой
 * растровой графики: чистый SVG, градиенты и анимации.
 *
 * Что оживляет марк:
 *  — сама «D» при появлении прорисовывается штрихом (pathLength);
 *  — три столбика внутри непрерывно «дышат» (класс logo-bar, CSS);
 *  — пунктирная орбита и два спутника медленно облетают марк (CSS);
 *  — по стеклянной плитке время от времени пробегает блик, а сама плитка
 *    парит (animate-float-y) над мягким свечением.
 * Вращения внутри SVG сделаны CSS-классами с transform-box: view-box —
 * надёжнее, чем вычисление SVG-истока в рантайме.
 */
export function BrandLogoMark({ className }: BrandLogoMarkProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotate: -10, y: 18 }}
      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 150, damping: 16, mass: 0.9 }}
      className={cn("relative", className)}
    >
      <div
        className="animate-float-y relative flex h-full w-full items-center justify-center overflow-hidden rounded-[2.3rem] border border-white/10"
        style={{
          background:
            "linear-gradient(158deg, rgba(129,140,248,0.18) 0%, rgba(139,92,246,0.10) 44%, rgba(9,11,26,0.78) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -18px 36px -26px rgba(56,189,248,0.35), 0 26px 60px -18px rgba(99,102,241,0.55)",
        }}
      >
        {/* Углы подсвечены — стекло «живёт» даже без движения. */}
        <div aria-hidden className="pointer-events-none absolute -left-7 -top-8 h-24 w-24 rounded-full bg-indigo-400/25 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-8 -right-6 h-24 w-24 rounded-full bg-sky-400/20 blur-2xl" />

        {/* Редкий блик, пробегающий по стеклу. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent"
          initial={{ x: "-170%" }}
          animate={{ x: "330%" }}
          transition={{ duration: 2.8, delay: 1.2, repeat: Infinity, repeatDelay: 6.5, ease: "easeInOut" }}
        />

        <svg viewBox="0 0 120 120" className="h-[76%] w-[76%]" aria-hidden="true">
          <defs>
            <linearGradient id="dsu-brand-stroke" x1="38" y1="34" x2="84" y2="86" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#818cf8" />
              <stop offset="0.55" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="dsu-brand-bars" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f0f9ff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#67e8f9" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* Орбита «голосов»: пунктирное кольцо медленно вращается. */}
          <circle
            cx="60"
            cy="60"
            r="47.5"
            fill="none"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1.2"
            strokeDasharray="1.5 8"
            strokeLinecap="round"
            className="logo-orbit"
          />

          {/* Спутники-«голоса» облетают марк: крупный быстрее, мелкий медленнее. */}
          <g className="logo-satellite">
            <circle cx="107.5" cy="60" r="4.5" fill="#38bdf8" opacity="0.28" />
            <circle cx="107.5" cy="60" r="2.6" fill="#bae6fd" />
          </g>
          <g className="logo-satellite-slow">
            <circle cx="60" cy="107.5" r="1.7" fill="#c4b5fd" opacity="0.9" />
          </g>

          {/* Монограмма D: ножка и чаша одним штрихом, прорисовка при появлении. */}
          <motion.path
            d="M 45 38 V 82 M 45 42 H 53 C 69.5 42 79 49.5 79 60 C 79 70.5 69.5 78 53 78 H 45"
            fill="none"
            stroke="url(#dsu-brand-stroke)"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 0.95, delay: 0.3, ease: "easeInOut" },
              opacity: { duration: 0.3, delay: 0.3 },
            }}
          />

          {/* Живые голоса внутри «D»: три дышащих столбика-эквалайзера. */}
          {[0, 1, 2].map((bar) => (
            <rect
              key={bar}
              className="logo-bar"
              x={54 + bar * 6.2}
              y={55}
              width={4.2}
              height={10}
              rx={2.1}
              fill="url(#dsu-brand-bars)"
              style={{ animationDelay: `${0.55 + bar * 0.25}s` }}
            />
          ))}
        </svg>
      </div>
    </motion.div>
  );
}
