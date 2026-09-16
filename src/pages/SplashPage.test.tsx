// @vitest-environment jsdom
/**
 * Загрузочный экран — карусель: свайп-подсказка и точки-индикаторы, листание
 * тапом по точке и стрелками клавиатуры.
 */
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test } from "vitest";
import { SplashPage } from "./SplashPage";

configure({ asyncUtilTimeout: 6000 });

function renderSplash() {
  return render(
    <MemoryRouter>
      <SplashPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe("карусель загрузочного экрана", () => {
  test("первый слайд — бренд, точки-индикаторы на месте", async () => {
    renderSplash();

    expect(await screen.findByText("DSU Debate")).toBeTruthy();
    expect(screen.getByText("Твой голос — решение в споре.")).toBeTruthy();
    expect(screen.getByText(/свайпай, чтобы листать/)).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { selected: true })).toBeTruthy();
  });

  test("тап по точке листает на нужный слайд", async () => {
    renderSplash();
    await screen.findByText("DSU Debate");

    fireEvent.click(screen.getByRole("tab", { name: "Слайд 2: Голосуй с телефона" }));
    expect(await screen.findByText("Голосуй с телефона")).toBeTruthy();
    expect(await screen.findByText(/Один тап — и голос учтён/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Слайд 3: Живые результаты" }));
    expect(await screen.findByText("Живые результаты")).toBeTruthy();
    expect(await screen.findByText(/трансляция на большом экране/)).toBeTruthy();
  });

  test("стрелки клавиатуры листают вперёд и назад", async () => {
    renderSplash();
    await screen.findByText("DSU Debate");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Голосуй с телефона")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Живые результаты")).toBeTruthy();

    // За краем слайдов нет: ещё одна стрелка вперёд ничего не меняет.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Живые результаты")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByText("Голосуй с телефона")).toBeTruthy();
  });

  test("после первого листания подсказка «свайпай» гаснет", async () => {
    renderSplash();
    await screen.findByText("DSU Debate");

    fireEvent.click(screen.getByRole("tab", { name: "Слайд 2: Голосуй с телефона" }));
    await screen.findByText("Голосуй с телефона");

    await waitFor(() => {
      expect(screen.getByText(/свайпай, чтобы листать/).className).toContain("opacity-0");
    });
  });
});
