// @vitest-environment jsdom
/**
 * CDN-тоннель httpClient: мутации (POST/PUT/PATCH/DELETE) уходят наружу как
 * GET с _method/_body/_token/_t в query (Yandex Cloud CDN режет мутации
 * с 405), backend восстанавливает исходный запрос раньше роутера.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  apiFetch,
  setAdminToken,
  setUnauthorizedHandler,
} from "./httpClient";

function mockFetchJson(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [input, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url: input, init };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  setUnauthorizedHandler(() => undefined);
});

describe("тоннелирование мутаций через GET", () => {
  test("POST уходит как GET с _method/_body/_t, токен — в заголовках и _token", async () => {
    const fetchMock = mockFetchJson({ ok: true });
    setAdminToken("jwt-abc");

    await apiFetch("/events/1/vote", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ participantId: 2 }),
    });

    const { url, init } = lastCall(fetchMock);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(url.startsWith("/api/events/1/vote?")).toBe(true);
    expect(params.get("_method")).toBe("POST");
    expect(JSON.parse(params.get("_body") ?? "")).toEqual({ participantId: 2 });
    expect(params.get("_token")).toBe("jwt-abc");
    expect(Number(params.get("_t"))).toBeGreaterThan(0);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-abc");
    expect(headers["X-Admin-Token"]).toBe("jwt-abc");
  });

  test("PUT и DELETE тоннелируются так же", async () => {
    const fetchMock = mockFetchJson({ event: {} });
    setAdminToken("jwt-abc");

    await apiFetch("/admin/events/3", { method: "PUT", auth: true, body: JSON.stringify({ title: "X" }) });
    let params = new URLSearchParams(lastCall(fetchMock).url.split("?")[1]);
    expect(lastCall(fetchMock).init.method).toBe("GET");
    expect(params.get("_method")).toBe("PUT");
    expect(JSON.parse(params.get("_body") ?? "")).toEqual({ title: "X" });

    await apiFetch("/admin/events/3", { method: "DELETE", auth: true });
    params = new URLSearchParams(lastCall(fetchMock).url.split("?")[1]);
    expect(params.get("_method")).toBe("DELETE");
    expect(params.get("_body")).toBeNull();
  });

  test("обычный GET не трогаем", async () => {
    const fetchMock = mockFetchJson({ items: [] });

    await apiFetch("/events/active");

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("/api/events/active");
    expect(init.method ?? "GET").toBe("GET");
  });

  test("существующая query-строка сохраняется рядом с параметрами тоннеля", async () => {
    const fetchMock = mockFetchJson({ eventId: 1, podium: [] });
    setAdminToken("jwt-abc");

    await apiFetch("/admin/events/1/podium?auto=true", { method: "POST", auth: true });

    const { url } = lastCall(fetchMock);
    expect(url.startsWith("/api/admin/events/1/podium?")).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("auto")).toBe("true");
    expect(params.get("_method")).toBe("POST");
  });

  test("без токена _token не добавляется", async () => {
    const fetchMock = mockFetchJson({ admin: {}, token: "new", expiresIn: "8h" });

    await apiFetch("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.c", password: "secret" }),
    });

    const params = new URLSearchParams(lastCall(fetchMock).url.split("?")[1]);
    expect(params.get("_method")).toBe("POST");
    expect(params.get("_token")).toBeNull();
  });

  test("401 на тоннелированном запросе гасит сессию тем же токеном", async () => {
    const fetchMock = mockFetchJson({ message: "unauthorized" }, 401);
    setAdminToken("dead-token");
    const seen: Array<string | null> = [];
    setUnauthorizedHandler((tokenUsed) => void seen.push(tokenUsed));

    await expect(apiFetch("/admin/events/3", { method: "PUT", auth: true, body: "{}" })).rejects.toThrow();
    expect(seen).toEqual(["dead-token"]);
    expect(lastCall(fetchMock).init.method).toBe("GET");
  });
});
