// @vitest-environment jsdom
/**
 * Поле даты/времени: два раздельных нативных виджета вместо одного
 * datetime-local (на телефоне он вылезал за рамку карточки) + корректная
 * конвертация в ISO, который ждёт backend.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  test("показывает дату и время отдельными полями, без datetime-local", () => {
    const { container } = render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={() => {}} />);

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByLabelText("Дата")).toBeTruthy();
    expect(screen.getByLabelText("Время")).toBeTruthy();
    expect((screen.getByLabelText("Дата") as HTMLInputElement).value).toBe("2026-09-16");
    expect((screen.getByLabelText("Время") as HTMLInputElement).value).toBe("17:30");
  });

  test("смена даты отдаёт наружу валидный ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-09-20" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 8, 20, 17, 30).toISOString());
  });

  test("смена времени отдаёт наружу валидный ISO", () => {
    const onChange = vi.fn();
    render(<DateTimeField value={LOCAL_DATE.toISOString()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Время"), { target: { value: "09:05" } });

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 8, 16, 9, 5).toISOString());
  });

  test("пустое значение не отправляет ISO наружу", () => {
    const onChange = vi.fn();
    render(<DateTimeField value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
