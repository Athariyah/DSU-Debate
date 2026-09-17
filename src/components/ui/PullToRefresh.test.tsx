// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { PullToRefresh } from "./PullToRefresh";

afterEach(cleanup);

type TouchLike = { clientY: number; identifier: number };

function fireTouch(
  target: Element,
  type: "touchstart" | "touchmove" | "touchend",
  clientY?: number
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: TouchLike[];
  };
  event.touches = type === "touchend" ? [] : [{ clientY: clientY ?? 0, identifier: 1 }];
  target.dispatchEvent(event);
  return event;
}

function renderPtr(onRefresh: () => Promise<unknown> | unknown) {
  render(
    <PullToRefresh onRefresh={onRefresh}>
      <div data-testid="content">Список дебатов</div>
    </PullToRefresh>
  );
  // content → обёртка с трансформом → скролл-контейнер с обработчиками
  const container = screen.getByTestId("content").parentElement?.parentElement;
  if (!container) throw new Error("Контейнер PullToRefresh не найден");
  return container;
}

describe("PullToRefresh", () => {
  test("сильный рывок вниз от верха списка вызывает onRefresh и гасит touchmove", async () => {
    const onRefresh = vi.fn(async () => undefined);
    const container = renderPtr(onRefresh);

    act(() => {
      fireTouch(container, "touchstart", 100);
    });
    let move: Event | undefined;
    act(() => {
      // delta = 200px × сопротивление 0.55 = 110px > порога 64px
      move = fireTouch(container, "touchmove", 300);
    });
    expect(move?.defaultPrevented).toBe(true);
    act(() => {
      fireTouch(container, "touchend");
    });

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  test("короткий рывок обновление не запускает", async () => {
    const onRefresh = vi.fn(async () => undefined);
    const container = renderPtr(onRefresh);

    act(() => {
      fireTouch(container, "touchstart", 100);
    });
    let move: Event | undefined;
    act(() => {
      // delta = 20px × 0.55 = 11px — сильно ниже порога
      move = fireTouch(container, "touchmove", 120);
    });
    expect(move?.defaultPrevented).toBe(true);
    act(() => {
      fireTouch(container, "touchend");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test("прокрученный список отдаёт жест обычному скроллу (без preventDefault)", () => {
    const onRefresh = vi.fn(async () => undefined);
    const container = renderPtr(onRefresh) as HTMLDivElement;
    Object.defineProperty(container, "scrollTop", { value: 120, configurable: true });

    act(() => {
      fireTouch(container, "touchstart", 100);
    });
    let move: Event | undefined;
    act(() => {
      move = fireTouch(container, "touchmove", 300);
    });

    expect(move?.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test("ошибка в onRefresh не оставляет спиннер висеть", async () => {
    const onRefresh = vi.fn(async () => {
      throw new Error("сеть упала");
    });
    const container = renderPtr(onRefresh);

    act(() => {
      fireTouch(container, "touchstart", 100);
    });
    act(() => {
      fireTouch(container, "touchmove", 300);
    });
    act(() => {
      fireTouch(container, "touchend");
    });

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    // жест снова отслеживается: следующий touchmove прижатого к верху
    // списка опять гасится компонентом, а не уходит браузеру
    let move: Event | undefined;
    act(() => {
      fireTouch(container, "touchstart", 100);
    });
    act(() => {
      move = fireTouch(container, "touchmove", 200);
    });
    expect(move?.defaultPrevented).toBe(true);
  });
});
