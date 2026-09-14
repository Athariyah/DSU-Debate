import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCorsPolicy,
  isOriginAllowed,
  parseOriginList,
  resolveCorsPolicy,
} from "../src/config/corsPolicy";

test("в режиме разработки без CORS_ORIGIN разрешены любые источники", () => {
  const policy = resolveCorsPolicy("development", undefined);

  assert.equal(policy.allowAll, true);
  assert.equal(policy.configured, false);
  // И Live Server на localhost, и он же по IP в локальной сети, и превью-домен.
  assert.equal(isOriginAllowed("http://127.0.0.1:5500", policy), true);
  assert.equal(isOriginAllowed("http://192.168.1.42:5500", policy), true);
  assert.equal(isOriginAllowed("https://4173-example.e2b.app", policy), true);
});

test("в production без CORS_ORIGIN политика строгая (список обязателен в env.ts)", () => {
  const policy = resolveCorsPolicy("production", undefined);

  assert.equal(policy.allowAll, false);
  assert.equal(policy.configured, false);
  assert.equal(isOriginAllowed("https://debate.example.com", policy), false);
});

test("CORS_ORIGIN=* разрешает любой источник", () => {
  const policy = resolveCorsPolicy("production", "*");

  assert.equal(policy.allowAll, true);
  assert.equal(isOriginAllowed("https://anything.example.com", policy), true);
});

test("явный список делает политику строгой", () => {
  const policy = resolveCorsPolicy("development", " http://127.0.0.1:5500 , http://localhost:3000 ");

  assert.equal(policy.allowAll, false);
  assert.equal(policy.configured, true);
  assert.deepEqual(policy.origins, ["http://127.0.0.1:5500", "http://localhost:3000"]);
  assert.equal(isOriginAllowed("http://127.0.0.1:5500", policy), true);
  assert.equal(isOriginAllowed("http://localhost:3000", policy), true);
  // Тот же порт, но другой хост — это другой источник.
  assert.equal(isOriginAllowed("http://127.0.0.1:3000", policy), false);
  assert.equal(isOriginAllowed("http://192.168.1.42:5500", policy), false);
});

test("запрос без Origin разрешён всегда (curl, серверные вызовы)", () => {
  const strict = resolveCorsPolicy("production", "https://debate.example.com");

  assert.equal(isOriginAllowed(undefined, strict), true);
  assert.equal(isOriginAllowed(null, strict), true);
  assert.equal(isOriginAllowed("", strict), true);
});

test("parseOriginList игнорирует пустые элементы и пробелы", () => {
  assert.deepEqual(parseOriginList(" http://a , ,http://b "), ["http://a", "http://b"]);
  assert.deepEqual(parseOriginList(undefined), []);
});

test("описание политики объясняет режим", () => {
  assert.match(
    describeCorsPolicy(resolveCorsPolicy("development", undefined), "development"),
    /разрешены любые источники/
  );
  assert.match(
    describeCorsPolicy(resolveCorsPolicy("development", "http://localhost:5500"), "development"),
    /разрешены источники: http:\/\/localhost:5500/
  );
});
