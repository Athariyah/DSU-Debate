const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Человекочитаемая подпись таймера «сколько осталось».
 * Меньше минуты — «00:42», меньше суток — «1:02:03», а для длинных
 * интервалов (автостоп через несколько дней/лет) не выводим гигантское
 * число часов («107738:20:40»), а показываем дни: «4489 дн. 20 ч».
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} дн. ${hours} ч`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
