import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { methodTunnel, noStoreCache } from "../src/middleware/methodTunnel";

function mockRequest(url: string, method = "GET"): Request {
  return {
    method,
    url,
    originalUrl: url,
    headers: {},
    query: {},
    body: undefined,
  } as unknown as Request;
}

function mockResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response,
  };
}

const next: NextFunction = () => undefined;

test("GET с _method=POST восстанавливает метод, тело и токен", () => {
  const body = encodeURIComponent(JSON.stringify({ participantId: 2 }));
  const req = mockRequest(`/api/events/1/vote?_method=POST&_body=${body}&_token=jwt-abc&_t=1726778123456`);

  methodTunnel(req, mockResponse().res, next);

  assert.equal(req.method, "POST");
  assert.deepEqual(req.body, { participantId: 2 });
  assert.equal(req.headers.authorization, "Bearer jwt-abc");
  assert.equal(req.headers["x-admin-token"], "jwt-abc");
  // Служебные параметры вычищены из URL — токен не утечёт в логи.
  assert.equal(req.url, "/api/events/1/vote");
  assert.equal(req.originalUrl, "/api/events/1/vote");
});

test("чужие query-параметры переживают чистку тоннеля", () => {
  const req = mockRequest("/api/admin/events/1/podium?auto=true&_method=POST&_t=1");

  methodTunnel(req, mockResponse().res, next);

  assert.equal(req.method, "POST");
  assert.equal(req.url, "/api/admin/events/1/podium?auto=true");
  assert.deepEqual(req.body, {});
});

test("обычный GET без _method не трогаем", () => {
  const req = mockRequest("/api/events/1?_t=1726778123456");

  methodTunnel(req, mockResponse().res, next);

  assert.equal(req.method, "GET");
  assert.equal(req.url, "/api/events/1?_t=1726778123456");
  assert.equal(req.body, undefined);
});

test("прямой POST не трогаем", () => {
  const req = mockRequest("/api/events/1/vote", "POST");
  req.body = { participantId: 2 };

  methodTunnel(req, mockResponse().res, next);

  assert.equal(req.method, "POST");
  assert.deepEqual(req.body, { participantId: 2 });
});

test("битый JSON в _body превращается в пустой объект, а не в падение", () => {
  const req = mockRequest("/api/admin/auth/login?_method=POST&_body=%7Bbroken");

  methodTunnel(req, mockResponse().res, next);

  assert.equal(req.method, "POST");
  assert.deepEqual(req.body, {});
});

test("no-store заголовки запрещают кэширование API-ответов", () => {
  const { headers, res } = mockResponse();

  noStoreCache({} as Request, res, next);

  assert.equal(headers["Cache-Control"], "no-store, no-cache, must-revalidate, proxy-revalidate");
  assert.equal(headers["Pragma"], "no-cache");
});
