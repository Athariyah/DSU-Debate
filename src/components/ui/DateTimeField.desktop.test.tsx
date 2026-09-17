// @vitest-environment jsdom
/**
 * Десктопная эргономика колеса времени (pointer: fine): колесо мыши
 * крутит по одному значению за нотч, стрелки клавиатуры работают.
 * matchMedia_stub-ится ДО импорта модуля, чтобы FINE_POINTER включился.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query === "(pointer: fine)",
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
}));

const { DateTimeField } = await import("./DateTimeField");

const VALUE = new Date(2026, 8, 16, 17, 30).toISOString();

/** jsdom не делает раскладку: scrollTop всегда 0 и нет Element.scrollTo.
 * Навешиваем честную замену, как в браузере: запись scrollTop и scrollTo
 * вызывают событие scroll. */
function makeScrollable(el: HTMLElement) {
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
      el.dispatchEvent(new Event("scroll"));
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (el as any).scrollTo = (options: ScrollToOptions) => {
    top = options.top ?? 0;
    el.dispatchEvent(new Event("scroll"));
  };
}

afterEach(() => cleanup());

describe("колесо времени на десктопе", () => {
  test("колесо мыши шагает по одному значению", () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeField value={VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Время" }));

    const scrollers = Array.from(container.querySelectorAll<HTMLElement>(".wheel-scroller"));
    expect(scrollers.length).toBe(2);
    // Десктопная ветка активна: snap отключён, курсор-хватайка на месте.
    expect(scrollers[0].className).toContain("cursor-grab");
    scrollers.forEach(makeScrollable);

    const hours = scrollers[0];
    // Как в браузере после монтирования: лента стоит на выбранном часе
    // (средняя копия, индекс 24 + 17).
    hours.scrollTop = (24 + 17) * 44;
    onChange.mockClear();

    // Два «нотча» по 100px deltaY → ровно два шага значения: 17 → 19.
    fireEvent.wheel(hours, { deltaY: 100, deltaMode: 0 });

    expect(onChange).toHaveBeenCalled();
    const lastIso = onChange.mock.calls.at(-1)![0] as string;
    const local = new Date(lastIso);
    expect(`${local.getHours()}:${local.getMinutes()}`).toBe("19:30");
  });

  test("стрелки клавиатуры листают значения", () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeField value={VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Время" }));

    const scrollers = Array.from(container.querySelectorAll<HTMLElement>(".wheel-scroller"));
    scrollers.forEach(makeScrollable);
    const minutes = scrollers[1];
    minutes.scrollTop = (60 + 30) * 44;
    onChange.mockClear();

    fireEvent.keyDown(minutes, { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalled();
    const lastIso = onChange.mock.calls.at(-1)![0] as string;
    const local = new Date(lastIso);
    // 30 минут, шаг вверх по ленте — 29.
    expect(local.getMinutes()).toBe(29);
  });
});
