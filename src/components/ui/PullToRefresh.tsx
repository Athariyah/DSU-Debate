import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import { cn } from "../../utils/cn";

/* Pull-to-refresh для собственных скролл-контейнеров приложения.
 *
 * Почему вручную: страницы скроллятся не документом, а внутренним
 * div с overflow-y-auto (см. HomePage/DebatesPage), поэтому нативный
 * pull-to-refresh браузера до них не дотягивается, а в PWA-режиме он
 * отключён вовсе. Здесь жест перехватывается на самом контейнере:
 * когда список прижат к верху (scrollTop === 0) и палец тянет вниз,
 * touchmove гасится (preventDefault), контент уезжает вниз с
 * «резиновым» сопротивлением, а из-за верхнего края выезжает круглый
 * индикатор. Отпустили выше порога — пружина назад; ниже — запрос
 * обновления, индикатор крутится, пока промис onRefresh не решится.
 *
 * Жест доступен только пальцем (touch-события): мышь на десктопе
 * продолжает выделять текст и работать как обычно. */

const RESISTANCE = 0.55; // сопротивление «резины»
const MAX_PULL = 112; // px — потолок смещения контента
const THRESHOLD = 64; // px — порог срабатывания обновления
const REFRESH_HEIGHT = 58; // px — высота раскрытой зоны во время загрузки
const INDICATOR = 40; // px — диаметр круга индикатора
const SETTLE_MS = 260; // длительность пружины обратно, ms

interface PullToRefreshProps {
  /** Вызывается при отпускании жеста ниже порога; спиннер крутится,
   *  пока возвращаемый промис не решится (ошибка тоже сворачивает его). */
  onRefresh: () => Promise<unknown> | unknown;
  className?: string;
  children: ReactNode;
}

type Phase = "idle" | "dragging" | "settling" | "refreshing";

export function PullToRefresh({ onRefresh, className, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  // onRefresh держим в ref: подписчики жестов не пересоздаются на каждый
  // рендер родителя (а useCallback там не обязателен).
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  const gesture = useRef({ tracking: false, startY: 0, pull: 0, refreshing: false });

  useEffect(() => {
    const mounted = containerRef.current;
    if (!mounted) return;
    const el: HTMLDivElement = mounted;

    const collapse = () => {
      gesture.current.pull = 0;
      setPull(0);
      setPhase("settling");
    };

    function onTouchStart(event: TouchEvent) {
      const g = gesture.current;
      // Во время загрузки жест не перехватываем: список можно дочитать,
      // индикатор сам свернётся, когда обновление закончится.
      if (g.refreshing) return;
      g.tracking = el.scrollTop <= 0;
      g.startY = event.touches[0]?.clientY ?? 0;
      if (g.tracking) setPhase("dragging");
    }

    function onTouchMove(event: TouchEvent) {
      const g = gesture.current;
      if (!g.tracking || g.refreshing) return;
      // Список успели прокрутить (или прокрутка началась не с верха) —
      // отдаём жест обычному скроллу.
      if (el.scrollTop > 0) {
        g.tracking = false;
        if (g.pull !== 0) collapse();
        else setPhase("idle");
        return;
      }
      const delta = (event.touches[0]?.clientY ?? g.startY) - g.startY;
      if (delta <= 0) {
        // Палец пошёл вверх раньше, чем натянулась резина: не мешаем
        // обычной прокрутке вниз по списку.
        if (g.pull !== 0) collapse();
        return;
      }
      // Тянем вниз прижатый к верху список: полностью забираем жест,
      // чтобы ни скролл контейнера, ни резиновый оверскролл iOS не
      // боролись с индикатором.
      event.preventDefault();
      const next = Math.min(MAX_PULL, delta * RESISTANCE);
      g.pull = next;
      setPull(next);
    }

    function onTouchEnd() {
      const g = gesture.current;
      if (!g.tracking) return;
      g.tracking = false;
      if (g.pull < THRESHOLD) {
        collapse();
        return;
      }
      g.refreshing = true;
      g.pull = REFRESH_HEIGHT;
      setPull(REFRESH_HEIGHT);
      setPhase("refreshing");
      Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => undefined)
        .finally(() => {
          g.refreshing = false;
          collapse();
        });
    }

    // touchmove — обязательно non-passive, иначе preventDefault
    // игнорируется (React и браузер вешают touch-события пассивными).
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Пружина отработала до нуля — возвращаем «покой»: трансформ снимается
  // вовсе (transform: none), чтобы обёртка не создавала containing block
  // для position: fixed потомков внутри контента.
  useEffect(() => {
    if (phase !== "settling" || pull !== 0) return;
    const timer = window.setTimeout(() => setPhase("idle"), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pull]);

  const dragging = phase === "dragging";
  const settleTransition = dragging ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
  const ready = pull >= THRESHOLD;
  const indicatorOpacity = Math.min(1, pull / 24);

  return (
    <div
      ref={containerRef}
      className={cn("no-scrollbar relative overflow-y-auto overscroll-y-contain", className)}
    >
      {/* Индикатор живёт ВНЕ потока: круг выезжает из-за верхнего края
          контейнера синхронно с контентом и прячется обратно, не
          оставляя лишнего отступа у списка. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-10 flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/75 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md"
        style={{
          width: INDICATOR,
          height: INDICATOR,
          opacity: indicatorOpacity,
          // -INDICATOR-8: полностью скрыт над верхним краем; по мере
          // натяги выезжает вниз и встаёт по центру раскрытой зоны.
          transform: `translate(-50%, ${pull - INDICATOR - 8}px)`,
          transition: dragging
            ? "opacity 120ms linear"
            : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms linear",
        }}
      >
        {phase === "refreshing" ? (
          <LoaderCircle size={18} className="animate-spin" />
        ) : (
          <ArrowDown
            size={18}
            className={cn("transition-transform duration-200", ready && "rotate-180 text-white")}
          />
        )}
      </div>

      <div
        style={{
          transform: pull === 0 && phase === "idle" ? "none" : `translateY(${pull}px)`,
          transition: settleTransition,
        }}
      >
        {children}
      </div>
    </div>
  );
}
