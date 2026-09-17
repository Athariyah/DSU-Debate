// @vitest-environment jsdom
/**
 * Поле даты/времени без системных виджетов: две кнопки-переключатели,
 * каждое первое нажатие открывает свою панель (календарь / часы-минуты),
 * второе закрывает + корректная конвертация в ISO, который ждёт backend.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DateTimeField, combineDateTime, splitDateTime } from "./DateTimeField";

// 16 сентября 2026, 17:30 по локальному времени — тест не зависит от TZ.
const LOCAL_DATE = new Date(2026, 8, 16, 17, 30);

afterEach(() => {
  cleanup();
});

describe("конвертация даты", () => {
  test("ISO → части и обратно без потери", () => {
    const iso = LOCAL_DATE.toISOString();
    const parts = splitDateTime(iso);

    expect(parts).toEqual({ date: "2026-09-16", time: "17:30" });
    expect(combineDateTime(parts.date, parts.time)).toBe(iso);
  });

  test("пустые и невалидные значения не ломают поле", () => {
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(splitDateTime("не дата")).toEqual({ date: "", time: "" });
    expect(combineDateTime("", "10:00")).toBeNull();
    expect(combineDateTime("мусор", "10:00")).toBeNull();
  });

  test("время по умолчанию 00:00, если выбран только день", () => {
    const iso = combineDateTime("2026-09-16", "");
    expect(iso).toBe(new Date(2026, 8, 16, 0, 0).toISOString());
  });
});

describe("DateTimeField", () => {
  test("показывает дату и время как кнопки-переключатели, без нативных инпутов", () => {
    const { container } = render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={() => {}} />);

    // Ни одного системного виджета (а с ними и системных иконок-дублёров).
    expect(container.querySelector("input")).toBeNull();

    const dateButton = screen.getByRole("button", { name: "Дата" });
    const timeButton = screen.getByRole("button", { name: "Время" });
    expect(dateButton.textContent).toContain("16.09.2026");
    expect(timeButton.textContent).toContain("17:30");
  });

  test("первое нажатие открывает календарь, второе закрывает", async () => {
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={() => {}} />);
    const dateButton = screen.getByRole("button", { name: "Дата" });

    expect(screen.queryByRole("group", { name: "Месяц" })).toBeNull();
    fireEvent.click(dateButton);
    expect(screen.getByRole("group", { name: "Месяц" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Год" })).toBeTruthy();
    expect(dateButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(dateButton);
    expect(dateButton.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("group", { name: "Месяц" })).toBeNull());
  });

  test("панель времени тоже работает как переключатель", async () => {
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={() => {}} />);
    const timeButton = screen.getByRole("button", { name: "Время" });

    fireEvent.click(timeButton);
    expect(screen.getByRole("group", { name: "Часы" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Минуты" })).toBeTruthy();

    fireEvent.click(timeButton);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Часы" })).toBeNull());
  });

  test("выбор дня в календаре отдаёт наружу валидный ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Дата" }));
    fireEvent.click(screen.getByRole("button", { name: "20" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 8, 20, 17, 30).toISOString());
  });

  test("колесо месяца листает календарь и сохраняет выбранный день", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Дата" }));
    const monthWheel = screen.getByRole("group", { name: "Месяц" });

    // Лента колеса циклическая: значение встречается 3 раза, кликаем
    // экземпляр из средней («домашней») копии.
    const augustButtons = within(monthWheel).getAllByRole("button", { name: "Август" });
    expect(augustButtons.length).toBe(3);

    // Сентябрь 2026 без 31-го; в августе он есть — колесо реально листает.
    expect(screen.queryByRole("button", { name: "31" })).toBeNull();
    fireEvent.click(augustButtons[1]);
    expect(screen.getByRole("button", { name: "31" })).toBeTruthy();

    // Смена месяца со снятым днём сразу отдаёт обновлённую дату (16.08),
    // клик по 31-му — вторую смену.
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 7, 16, 17, 30).toISOString());

    fireEvent.click(screen.getByRole("button", { name: "31" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 7, 31, 17, 30).toISOString());
  });

  test("колесо года меняет год у выбранной даты", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Дата" }));
    const yearWheel = screen.getByRole("group", { name: "Год" });

    // Средний экземпляр «2027» в циклической ленте.
    const yearButtons = within(yearWheel).getAllByRole("button", { name: "2027" });
    fireEvent.click(yearButtons[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2027, 8, 16, 17, 30).toISOString());
  });

  test("прокрутка колеса часов синхронизирует значение (не прыгает назад)", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const hours = screen.getByRole("group", { name: "Часы" });
    const scroller = hours.querySelector(".wheel-scroller") as HTMLElement;

    // Доводим скролл до центра 9-го часа в средней копии (17 → 9) и отпускаем.
    scroller.scrollTop = (24 + 9) * 44;
    fireEvent.scroll(scroller);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 9, 30).toISOString());
  });

  test("колесо минут крутится в обе стороны: за «00» идёт «59»", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const minutes = screen.getByRole("group", { name: "Минуты" });
    const scroller = minutes.querySelector(".wheel-scroller") as HTMLElement;

    // Уводим центр выше «00» (в верхнюю копию) — лента переносится,
    // и в центр встаёт «59», а не «тупик».
    scroller.scrollTop = (60 - 1) * 44;
    fireEvent.scroll(scroller);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 17, 59).toISOString());

    // И в обратную сторону: за «59» вниз идёт «00».
    scroller.scrollTop = (2 * 60) * 44;
    fireEvent.scroll(scroller);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 17, 0).toISOString());
  });

  test("выбор часа и минут отдаёт наружу валидный ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const hours = screen.getByRole("group", { name: "Часы" });
    const minutes = screen.getByRole("group", { name: "Минуты" });

    // Циклическая лента: кликаем экземпляр из средней копии.
    fireEvent.click(within(hours).getAllByRole("button", { name: "09" })[1]);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 9, 30).toISOString());

    fireEvent.click(within(minutes).getAllByRole("button", { name: "05" })[1]);
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 9, 5).toISOString());
  });

  test("время можно вписать с клавиатуры: «18:45» сразу отдаёт ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const input = screen.getByLabelText("Ввести время с клавиатуры, часы и минуты");

    fireEvent.change(input, { target: { value: "18:45" } });

    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 18, 45).toISOString());
  });

  test("ввод без разделителя «930» читается как 09:30, blur нормализует черновик", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const input = screen.getByLabelText(
      "Ввести время с клавиатуры, часы и минуты"
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "930" } });
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 16, 9, 30).toISOString());

    fireEvent.blur(input);
    expect(input.value).toBe("09:30");
  });

  test("невалидное время не отправляется, а blur возвращает текущее значение", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Время" }));
    const input = screen.getByLabelText(
      "Ввести время с клавиатуры, часы и минуты"
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "25:99" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input.value).toBe("17:30");
  });

  test("пустое значение: плейсхолдер, а выбор дня отправляет ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value="" onChange={onChange} />);

    const dateButton = screen.getByRole("button", { name: "Дата" });
    expect(dateButton.textContent).toContain("Выбрать дату");

    // Календарь открывается на текущем месяце.
    const now = new Date();
    fireEvent.click(dateButton);
    fireEvent.click(screen.getByRole("button", { name: String(now.getDate()) }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0).toISOString()
    );
  });
});
