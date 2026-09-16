// @vitest-environment jsdom
/**
 * Сквозной сценарий кликами, как пользователь: «Профиль» → вход → плюс в
 * панели → клик по плюсу → экран администрирования. Все страницы настоящие,
 * сеть заменена моком fetch.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./ProfilePage";
import { AdminPage } from "./AdminPage";
import { CreateDebatePage } from "./CreateDebatePage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { resetAuthStoreForTests } from "../api/authStore";

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
  resetAuthStoreForTests();
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

test("стрелка «назад» на экране создания возвращает в панель администрирования", async () => {
  window.localStorage.setItem("dsu_admin_jwt", "good-token");
  resetAuthStoreForTests();
  render(
    <MemoryRouter initialEntries={["/create"]}>
      <Routes>
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateDebatePage />
            </ProtectedRoute>
          }
        />
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

  // Дождёмся загрузки защищённого экрана создания.
  await screen.findByText("Создать дебат");
  fireEvent.click(screen.getByLabelText("Назад"));
  expect(await screen.findByText("Мероприятия", {}, { timeout: 3000 })).toBeTruthy();
});

test("стрелка «назад» на экране администрирования возвращает на страницу дебатов", async () => {
  window.localStorage.setItem("dsu_admin_jwt", "good-token");
  resetAuthStoreForTests();
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="/debates" element={<div>Страница дебатов</div>} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText("Мероприятия", {}, { timeout: 3000 });
  fireEvent.click(screen.getByLabelText("Назад"));
  expect(await screen.findByText("Страница дебатов", {}, { timeout: 3000 })).toBeTruthy();
});

describe("гонка: запоздалый 401 со старым токеном не гасит свежую сессию", () => {
  test("перелогин во время проверки не приводит к «выкидыванию»", async () => {
    // /me с good-token отвечает быстро и 200; с любым другим — медленно и 401.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: { headers?: Record<string, string>; method?: string }) => {
        const url = String(input);
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        if (url.includes("/admin/auth/login") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ admin: { id: 1, email: "a@b.c" }, token: "good-token", expiresIn: "365d" }),
          };
        }
        if (url.includes("/admin/auth/me")) {
          const auth = init?.headers?.Authorization ?? "";
          if (auth === "Bearer good-token") {
            await delay(20);
            return { ok: true, status: 200, json: async () => ({ admin: { id: 1, email: "a@b.c" } }) };
          }
          await delay(60);
          return { ok: false, status: 401, json: async () => ({ message: "Недействительный или отозванный токен" }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );

    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Сохраняем «плохой» токен вручную — стартует медленная проверка (401).
    fireEvent.click(screen.getByText("Вставить JWT вручную"));
    const jwtInput = screen.getByPlaceholderText("JWT администратора");
    const saveBtn = screen.getByRole("button", { name: /Сохранить токен/ });
    fireEvent.change(jwtInput, { target: { value: "bad-token" } });
    fireEvent.click(saveBtn);

    // Сразу перелогиниваемся хорошим токеном, пока первый 401 ещё в пути.
    fireEvent.change(jwtInput, { target: { value: "good-token" } });
    fireEvent.click(saveBtn);

    // Запоздалый 401 со старым токеном не должен погасить свежую сессию.
    expect(await screen.findByText("Администратор авторизован", undefined, { timeout: 3000 })).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem("dsu_admin_jwt")).toBe("good-token"));
  });
});
