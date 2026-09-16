// @vitest-environment jsdom
/**
 * Сквозная проверка НАСТОЯЩЕГО потока против НАСТОЯЩЕГО backend через
 * Vite-прокси (http://127.0.0.1:5173): «Профиль» → вход → плюс → панель.
 * В двух режимах хранилища: обычный localStorage и «сломанный» (записи
 * бросают исключение — как во встроенном превью). Отдельно проверяется
 * дубликат модуля httpClient (сценарий HMR): он обязан видеть тот же токен.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./ProfilePage";
import { AdminPage } from "./AdminPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { getAdminToken, setAdminToken } from "../api/httpClient";
import { resetAuthStoreForTests } from "../api/authStore";

const ORIGIN = "http://127.0.0.1:5173";

function stubRealNetwork() {
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("/")) url = ORIGIN + url;
      return realFetch(url, init);
    })
  );
}

function breakLocalStorageWrites() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("localStorage write blocked", "SecurityError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage,
  });
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
}

async function loginThroughForm() {
  const emailField = await screen.findByPlaceholderText("Email администратора", undefined, { timeout: 8000 });
  fireEvent.change(emailField, {
    target: { value: "admin@dsu.local" },
  });
  fireEvent.change(screen.getByPlaceholderText("Пароль"), {
    target: { value: "ChangeMe123!" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Войти$/ }));
  const authed = await screen.findByText("Администратор авторизован", undefined, { timeout: 8000 }).catch(() => null);
  if (!authed) screen.debug(undefined, 100000);
  expect(authed).toBeTruthy();
}

async function openAdminPanel() {
  // Кликаем плюс в нижней панели и ждём рабочую админку без auth-ошибок.
  fireEvent.click(await screen.findByLabelText("Создать мероприятие", undefined, { timeout: 5000 }));
  expect(await screen.findByText("Мероприятия", undefined, { timeout: 5000 })).toBeTruthy();
  expect(screen.queryByText("Требуется авторизация администратора")).toBeNull();
  // Реальные демо-дебаты из базы доехали (названия — в полях списка).
  await waitFor(() => {
    expect(screen.getAllByDisplayValue(/Демо-дебаты/).length).toBeGreaterThan(0);
  }, { timeout: 5000 });
}

afterEach(() => {
  cleanup();
  setAdminToken("");
  resetAuthStoreForTests();
  vi.unstubAllGlobals();
});

describe("настоящий поток против настоящего backend", () => {
  test("обычный localStorage: вход → плюс → панель с данными", async () => {
    stubRealNetwork();
    renderApp();
    await loginThroughForm();
    await openAdminPanel();
  });

  test("сломанный localStorage (как во встроенном превью): сессия живёт на window", async () => {
    stubRealNetwork();
    breakLocalStorageWrites();
    renderApp();
    await loginThroughForm();

    // Дубликат модуля (сценарий HMR-пересоздания) видит тот же токен:
    // отдельный экземпляр модуля, но общее хранилище на window.
    // @ts-expect-error TS2307 — намеренный импорт копии модуля с query.
    const dup = await import("../api/httpClient?dupcheck=1");
    expect(dup.getAdminToken()).toBe(getAdminToken());
    expect(getAdminToken()).toBeTruthy();

    await openAdminPanel();
  });
});
