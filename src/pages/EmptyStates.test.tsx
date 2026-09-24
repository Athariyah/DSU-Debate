// @vitest-environment jsdom
/**
 * Пустые состояния списков мероприятий.
 *
 * Раньше сообщения вроде «Пока нет запланированных мероприятий» жили внутри
 * стеклянных карточек (glass-panel): тяжёлые «панельки» на пустом экране
 * спорили с заголовками разделов. Теперь это голый текст на фоне страницы —
 * без рамки, подложки и скруглений, зато строго по центру (text-center), а в
 * сетке списка (lg:grid) занимает всю её ширину (col-span-full), чтобы строка
 * не «съезжала» влево от заголовка.
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
 * Текст пустого состояния: лежит прямо на фоне (без стеклянной подложки,
 * рамки и скруглений) и выровнен по центру. gridColumn — текст внутри
 * двухколоночной сетки списка (lg:grid) занимает всю её ширину.
 */
function emptyText(text: string | RegExp, { gridColumn = false } = {}) {
  const node = screen.getByText(text);
  expect(node.className).not.toContain("glass-panel");
  expect(node.className).not.toContain("rounded-");
  expect(node.className).not.toContain("border");
  expect(node.className).toContain("text-center");
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
  test("«Ближайшие» и «Завершённые» показывают текст на фоне по центру", async () => {
    stubEmptyBackend();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Пока нет запланированных мероприятий")).toBeTruthy();
    emptyText("Пока нет запланированных мероприятий", { gridColumn: true });
    // У секции завершённых тоже текст на фоне, без карточки.
    expect(await screen.findByText("Последние завершённые")).toBeTruthy();
    emptyText("Завершённых мероприятий пока нет");
  });
});

describe("пустые состояния на странице мероприятий", () => {
  test("«Ближайшие» и «Завершённые» показывают текст на фоне по центру", async () => {
    stubEmptyBackend();
    render(
      <MemoryRouter>
        <DebatesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Пока нет запланированных мероприятий")).toBeTruthy();
    emptyText("Пока нет запланированных мероприятий", { gridColumn: true });
    emptyText("История пока пуста", { gridColumn: true });
  });
});
