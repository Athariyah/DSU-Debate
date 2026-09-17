import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

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
