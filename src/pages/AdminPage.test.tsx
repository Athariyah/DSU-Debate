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
import { setAdminToken } from "../api/httpClient";

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
    expect(screen.getByText("После запуска: 30 мин. до автостопа")).toBeTruthy();
  });
});

describe("флажок «Скрыть голоса»", () => {
  test("переключатель по умолчанию выключен и переключается кликом", async () => {
    renderAdmin();
    await screen.findByText("Тестовый дебат");

    const toggle = screen.getByRole("switch", { name: "Скрыть голоса от зрителей" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Выключено — голоса и проценты видны всем")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Включено — зрителям участники без цифр")).toBeTruthy();
  });

  test("сохранение отправляет votesHidden на backend", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "PUT") bodies.push(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () =>
            method === "GET"
              ? {
                  items: [
                    { id: 3, title: "Тестовый дебат", status: "active", dateTime: DATE_TIME, participantsCount: 2 },
                  ],
                }
              : {
                  event: {
                    id: 3,
                    title: "Тестовый дебат",
                    status: "active",
                    dateTime: DATE_TIME,
                    participantsCount: 2,
                    votesHidden: true,
                  },
                },
        };
      })
    );
    setAdminToken("test-token");

    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await screen.findByText("Тестовый дебат");

    fireEvent.click(screen.getByRole("switch", { name: "Скрыть голоса от зрителей" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(bodies.some((body) => body.includes("\"votesHidden\":true"))).toBe(true));
    setAdminToken("");
  });
});

describe("удаление мероприятия", () => {
  test("открывается собственное окно, системный confirm не используется", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? "GET";
        calls.push(`${method} ${url}`);
        return {
          ok: true,
          status: 200,
          json: async () =>
            method === "GET"
              ? {
                  items: [
                    { id: 3, title: "Тестовый дебат", status: "active", dateTime: DATE_TIME, participantsCount: 2 },
                  ],
                }
              : { ok: true },
        };
      })
    );
    setAdminToken("test-token");

    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await screen.findByText("Тестовый дебат");

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    // Собственное стилизованное окно приложения, а не системный confirm.
    expect(await screen.findByText("Удалить мероприятие?")).toBeTruthy();
    expect(screen.getByText(/вместе с участниками и голосами/)).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();

    // Отмена закрывает окно без запроса.
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByText("Удалить мероприятие?")).toBeNull());
    expect(calls.filter((call) => call.startsWith("DELETE"))).toHaveLength(0);

    // Подтверждение шлёт DELETE и убирает карточку.
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    const confirmButtons = await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: "Удалить" });
      expect(buttons.length).toBe(2);
      return buttons;
    });
    fireEvent.click(confirmButtons[1]);
    await waitFor(() => expect(calls.some((call) => call.startsWith("DELETE /api/admin/events/3"))).toBe(true));
    await waitFor(() => expect(screen.queryByText("Тестовый дебат")).toBeNull());

    confirmSpy.mockRestore();
    setAdminToken("");
  });
});
