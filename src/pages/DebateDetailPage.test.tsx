// @vitest-environment jsdom
/**
 * Меню «три точки» на странице дебата: пункт трансляции ведёт на экран
 * /broadcast/:id, а сама панель — матовое стекло (не просвечивает).
 */
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../lib/socket", () => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  return {
    getSocket: () => ({
      connected: true,
      on: (event: string, cb: (payload: unknown) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(cb);
      },
      off: (event: string, cb: (payload: unknown) => void) => {
        handlers.get(event)?.delete(cb);
      },
      emit: () => undefined,
    }),
  };
});

import { DebateDetailPage } from "./DebateDetailPage";

configure({ asyncUtilTimeout: 6000 });

const TOPIC = "Нужен ли четырёхдневный рабочий день?";

function renderDetail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        event: {
          id: 7,
          title: TOPIC,
          status: "active",
          dateTime: new Date(2026, 8, 16, 17, 0).toISOString(),
          participantsCount: 2,
        },
        participants: [
          { id: 11, eventId: 7, name: "Анна Север", description: "За", votesCount: 12, percentage: 60 },
          { id: 12, eventId: 7, name: "Игорь Юрьев", description: "Против", votesCount: 8, percentage: 40 },
        ],
        totalVotes: 20,
      }),
    }))
  );

  return render(
    <MemoryRouter initialEntries={["/debate/7"]}>
      <Routes>
        <Route path="/debate/:id" element={<DebateDetailPage />} />
        <Route path="/broadcast/:id" element={<div>BROADCAST SCREEN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("меню «три точки»", () => {
  test("пункт трансляции открывает экран /broadcast/:id", async () => {
    renderDetail();
    await screen.findByText(TOPIC);

    fireEvent.click(screen.getByLabelText("Меню"));
    fireEvent.click(await screen.findByText("Трансляция на экран"));

    expect(await screen.findByText("BROADCAST SCREEN")).toBeTruthy();
  });

  test("панель меню — матовое стекло, плотнее обычного glass-panel", async () => {
    renderDetail();
    await screen.findByText(TOPIC);

    fireEvent.click(screen.getByLabelText("Меню"));
    const panel = (await screen.findByText("Трансляция на экран")).parentElement as HTMLElement;

    expect(panel.className).toContain("frosted-panel");
    expect(panel.className).not.toContain("glass-panel");
  });

  test("трансляция доступна только в десктопном меню", async () => {
    renderDetail();
    await screen.findByText(TOPIC);

    fireEvent.click(screen.getByLabelText("Меню"));
    const broadcast = screen.getByText("Трансляция на экран").closest("button");

    expect(broadcast?.className).toContain("hidden");
    expect(broadcast?.className).toContain("lg:flex");
  });

  test("прежние пункты меню на месте", async () => {
    renderDetail();
    await screen.findByText(TOPIC);

    fireEvent.click(screen.getByLabelText("Меню"));

    expect(await screen.findByText("Скопировать ссылку")).toBeTruthy();
    expect(screen.getByText("Обновить")).toBeTruthy();
  });
});
