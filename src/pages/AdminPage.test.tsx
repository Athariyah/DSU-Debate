// @vitest-environment jsdom
/**
 * Панель даты в админке: вместо системных виджетов — свои кнопки-переключатели
 * с календарём и сеткой часов/минут в стилистике сайта, а вместо голого
 * <select> — стильный StatusSelect (upcoming / active / completed).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  test("нет системных виджетов — только кнопки-переключатели", async () => {
    const { container } = renderAdmin();
    await screen.findByText("Тестовый дебат");

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Дата" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Время" })).toBeTruthy();
  });

  test("значение мероприятия показывается на кнопках", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    expect(screen.getByRole("button", { name: "Дата" }).textContent).toContain("16.09.2026");
    expect(screen.getByRole("button", { name: "Время" }).textContent).toContain("17:30");
  });

  test("первое нажатие открывает календарь, второе закрывает", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    const dateButton = screen.getByRole("button", { name: "Дата" });
    expect(screen.queryByRole("group", { name: "Месяц" })).toBeNull();

    fireEvent.click(dateButton);
    expect(screen.getByRole("group", { name: "Месяц" })).toBeTruthy();

    fireEvent.click(dateButton);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Месяц" })).toBeNull());
  });

  test("выбор дня в календаре обновляет значение на кнопке", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    const dateButton = screen.getByRole("button", { name: "Дата" });
    fireEvent.click(dateButton);
    fireEvent.click(screen.getByRole("button", { name: "20" }));

    expect(dateButton.textContent).toContain("20.09.2026");
  });
});

describe("статус мероприятия", () => {
  test("селектор показывает текущий статус и переключает его", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    const statusButton = screen.getByRole("button", { name: "Статус мероприятия: active" });
    fireEvent.click(statusButton);

    fireEvent.click(screen.getByRole("option", { name: /completed/ }));

    expect(screen.getByRole("button", { name: "Статус мероприятия: completed" })).toBeTruthy();
  });
});

describe("тема мероприятия", () => {
  test("показана сокращённой, по клику открывается на редактирование", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    // До клика нет текстового поля — только сокращённый заголовок-кнопка.
    expect(screen.queryByLabelText("Редактировать тему")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Тестовый дебат/ }));

    const editor = await screen.findByLabelText("Редактировать тему");
    expect((editor as HTMLTextAreaElement).value).toBe("Тестовый дебат");

    fireEvent.change(editor, { target: { value: "Обновлённая тема" } });
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByLabelText("Редактировать тему")).toBeNull();
    expect(screen.getByText("Обновлённая тема")).toBeTruthy();
  });
});

describe("таймер голосования", () => {
  test("поле минут принимает значение и подсказку", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    const minutes = screen.getByLabelText("Длительность таймера в минутах") as HTMLInputElement;
    expect(minutes.value).toBe("");
    expect(screen.getByText("Выключен — до смены статуса вручную")).toBeTruthy();

    fireEvent.change(minutes, { target: { value: "30" } });
    expect(minutes.value).toBe("30");
    expect(screen.getByText("Через 30 мин. голосование закроется само")).toBeTruthy();
  });
});
