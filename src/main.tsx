import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Мобильные браузеры и PWA-режим «тянут» страницу за пределы приложения
// (резиновый оверскролл, pull-to-refresh) — снаружи появляются чёрные
// полосы. Блокируем такие жесты: гасим touchmove, только если палец НЕ
// находится внутри прокручиваемого элемента приложения (списки, колёса
// времени и т.п. продолжают скроллиться как обычно).
function isInsideScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return true;
    el = el.parentElement;
  }
  return false;
}
document.addEventListener(
  "touchmove",
  (event) => {
    if (!isInsideScroller(event.target)) event.preventDefault();
  },
  { passive: false }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: service worker регистрируем только в production-сборке, чтобы
// dev-сервер (HMR) не перехватывал ответы. Даёт режим «как приложение»
// после «Добавить на экран Домой» + офлайн-откат оболочки.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Отсутствующий sw.js (например, сборка открыта через file://) не
      // должен ломать приложение — работаем без офлайн-оболочки.
    });
  });
}
