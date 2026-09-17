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

      {/* Орбита и спутники — остаются */}
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

      {/* Центр — трофей DSU Event */}
      <g transform="translate(32 30)">
        {/* свечение за трофеем */}
        <circle r="18" fill="white" fillOpacity="0.06" />
        {/* чаша */}
        <path d="M -8 -10 L -8 2 C -8 7  -4 10 0 10 C 4 10 8 7 8 2 L 8 -10 Z" fill="white" fillOpacity="0.95" />
        {/* ручки */}
        <path d="M -8 -6 C -12 -6 -14 -2 -10 2" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M 8 -6 C 12 -6 14 -2 10 2" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="1.7" strokeLinecap="round" />
        {/* ножка и база */}
        <rect x="-2" y="10" width="4" height="6" rx="1" fill="white" />
        <rect x="-7" y="16" width="14" height="4" rx="1.2" fill="white" />
        {/* звезда на чаше */}
        <g transform="translate(0 -2)">
          <path d="M 0 -3 L 0.9 -1 L 2.8 -0.8 L 1.3 0.4 L 1.7 2.2 L 0 1.2 L -1.7 2.2 L -1.3 0.4 L -2.8 -0.8 L -0.9 -1 Z" fill="#6366f1" />
        </g>
      </g>
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

          {/* Монограмма DSU Event — стилизованная "E" как сцена/подиум */}
          <motion.path
            d="M 38 38 H 78 M 38 60 H 70 M 38 82 H 78"
            fill="none"
            stroke="url(#dsu-brand-stroke)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 0.95, delay: 0.3, ease: "easeInOut" },
              opacity: { duration: 0.3, delay: 0.3 },
            }}
          />
          {/* Центр — трофей DSU Event, мягко пульсирует */}
          <motion.g
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 180, damping: 14 }}
            style={{ transformOrigin: "60px 60px" }}
          >
            <motion.g
              animate={{ y: [0, -1.5, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* glow */}
              <circle cx="60" cy="62" r="18" fill="white" fillOpacity="0.07" />
              {/* trophy cup */}
              <path d="M 52 48 L 52 58 C 52 64 56 68 60 68 C 64 68 68 64 68 58 L 68 48 Z" fill="white" fillOpacity="0.95" />
              <path d="M 52 50 C 46 50 44 56 48 62" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 68 50 C 74 50 76 56 72 62" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2.2" strokeLinecap="round" />
              <rect x="58" y="68" width="4" height="7" rx="1" fill="white" />
              <rect x="53" y="75" width="14" height="4.5" rx="1.3" fill="white" />
              <path d="M 60 54 L 61 56 L 63.5 56.2 L 61.7 57.5 L 62.2 59.7 L 60 58.5 L 57.8 59.7 L 58.3 57.5 L 56.5 56.2 L 58.9 56 Z" fill="#6366f1" />
            </motion.g>
          </motion.g>
        </svg>
      </div>
    </motion.div>
  );
}
