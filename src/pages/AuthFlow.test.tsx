// @vitest-environment jsdom
/**
 * Сквозной сценарий кликами, как пользователь: «Профиль» → вход → плюс в
 * панели → клик по плюсу → экран администрирования. Все страницы настоящие,
 * сеть заменена моком fetch.
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./ProfilePage";
import { AdminPage } from "./AdminPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";

    if (url.includes("/admin/auth/login") && init?.method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          admin: { id: 1, email: "admin@dsu.local" },
          token: "good-token",
          expiresIn: "8h",
        }),
      };
    }
    if (url.includes("/admin/auth/me")) {
      if (auth === "Bearer good-token") {
        return { ok: true, status: 200, json: async () => ({ admin: { id: 1, email: "admin@dsu.local" } }) };
      }
      return { ok: false, status: 401, json: async () => ({ message: "unauthorized" }) };
    }
    if (url.includes("/admin/events")) {
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }
    if (url.includes("/admin/auth/logout")) {
      return { ok: true, status: 204, json: async () => undefined };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  })
);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test("вход в профиле → плюс появляется → клик открывает администрирование", async () => {
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

  // Форма входа на месте.
  const email = await screen.findByPlaceholderText("Email администратора");
  const password = screen.getByPlaceholderText("Пароль");
  fireEvent.change(email, { target: { value: "admin@dsu.local" } });
  fireEvent.change(password, { target: { value: "ChangeMe123!" } });
  fireEvent.click(screen.getByRole("button", { name: /^Войти$/ }));

  // После входа в панели появляется плюс.
  const plus = await screen.findByLabelText("Создать мероприятие", {}, { timeout: 3000 });
  expect(plus.getAttribute("href")).toBe("/admin");

  // Клик по плюсу открывает экран администрирования.
  fireEvent.click(plus);
  expect(await screen.findByText("Мероприятия", {}, { timeout: 3000 })).toBeTruthy();
  expect(await screen.findByText("Мероприятий пока нет")).toBeTruthy();
});
