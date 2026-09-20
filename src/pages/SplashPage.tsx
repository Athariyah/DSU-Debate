import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { MonitorPlay, Smartphone, Trophy, Vote } from "lucide-react";
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
    title: "DSU Event",
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
    <div className="relative flex h-full flex-col overflow-hidden px-7 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-[calc(env(safe-area-inset-top,0px)+3.5rem)] [@media(max-height:700px)]:pt-[calc(env(safe-area-inset-top,0px)+1.75rem)] lg:pl-64">
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
            {/* На широком экране арт крупнее: transform не ломает центровку. */}
            <div className="lg:scale-[1.35]">
              <SlideArt art={slide.art} />
            </div>

            <div className="mt-12 flex flex-col items-center text-center [@media(max-height:700px)]:mt-7">
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
                  "font-extrabold tracking-tight",
                  // Брендовый заголовок переливается пробегающим бликом.
                  // На ПК кегль растёт вместе с шириной окна.
                  slide.art === "logo"
                    ? "text-shimmer text-[clamp(2.125rem,4vw,3.75rem)]"
                    : "text-[clamp(1.625rem,3vw,2.5rem)] text-white"
                )}
              >
                {slide.title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="mt-3 max-w-[30ch] text-[clamp(0.9375rem,1.35vw,1.25rem)] leading-relaxed text-white/55"
              >
                {slide.text}
              </motion.p>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      {/* На ПК колонка управления не растягивается на весь экран: кнопка
          «Начать» держит телефонную ширину и не расползается. */}
      <div className="relative mx-auto flex w-full max-w-[26rem] flex-col items-center gap-3 lg:max-w-[28rem]">
        <p
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-white/35 transition-opacity duration-500 lg:text-xs",
            touched && "opacity-0"
          )}
          aria-hidden={touched}
        >
          <span aria-hidden className="hint-arrow-left">‹</span>
          свайпай, чтобы листать
          <span aria-hidden className="hint-arrow-right">›</span>
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

/**
 * Живой фон: мягкие дрейфующие цветовые пятна + тонкая точечная сетка.
 * Спокойная, «бумажная» фактура — без звёздного неба и неона,
 * чтобы картина оставалась современной и минималистичной.
 */
function SplashBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="animate-drift absolute -left-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
      <div className="animate-drift-slow absolute -right-20 top-10 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="animate-drift absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />

      {/* Точечная сетка, затухающая к краям. */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1.5px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}

function SlideArt({ art }: { art: Slide["art"] }) {
  if (art === "phone") {
    return (
      <div className="relative flex h-52 w-52 items-center justify-center [@media(max-height:700px)]:h-40 [@media(max-height:700px)]:w-40">
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
      <div className="relative flex h-52 w-52 items-center justify-center [@media(max-height:700px)]:h-40 [@media(max-height:700px)]:w-40">
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

  // Брендовый слайд: минималистичный «диалог» — суть мероприятий. Два простых
  // пузырька с позициями спорящих: первый печатает (точечный «тайпинг»),
  // второй отвечает — и в нём появляется галочка учёта голоса. Спокойные
  // формы, мягкие градиенты, без футуризма; вся картинка — чистая CSS/SVG-
  // графика с бесконечным циклом анимации.
  return <DialogueArt />;
}

/**
 * Сцена мероприятия — подиум с трофеем, лёгкое дыхание и конфетти.
 * Чистый CSS + framer-motion: трофей парит, подиум подсвечен, искры мерцают.
 */
function EventArt() {
  return (
    <div className="relative flex h-52 w-52 items-center justify-center [@media(max-height:700px)]:h-40 [@media(max-height:700px)]:w-40">
      <span aria-hidden className="dialogue-glow-a absolute h-40 w-40 rounded-full bg-indigo-500/25 blur-3xl" />
      <span aria-hidden className="dialogue-glow-b absolute bottom-4 right-6 h-24 w-24 rounded-full bg-amber-400/15 blur-2xl" />
      <div className="animate-float-y relative h-40 w-40 [@media(max-height:700px)]:h-[7.5rem] [@media(max-height:700px)]:w-[7.5rem]">
        {/* Подиум 2-1-3 */}
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-end gap-1.5">
          <div className="flex h-10 w-12 flex-col items-center justify-end rounded-t-xl border border-white/15 bg-gradient-to-b from-zinc-300 to-zinc-400 p-1 shadow-lg">
            <span className="text-[10px] font-black text-white">2</span>
          </div>
          <div className="flex h-14 w-14 flex-col items-center justify-end rounded-t-xl border border-white/15 bg-gradient-to-b from-amber-300 to-amber-500 p-1 shadow-lg shadow-amber-500/20">
            <Trophy size={12} className="mb-0.5 text-white" />
            <span className="text-xs font-black text-white">1</span>
          </div>
          <div className="flex h-8 w-12 flex-col items-center justify-end rounded-t-xl border border-white/15 bg-gradient-to-b from-amber-700 to-orange-700 p-1 shadow-lg">
            <span className="text-[10px] font-black text-white">3</span>
          </div>
        </div>
        {/* Парящий трофей над подиумом */}
        <motion.div
          className="absolute left-1/2 top-2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-indigo-400 to-violet-500 shadow-[0_16px_32px_-14px_rgba(99,102,241,0.9)]"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Trophy size={28} className="text-white drop-shadow" />
        </motion.div>
        {/* Искорки */}
        <motion.span className="absolute left-4 top-6 h-1.5 w-1.5 rounded-full bg-sky-300" animate={{ scale: [0,1,0], opacity: [0,0.9,0], y: [0,-10] }} transition={{ duration: 2, repeat: Infinity, delay: 0.6 }} />
        <motion.span className="absolute right-5 top-10 h-1 w-1 rounded-full bg-amber-300" animate={{ scale: [0,1,0], opacity: [0,0.9,0], y: [0,-8] }} transition={{ duration: 2, repeat: Infinity, delay: 1.2 }} />
        <motion.span className="absolute left-6 bottom-10 h-1 w-1 rounded-full bg-violet-300" animate={{ scale: [0,1,0], opacity: [0,0.9,0], y: [0,-6] }} transition={{ duration: 2, repeat: Infinity, delay: 0.9 }} />
      </div>
    </div>
  );
}
function DialogueArt() {
  return <EventArt />;
}


