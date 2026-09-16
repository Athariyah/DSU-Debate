// @vitest-environment jsdom
/**
 * Экран трансляции для больших экранов: участники и их позиция, тема,
 * количество голосов, проценты и статус — всё обновляется по realtime-событиям.
 * Когда статус становится «завершён», показывается анимация итогов
 * (победитель / проигравший). Сокет здесь подменён эмиттером, чтобы гонять
 * НАСТОЯЩИЙ useDebateSocket настоящими событиями.
 */
import { act, cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../lib/socket", () => {
  type Handler = (payload: unknown) => void;
  const handlers = new Map<string, Set<Handler>>();
  const state = { connected: true };
  const socket = {
    get connected() {
      return state.connected;
    },
    on: (event: string, cb: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    },
    off: (event: string, cb: Handler) => {
      handlers.get(event)?.delete(cb);
    },
    emit: () => undefined,
  };
  return {
    getSocket: () => socket,
    __emit: (event: string, payload: unknown) => {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
    __setConnected: (connected: boolean) => {
      state.connected = connected;
    },
  };
});

// Под нагрузкой параллельного прогона waitFor иногда не укладывается в
// секунду по умолчанию — анимации Framer Motion всё равно доигрывают дольше.
configure({ asyncUtilTimeout: 6000 });

import App from "../App";
import { BroadcastPage } from "./BroadcastPage";

const TOPIC = "Нужен ли четырёхдневный рабочий день?";

const fetchMock = vi.fn();
const payloadRef: { current: unknown } = { current: null };

function apiPayload(status: "upcoming" | "active" | "completed" = "active") {
  return {
    event: {
      id: 7,
      title: TOPIC,
      status,
      dateTime: new Date(2026, 8, 16, 17, 0).toISOString(),
      participantsCount: 2,
    },
    participants: [
      { id: 11, eventId: 7, name: "Анна Север", description: "За четырёхдневку", votesCount: 12, percentage: 60 },
      { id: 12, eventId: 7, name: "Игорь Юрьев", description: "Против сокращения", votesCount: 8, percentage: 40 },
    ],
    totalVotes: 20,
  };
}

function mockApi(status: "upcoming" | "active" | "completed" = "active") {
  payloadRef.current = apiPayload(status);
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => payloadRef.current,
  }));
  vi.stubGlobal("fetch", fetchMock);
}

async function socketApi() {
  return import("../lib/socket") as unknown as Promise<{
    __emit: (event: string, payload: unknown) => void;
    __setConnected: (connected: boolean) => void;
  }>;
}

function renderBroadcast() {
  return render(
    <MemoryRouter initialEntries={["/broadcast/7"]}>
      <Routes>
        <Route path="/broadcast/:id" element={<BroadcastPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("экран трансляции", () => {
  test("показывает тему, участников, позиции, голоса и статус", async () => {
    mockApi();
    renderBroadcast();

    // Тема голосования
    expect(await screen.findByText(TOPIC)).toBeTruthy();
    // Участники и их позиции
    expect(await screen.findByText("Анна Север")).toBeTruthy();
    expect(await screen.findByText("За четырёхдневку")).toBeTruthy();
    expect(await screen.findByText("Игорь Юрьев")).toBeTruthy();
    expect(await screen.findByText("Против сокращения")).toBeTruthy();
    // Голоса и проценты
    expect(await screen.findByText("12")).toBeTruthy();
    expect(await screen.findByText("60%")).toBeTruthy();
    expect(await screen.findByText("40%")).toBeTruthy();
    expect(await screen.findByText("20")).toBeTruthy();
    // Статус голосования
    expect(await screen.findByText("В эфире")).toBeTruthy();
    expect(await screen.findByText(/Голосование идёт/)).toBeTruthy();
  });

  test("голоса и проценты обновляются в реальном времени", async () => {
    mockApi();
    renderBroadcast();
    await screen.findByText(TOPIC);

    const socket = await socketApi();
    act(() => {
      socket.__emit("vote:update", {
        eventId: 7,
        totalVotes: 30,
        participants: [
          { participantId: 11, name: "Анна Север", description: "За четырёхдневку", votesCount: 21, percentage: 70 },
          { participantId: 12, name: "Игорь Юрьев", description: "Против сокращения", votesCount: 9, percentage: 30 },
        ],
      });
    });

    expect(await screen.findByText("70%", undefined, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("30%", undefined, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("21", undefined, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText("30", undefined, { timeout: 3000 })).toBeTruthy();
  });

  test("смена статуса приходит по сокету", async () => {
    mockApi();
    renderBroadcast();
    await screen.findByText(TOPIC);

    const socket = await socketApi();
    act(() => {
      socket.__emit("event:status_changed", { eventId: 7, status: "completed" });
    });

    expect(await screen.findByText("Завершено")).toBeTruthy();
    expect(screen.queryByText("В эфире")).toBeNull();
  });

  test("после завершения проигрывается анимация итогов: победитель и проигравший", async () => {
    mockApi();
    renderBroadcast();
    await screen.findByText(TOPIC);

    const socket = await socketApi();
    act(() => {
      socket.__emit("vote:update", {
        eventId: 7,
        totalVotes: 30,
        participants: [
          { participantId: 11, name: "Анна Север", description: "За четырёхдневку", votesCount: 21, percentage: 70 },
          { participantId: 12, name: "Игорь Юрьев", description: "Против сокращения", votesCount: 9, percentage: 30 },
        ],
      });
      socket.__emit("event:status_changed", { eventId: 7, status: "completed" });
    });

    const dialog = await screen.findByRole("dialog", undefined, { timeout: 3000 });
    expect(within(dialog).getByText("Голосование завершено")).toBeTruthy();
    expect(within(dialog).getByText("Победитель")).toBeTruthy();
    expect(within(dialog).getByText("Проигравший")).toBeTruthy();
    // Наибольший процент — победитель, наименьший — проигравший.
    const podiumText = dialog.textContent ?? "";
    expect(podiumText.indexOf("Победитель")).toBeLessThan(podiumText.indexOf("Анна Север"));
    expect(podiumText.indexOf("Проигравший")).toBeLessThan(podiumText.indexOf("Игорь Юрьев"));
    expect(within(dialog).getAllByText("70%").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("30%").length).toBeGreaterThan(0);
  });

  test("итоговая анимация не перезапускается новыми голосами", async () => {
    mockApi();
    renderBroadcast();
    await screen.findByText(TOPIC);

    const socket = await socketApi();
    act(() => {
      socket.__emit("event:status_changed", { eventId: 7, status: "completed" });
    });
    const dialog = await screen.findByRole("dialog", undefined, { timeout: 3000 });

    act(() => {
      socket.__emit("vote:update", {
        eventId: 7,
        totalVotes: 31,
        participants: [
          { participantId: 11, name: "Анна Север", description: "За четырёхдневку", votesCount: 22, percentage: 71 },
          { participantId: 12, name: "Игорь Юрьев", description: "Против сокращения", votesCount: 9, percentage: 29 },
        ],
      });
    });

    // Оверлей тот же (не пересоздан), цифры обновились.
    expect(screen.getByRole("dialog")).toBe(dialog);
    await waitFor(() => expect((screen.getByRole("dialog").textContent ?? "").includes("71%")).toBe(true), {
      timeout: 3000,
    });
  });

  test("ничья показывается как ничья, а не «победитель»", async () => {
    payloadRef.current = {
      ...apiPayload("completed"),
      participants: [
        { id: 11, eventId: 7, name: "Анна Север", description: "За", votesCount: 10, percentage: 50 },
        { id: 12, eventId: 7, name: "Игорь Юрьев", description: "Против", votesCount: 10, percentage: 50 },
      ],
    };
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => payloadRef.current }));
    vi.stubGlobal("fetch", fetchMock);

    renderBroadcast();
    const dialog = await screen.findByRole("dialog", undefined, { timeout: 3000 });

    expect(within(dialog).getByText("Ничья")).toBeTruthy();
    expect(within(dialog).queryByText("Победитель")).toBeNull();
  });

  test("победитель есть, а минимум голосов поделили несколько — показываем честно", async () => {
    payloadRef.current = {
      ...apiPayload("completed"),
      participants: [
        { id: 11, eventId: 7, name: "Анна Север", description: "За", votesCount: 10, percentage: 50 },
        { id: 12, eventId: 7, name: "Игорь Юрьев", description: "Против", votesCount: 5, percentage: 25 },
        { id: 13, eventId: 7, name: "Мария Лан", description: "Воздержалась", votesCount: 5, percentage: 25 },
      ],
    };
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => payloadRef.current }));
    vi.stubGlobal("fetch", fetchMock);

    renderBroadcast();
    const dialog = await screen.findByRole("dialog", undefined, { timeout: 6000 });

    expect(within(dialog).getByText("Победитель")).toBeTruthy();
    expect(within(dialog).getByText("Анна Север")).toBeTruthy();
    // Проигравший не один — вместо «Проигравший» показываем минимум голосов.
    expect(within(dialog).queryByText("Проигравший")).toBeNull();
    expect(within(dialog).getByText("Минимум голосов")).toBeTruthy();
    expect(within(dialog).getByText(/Игорь Юрьев · Мария Лан/)).toBeTruthy();
  });

  test("уже завершённый дебат показывает итоги сразу при открытии", async () => {
    mockApi("completed");
    renderBroadcast();

    const dialog = await screen.findByRole("dialog", undefined, { timeout: 3000 });
    expect(within(dialog).getByText("Победитель")).toBeTruthy();
  });

  test("без realtime-канала экран сам перечитывает результаты по REST", async () => {
    const socket = await socketApi();
    socket.__setConnected(false);
    mockApi();
    vi.useFakeTimers();

    renderBroadcast();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2.5 с — сокет так и не ожил (статус offline), дальше включается опрос.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    socket.__setConnected(true);
  });
});

describe("маршрутизация", () => {
  test("/broadcast/:id открывается во весь экран, без телефонной обёртки", async () => {
    mockApi();
    window.history.pushState({}, "", "/broadcast/7");
    render(<App />);

    expect(await screen.findByText(TOPIC)).toBeTruthy();
    expect(document.querySelector(".app-shell-bg")).toBeNull();
  });

  test("остальные экраны остаются внутри телефонной обёртки", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);

    expect(await screen.findByText("DSU Debate")).toBeTruthy();
    expect(document.querySelector(".app-shell-bg")).toBeTruthy();
  });
});
