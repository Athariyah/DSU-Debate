import { describe, expect, test } from "vitest";
import { formatCountdown } from "./formatCountdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  test("меньше минуты — мм:сс", () => {
    expect(formatCountdown(42 * SECOND)).toBe("00:42");
  });

  test("больше часа — ч:мм:сс", () => {
    expect(formatCountdown(HOUR + 2 * MINUTE + 3 * SECOND)).toBe("1:02:03");
  });

  test("больше суток — дни и часы вместо гигантского числа часов", () => {
    // ~13 лет: раньше показывало «107738:20:40».
    const ms = 4489 * DAY + 20 * HOUR + 40 * MINUTE + 40 * SECOND;
    expect(formatCountdown(ms)).toBe("4489 дн. 20 ч");
  });

  test("отрицательное значение — ноль", () => {
    expect(formatCountdown(-5 * SECOND)).toBe("00:00");
  });
});
