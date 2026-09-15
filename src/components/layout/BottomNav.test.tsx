// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { getAdminToken, setAdminToken } from "../../api/httpClient";

const TOKEN_KEY = "dsu_admin_jwt";

function mockMe(result: "ok" | "expired") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: { headers?: Record<string, string>; method?: string }) => {
      const url = String(input);
      if (url.includes("/admin/auth/login") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ admin: { id: 1, email: "a@b.c" }, token: "good-token", expiresIn: "8h" }),
        };
      }
      if (url.includes("/admin/auth/me")) {
        const auth = init?.headers?.Authorization ?? "";
        if (result === "ok" && auth === "Bearer good-token") {
          return { ok: true, status: 200, json: async () => ({ admin: { id: 1, email: "a@b.c" } }) };
        }
        return { ok: false, status: 401, json: async () => ({ message: "unauthorized" }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
}

function renderNav(initialPath = "/home") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/home" element={<><div>HOME</div><BottomNav /></>} />
        <Route path="/admin" element={<div>ADMIN PAGE</div>} />
        <Route
          path="/profile"
          element={<div>PROFILE PAGE</div>}
        />
        <Route
          path="/protected-admin"
          element={
            <ProtectedRoute>
              <div>ADMIN PAGE</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  setAdminToken("");
  vi.unstubAllGlobals();
});

describe("кнопка «Создать» в нижней панели", () => {
  test("без токена админа кнопки нет", async () => {
    mockMe("expired");
    renderNav();
    await waitFor(() => expect(screen.getByText("HOME")).toBeTruthy());
    expect(screen.queryByLabelText("Создать мероприятие")).toBeNull();
  });

  test("с живым токеном кнопка есть и ведёт на /admin", async () => {
    mockMe("ok");
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    renderNav();
    const link = await screen.findByLabelText("Создать мероприятие");
    expect(link.getAttribute("href")).toBe("/admin");

    fireEvent.click(link);
    expect(await screen.findByText("ADMIN PAGE")).toBeTruthy();
  });

  test("кнопка не исчезает сама: видима, пока токен лежит в хранилище", async () => {
    mockMe("expired");
    window.localStorage.setItem(TOKEN_KEY, "some-token");
    renderNav();
    const link = await screen.findByLabelText("Создать мероприятие");
    expect(link.getAttribute("href")).toBe("/admin");
    // Фоновых сбросов больше нет: токен и кнопка остаются на месте.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getAdminToken()).toBe("some-token");
    expect(screen.getByLabelText("Создать мероприятие")).toBeTruthy();
  });
});

describe("ProtectedRoute не держит цикл «админ → профиль»", () => {
  test("с живым токеном /protected-admin рендерит админку", async () => {
    mockMe("ok");
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    render(
      <MemoryRouter initialEntries={["/protected-admin"]}>
        <Routes>
          <Route
            path="/protected-admin"
            element={<ProtectedRoute><div>ADMIN PAGE</div></ProtectedRoute>}
          />
          <Route path="/profile" element={<div>PROFILE PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("ADMIN PAGE")).toBeTruthy();
  });

  test("с мёртвым токеном не выкидывает: вход на месте и сразу админка", async () => {
    mockMe("expired");
    window.localStorage.setItem(TOKEN_KEY, "dead-token");
    render(
      <MemoryRouter initialEntries={["/protected-admin"]}>
        <Routes>
          <Route
            path="/protected-admin"
            element={<ProtectedRoute><div>ADMIN PAGE</div></ProtectedRoute>}
          />
          <Route path="/profile" element={<div>PROFILE PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Никуда не редиректит: форма входа показана прямо на защищённом экране.
    expect(await screen.findByText("Вход в панель администрирования")).toBeTruthy();
    expect(screen.queryByText("PROFILE PAGE")).toBeNull();

    // Вход на месте открывает защищённый экран без перехода на профиль.
    fireEvent.change(screen.getByPlaceholderText("Email администратора"), {
      target: { value: "admin@dsu.local" },
    });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "ChangeMe123!" } });
    fireEvent.click(screen.getByRole("button", { name: /^Войти$/ }));
    expect(await screen.findByText("ADMIN PAGE")).toBeTruthy();
  });
});
