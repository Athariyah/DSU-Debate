// @vitest-environment jsdom
/**
 * Карточка активного дебата: фон — непрозрачный градиент, чтобы при входе
 * карточка не «просвечивала» фон страницы (прежний дефект: сначала синяя,
 * потом темнеет). Стеклянной полупрозрачной подложки поверх фона больше нет.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ActiveDebateCard } from "./ActiveDebateCard";
import type { DebateEvent } from "../../types";

const event: DebateEvent = {
  id: 1,
  title: "Нужен ли четырёхдневный рабочий день?",
  status: "active",
  participantsCount: 3,
  scheduledAt: new Date(2026, 8, 18, 17, 0).toISOString(),
  totalVotes: 47,
  participants: [],
};

afterEach(() => {
  cleanup();
});

describe("карточка активного дебата", () => {
  test("фон непрозрачный, без стеклянной подложки поверх", () => {
    const { container } = render(
      <ActiveDebateCard event={event} voted={false} onVoteClick={() => {}} />
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.style.background).toContain("linear-gradient");
    expect(card.querySelector(".glass-panel")).toBeNull();
  });

  test("показывает тему, метаданные, счётчик голосов и CTA", () => {
    render(<ActiveDebateCard event={event} voted={false} onVoteClick={() => {}} />);

    expect(screen.getByText(event.title)).toBeTruthy();
    expect(screen.getByText("Активный дебат")).toBeTruthy();
    expect(screen.getByText("3 участника")).toBeTruthy();
    expect(screen.getByText("47 голосов")).toBeTruthy();
    expect(screen.getByText("Голосовать")).toBeTruthy();
  });

  test("если голос уже отдан, CTA ведёт к результатам", () => {
    render(<ActiveDebateCard event={event} voted onVoteClick={() => {}} />);
    expect(screen.getByText("Результаты")).toBeTruthy();
  });
});
