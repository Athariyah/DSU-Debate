// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useEffect } from "react";
import { apiFetch, getAdminToken } from "../../api/httpClient";
import { resetAuthStoreForTests } from "../../api/authStore";

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
  resetAuthStoreForTests();
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
    resetAuthStoreForTests();
    renderNav();
    const link = await screen.findByLabelText("Создать мероприятие");
    expect(link.getAttribute("href")).toBe("/admin");

    fireEvent.click(link);
    expect(await screen.findByText("ADMIN PAGE")).toBeTruthy();
  });

  test("с живым токеном кнопка остаётся видимой", async () => {
    mockMe("ok");
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    resetAuthStoreForTests();
    renderNav();
    const link = await screen.findByLabelText("Создать мероприятие");
    expect(link.getAttribute("href")).toBe("/admin");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getAdminToken()).toBe("good-token");
    expect(screen.getByLabelText("Создать мероприятие")).toBeTruthy();
  });

  test("с мёртвым токеном кнопка прячется и токен стирается (без висячего плюса)", async () => {
    mockMe("expired");
    window.localStorage.setItem(TOKEN_KEY, "dead-token");
    resetAuthStoreForTests();
    renderNav();
    await waitFor(() => expect(screen.queryByLabelText("Создать мероприятие")).toBeNull());
    expect(getAdminToken()).toBeNull();
  });
});

describe("ProtectedRoute не держит цикл «админ → профиль»", () => {
  test("с живым токеном /protected-admin рендерит админку", async () => {
    mockMe("ok");
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    resetAuthStoreForTests();
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

  test("сбой сети не маскируется под 401: повтор вместо формы входа", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    resetAuthStoreForTests();
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
    expect(await screen.findByText("Не удалось связаться с сервером")).toBeTruthy();
    // Ни формы входа, ни выкидывания на профиль.
    expect(screen.queryByPlaceholderText("Email администратора")).toBeNull();
    expect(screen.queryByText("PROFILE PAGE")).toBeNull();
  });

  test("с мёртвым токеном без формы входа: подсказка и кнопка в профиль", async () => {
    mockMe("expired");
    window.localStorage.setItem(TOKEN_KEY, "dead-token");
    resetAuthStoreForTests();
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

    // Никуда не редиректит и никакой формы входа на защищённом экране:
    // только подсказка «только для администраторов» и кнопка в профиль.
    expect(await screen.findByText("Раздел доступен только администраторам")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Email администратора")).toBeNull();
    expect(screen.queryByText("PROFILE PAGE")).toBeNull();

    // Кнопка ведёт в профиль — вход администратора живёт только там.
    fireEvent.click(screen.getByRole("button", { name: /Открыть профиль/ }));
    expect(await screen.findByText("PROFILE PAGE")).toBeTruthy();
  });

  test("401 от admin-API при живой сессии: стор сам гасит сессию и показывает вход", async () => {
    // /me отвечает 200 (сессия подтверждена, плюс виден), но рабочий admin-
    // запрос возвращает 401 — например, токен отозвали на сервере. UI обязан
    // стать согласованным: без «выкинуло, а кнопка осталась».
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("/admin/auth/me")) {
          return { ok: true, status: 200, json: async () => ({ admin: { id: 1, email: "a@b.c" } }) };
        }
        if (url.includes("/admin/events")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ message: "Требуется авторизация администратора", code: "UNAUTHORIZED" }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );
    window.localStorage.setItem(TOKEN_KEY, "good-token");
    resetAuthStoreForTests();

    function Probe() {
      useEffect(() => {
        void apiFetch("/admin/events", { auth: true }).catch(() => undefined);
      }, []);
      return <div>PROBE</div>;
    }

    render(
      <MemoryRouter initialEntries={["/protected-admin"]}>
        <Routes>
          <Route path="/protected-admin" element={<ProtectedRoute><Probe /></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    );

    // Сессия подтверждена — защищённый экран открыт.
    expect(await screen.findByText("PROBE")).toBeTruthy();
    // Admin-запрос получил 401 → стор перешёл в expired: токен стёрт (плюс
    // скрыт), экран показал форму входа на месте.
    expect(await screen.findByText("Раздел доступен только администраторам")).toBeTruthy();
    await waitFor(() => expect(getAdminToken()).toBeNull());
    expect(screen.queryByText("PROBE")).toBeNull();
  });
});
