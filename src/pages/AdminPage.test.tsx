// @vitest-environment jsdom
/**
 * Панель даты в админке: на телефоне одиночный datetime-local вылезал за
 * рамку карточки, поэтому поле разбито на дату и время и обёрнуто
 * в .date-field (жёсткие ограничения ширины + шрифт 16px против зума iOS).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminPage } from "./AdminPage";

const DATE_TIME = new Date(2026, 8, 16, 17, 30).toISOString();

function renderAdmin() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 3,
            title: "Тестовый дебат",
            status: "active",
            dateTime: DATE_TIME,
            participantsCount: 2,
          },
        ],
      }),
    }))
  );

  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("поле даты и времени в панели администрирования", () => {
  test("нет одиночного datetime-local — только раздельные дата и время", async () => {
    const { container } = renderAdmin();
    await screen.findByDisplayValue("Тестовый дебат");

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect((screen.getByLabelText("Дата") as HTMLInputElement).type).toBe("date");
    expect((screen.getByLabelText("Время") as HTMLInputElement).type).toBe("time");
  });

  test("значение мероприятия показывается в полях", async () => {
    renderAdmin();
    await screen.findByDisplayValue("Тестовый дебат");

    expect((screen.getByLabelText("Дата") as HTMLInputElement).value).toBe("2026-09-16");
    expect((screen.getByLabelText("Время") as HTMLInputElement).value).toBe("17:30");
  });

  test("поля живут в ограничивающей обёртке .date-field", async () => {
    renderAdmin();
    await screen.findByDisplayValue("Тестовый дебат");

    const wrapper = screen.getByLabelText("Дата").closest(".date-field");
    expect(wrapper).toBeTruthy();
    // Время — в той же обёртке и не может распирать строку (shrink-0 + wrap).
    expect(screen.getByLabelText("Время").closest(".date-field")).toBe(wrapper);
    expect(wrapper?.className).toContain("flex-wrap");
  });
});
