// @vitest-environment jsdom
/**
 * Пустые состояния списков мероприятий.
 *
 * Текст «Пока нет запланированных мероприятий» раньше был голой строкой без
 * рамки: он жил в сетке списка (lg:grid) или под заголовком раздела и
 * визуально «съезжал» — казалось, что элемент потерял своё место. Теперь это
 * такая же карточка, как у мероприятий (glass-panel + скругление 3xl), и на
 * широком экране она занимает всю ширину сетки (col-span-full).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HomePage } from "./HomePage";
import { DebatesPage } from "./DebatesPage";

function stubEmptyBackend() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (payload: unknown, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => payload,
      });
      if (url.includes("/events/active")) return json({ message: "Нет активного мероприятия" }, 404);
      if (url.includes("/events/upcoming")) return json([]);
      if (url.includes("/events/history")) return json({ items: [], total: 0 });
      return json({ message: `unexpected ${url}` }, 404);
    })
  );
}

/**
 * Карточка пустого состояния: рамка, скругление и текст внутри.
 * gridColumn — карточка лежит внутри двухколоночной сетки списка (lg:grid)
 * и обязана занимать всю ширину, а не половину строки.
 */
function emptyCard(text: string | RegExp, { gridColumn = false } = {}) {
  const node = screen.getByText(text);
  expect(node.className).toContain("glass-panel");
  expect(node.className).toContain("rounded-3xl");
  if (gridColumn) expect(node.className).toContain("col-span-full");
  else expect(node.className).not.toContain("col-span-full");
  return node;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("пустые состояния на главной", () => {
  test("«Ближайшие» и «Завершённые» показывают карточки вместо строк без рамки", async () => {
    stubEmptyBackend();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Пока нет запланированных мероприятий")).toBeTruthy();
    emptyCard("Пока нет запланированных мероприятий", { gridColumn: true });
    // Секция завершённых раньше исчезала целиком — теперь у неё есть карточка.
    expect(await screen.findByText("Последние завершённые")).toBeTruthy();
    emptyCard("Завершённых мероприятий пока нет");
  });
});

describe("пустые состояния на странице мероприятий", () => {
  test("«Ближайшие» и «Завершённые» показывают карточки вместо строк без рамки", async () => {
    stubEmptyBackend();
    render(
      <MemoryRouter>
        <DebatesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Пока нет запланированных мероприятий")).toBeTruthy();
    emptyCard("Пока нет запланированных мероприятий", { gridColumn: true });
    emptyCard("История пока пуста", { gridColumn: true });
  });
});
