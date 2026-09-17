import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BrandMark } from "../brand/BrandLogo";
import { cn } from "../../utils/cn";

interface BroadcastQrCardProps {
  /** Полный адрес страницы голосования, куда ведёт QR-код. */
  voteUrl: string;
  className?: string;
}

/**
 * QR-код голосования для трансляции: карточка в стилистике сайта
 * (стеклянная панель, фирменные градиенты) со знаком бренда в центре
 * кода. Генерируется всегда, пока открыт экран трансляции.
 *
 * Уровень коррекции ошибок — максимальный («H»), поэтому лого в центре
 * не мешает считыванию даже с большого расстояния в зале.
 */
export function BroadcastQrCard({ voteUrl, className }: BroadcastQrCardProps) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(voteUrl, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 1,
      color: { dark: "#0b0d1f", light: "#ffffff" },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        // Не сгенерировался код — карточка всё равно покажет адрес текстом,
        // трансляция не ломается.
      });
    return () => {
      cancelled = true;
    };
  }, [voteUrl]);

  const shortUrl = voteUrl.replace(/^https?:\/\//, "");

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-[clamp(0.75rem,1.2vw,1.5rem)] rounded-3xl border border-white/10 bg-black/40 p-[clamp(0.75rem,1.2vw,1.5rem)]",
        "shadow-[0_24px_60px_-24px_rgba(2,6,23,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl",
        className
      )}
    >
      <div className="relative shrink-0 overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.8)]">
        {qrSvg ? (
          <div
            aria-label={`QR-код: ${voteUrl}`}
            className="h-[clamp(6.5rem,10vw,10rem)] w-[clamp(6.5rem,10vw,10rem)] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : (
          <div className="h-[clamp(6.5rem,10vw,10rem)] w-[clamp(6.5rem,10vw,10rem)] animate-pulse bg-white/80" />
        )}

        {/* Знак бренда в центре кода — как иконка приложения. */}
        <span className="absolute inset-0 m-auto flex h-[30%] w-[30%] items-center justify-center rounded-xl bg-white p-[1.2%] shadow-[0_2px_10px_rgba(15,23,42,0.35)]">
          <BrandMark className="h-full w-full rounded-lg" />
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-[clamp(0.85rem,1.3vw,1.5rem)] font-extrabold leading-tight text-white">
          Голосуй с телефона
        </p>
        <p className="mt-1 text-[clamp(0.6rem,0.9vw,1.05rem)] leading-snug text-white/45">
          Наведи камеру — откроется страница голосования
        </p>
        <p className="mt-1.5 truncate text-[clamp(0.6rem,0.9vw,1.05rem)] font-semibold tabular-nums text-indigo-200/80">
          {shortUrl}
        </p>
      </div>
    </div>
  );
}
