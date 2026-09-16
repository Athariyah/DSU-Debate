import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { MonitorPlay, Smartphone, Vote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { cn } from "../utils/cn";

/**
 * Загрузочный экран — карусель из трёх слайдов. Точки внизу теперь не
 * декорация, а индикатор: экран можно листать свайпом (мышью/пальцем),
 * стрелками клавиатуры или тапом по точке.
 */
const SWIPE_OFFSET = 70;
const SWIPE_VELOCITY = 400;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "55%" : direction < 0 ? "-55%" : "0%",
    opacity: 0,
    scale: 0.92,
    filter: "blur(6px)",
  }),
  center: { x: "0%", opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: (direction: number) => ({
    x: direction > 0 ? "-45%" : "45%",
    opacity: 0,
    scale: 0.94,
    filter: "blur(6px)",
  }),
};

interface Slide {
  id: string;
  icon: typeof Vote;
  title: string;
  text: string;
  art: "logo" | "phone" | "screen";
}

const SLIDES: Slide[] = [
  {
    id: "brand",
    icon: Vote,
    title: "DSU Debate",
    text: "Твой голос — решение в споре.",
    art: "logo",
  },
  {
    id: "vote",
    icon: Smartphone,
    title: "Голосуй с телефона",
    text: "Один тап — и голос учтён. Анонимно: от накруток защищают устройство и IP.",
    art: "phone",
  },
  {
    id: "live",
    icon: MonitorPlay,
    title: "Живые результаты",
    text: "Проценты обновляются в реальном времени, а для зала — трансляция на большом экране.",
    art: "screen",
  },
];

export function SplashPage() {
  const navigate = useNavigate();
  const [[page, direction], setPage] = useState<[number, number]>([0, 0]);
  const [touched, setTouched] = useState(false);

  const goTo = (index: number, dir?: number) => {
    const next = Math.min(Math.max(index, 0), SLIDES.length - 1);
    if (next === page) return;
    setTouched(true);
    setPage([next, dir ?? (next > page ? 1 : -1)]);
  };

  const paginate = (dir: number) => goTo(page + dir, dir);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") paginate(1);
      if (event.key === "ArrowLeft") paginate(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onDragEnd(_event: unknown, info: PanInfo) {
    const { x } = info.offset;
    const { x: velocity } = info.velocity;
    if (x < -SWIPE_OFFSET || velocity < -SWIPE_VELOCITY) paginate(1);
    else if (x > SWIPE_OFFSET || velocity > SWIPE_VELOCITY) paginate(-1);
  }

  const slide = SLIDES[page];

  return (
    <div className="safe-top safe-bottom relative flex h-full flex-col overflow-hidden px-7 pb-8 pt-14">
      <SplashBackdrop />

      <div className="relative flex-1">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.section
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="absolute inset-0 flex cursor-grab touch-pan-y flex-col items-center justify-center active:cursor-grabbing"
            aria-roledescription="слайд"
            aria-label={`${page + 1} из ${SLIDES.length}`}
          >
            <SlideArt art={slide.art} />

            <div className="mt-12 flex flex-col items-center text-center">
              {slide.art !== "logo" && (
                <motion.span
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15, duration: 0.35 }}
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] text-indigo-200 shadow-[0_8px_30px_-8px_rgba(99,102,241,0.6)]"
                >
                  <slide.icon size={22} />
                </motion.span>
              )}

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className={cn(
                  "font-extrabold tracking-tight text-white",
                  slide.art === "logo" ? "text-[34px]" : "text-[26px]"
                )}
              >
                {slide.title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="mt-3 max-w-[26ch] text-[15px] leading-relaxed text-white/55"
              >
                {slide.text}
              </motion.p>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="relative flex flex-col items-center gap-3">
        <p
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-white/35 transition-opacity duration-500",
            touched && "opacity-0"
          )}
          aria-hidden={touched}
        >
          <motion.span
            animate={{ x: [0, -3, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            ‹
          </motion.span>
          свайпай, чтобы листать
          <motion.span
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            ›
          </motion.span>
        </p>

        <div className="flex items-center gap-2.5" role="tablist" aria-label="Слайды вступления">
          {SLIDES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === page}
              aria-label={`Слайд ${index + 1}: ${item.title}`}
              onClick={() => goTo(index)}
              className="group flex h-6 w-6 items-center justify-center"
            >
              <motion.span
                animate={{
                  width: index === page ? 22 : 6,
                  backgroundColor:
                    index === page ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.25)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="h-1.5 rounded-full group-hover:bg-white/50"
              />
            </button>
          ))}
        </div>

        <Button fullWidth onClick={() => navigate("/home")}>
          Начать →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Фоны и «арт» слайдов                                                */
/* ------------------------------------------------------------------ */

/** Живой фон: дрейфующие орбы + мерцающие точки вместо статики. */
function SplashBackdrop() {
  const stars = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => ({
        left: (index * 37) % 100,
        top: (index * 53) % 100,
        size: 1 + (index % 3) * 0.7,
        delay: ((index * 7) % 40) / 10,
        duration: 2.5 + ((index * 3) % 30) / 10,
      })),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="animate-drift absolute -left-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
      <div className="animate-drift-slow absolute -right-20 top-10 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="animate-drift absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />

      {stars.map((star, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full bg-white"
          style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size }}
          animate={{ opacity: [0.08, 0.5, 0.08] }}
          transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function SlideArt({ art }: { art: Slide["art"] }) {
  if (art === "phone") {
    return (
      <div className="relative flex h-52 w-52 items-center justify-center">
        <div className="absolute h-40 w-40 rounded-full bg-indigo-500/25 blur-3xl" />
        <motion.div
          className="animate-float-y relative flex h-40 w-24 -rotate-3 flex-col items-center rounded-[1.6rem] border border-white/20 bg-gradient-to-b from-white/15 to-white/[0.03] shadow-[0_20px_50px_-16px_rgba(99,102,241,0.7)] backdrop-blur-md"
        >
          <div className="mt-2 h-1 w-8 rounded-full bg-white/25" />
          <div className="mt-3 w-16 space-y-1.5">
            <div className="h-2 rounded-full bg-white/20" />
            <div className="h-2 w-3/4 rounded-full bg-white/15" />
          </div>
          <motion.div
            className="mt-3 flex h-8 w-16 items-center justify-center rounded-xl bg-white text-slate-900"
            animate={{ y: [0, -2, 0], boxShadow: ["0_0_0_0_rgba(255,255,255,0.35)", "0_0_0_8px_rgba(255,255,255,0)", "0_0_0_0_rgba(255,255,255,0)"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          >
            <Vote size={14} />
          </motion.div>
        </motion.div>
        <motion.span
          className="absolute right-6 top-10 h-3 w-3 rounded-full bg-sky-300"
          animate={{ scale: [0, 1, 0], opacity: [0, 0.9, 0], y: [6, -26] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
        />
        <motion.span
          className="absolute left-7 top-16 h-2.5 w-2.5 rounded-full bg-violet-300"
          animate={{ scale: [0, 1, 0], opacity: [0, 0.9, 0], y: [6, -24] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1.4 }}
        />
      </div>
    );
  }

  if (art === "screen") {
    return (
      <div className="relative flex h-52 w-52 items-center justify-center">
        <div className="absolute h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
        <motion.div
          className="animate-float-y relative flex h-32 w-44 rotate-2 flex-col rounded-[1.2rem] border border-white/20 bg-gradient-to-b from-white/10 to-white/[0.03] p-3 shadow-[0_20px_50px_-16px_rgba(56,189,248,0.6)] backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-rose-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <div className="h-1.5 w-10 rounded-full bg-white/25" />
          </div>
          <div className="mt-3 flex flex-1 items-end gap-2">
            {[62, 38, 20].map((height, index) => (
              <div key={index} className="relative flex-1 overflow-hidden rounded-md bg-white/10">
                <motion.div
                  className="absolute bottom-0 w-full rounded-md bg-gradient-to-t from-indigo-400 to-sky-300"
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: 0.3 + index * 0.15, type: "spring", stiffness: 90, damping: 16 }}
                />
              </div>
            ))}
          </div>
        </motion.div>
        <div className="absolute bottom-8 h-2 w-24 rounded-full bg-white/10" />
      </div>
    );
  }

  // Брендовый мотив — две пересекающиеся «стеклянные» плашки логотипа.
  return (
    <div className="relative flex h-52 w-52 items-center justify-center">
      <div className="absolute h-40 w-40 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="absolute h-32 w-32 rounded-full bg-sky-400/20 blur-2xl" />
      <motion.div
        className="animate-float-y absolute -ml-6 -mt-3 h-24 w-24 rotate-[-8deg] rounded-[2rem] border border-white/25 bg-gradient-to-br from-white/15 to-white/0 backdrop-blur-md"
      />
      <motion.div
        className="animate-float-y absolute -mb-3 -mr-6 h-24 w-24 rotate-[8deg] rounded-[2rem] border border-white/15 bg-gradient-to-br from-indigo-300/25 to-transparent backdrop-blur-md"
        style={{ animationDelay: "0.6s" }}
      />
      <motion.span
        className="absolute h-2 w-2 rounded-full bg-sky-300"
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0], x: [0, 14], y: [8, -30] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
}
