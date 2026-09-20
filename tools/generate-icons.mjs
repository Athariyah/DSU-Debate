/* Генератор логотипа DSU Event: public/logo.svg + иконки PWA.
 *
 * Надпись «DSU Event» превращается в векторный путь шрифта Manrope
 * ExtraBold (opentype.js), поэтому ни SVG, ни растр не зависят от
 * наличия шрифта в системе/браузере.
 *
 * Иконки PWA разделены на два типа по спецификации W3C:
 * 1) Стандартные иконки (purpose: "any") — эмблема + словесный знак DSU Event;
 *    никаких внешних или внутренних белых рамок — только чистый фон приложения.
 * 2) Адаптивные иконки (purpose: "maskable" + apple-touch-icon) — полноразмерный
 *    фон без прозрачности, эмблема строго по центру в пределах 80% safe zone
 *    (r <= 204.8px при размере 512×512), без текста и без искусственных рамок.
 *    На Android и iOS система при любой форме маски (круг, сквиркл, закруглённый
 *    квадрат) режет только градиентный фон без белых подложек и полей.
 *
 * Запуск: node tools/generate-icons.mjs
 * Шрифт берётся из dev-зависимости @fontsource/manrope (woff 800).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT = path.join(root, "node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff");

const SIZE = 512;
const WORDMARK = "DSU Event";
const WORDMARK_SIZE = 48;
const WORDMARK_BASELINE = 420;

const font = opentype.parse(readFileSync(FONT).buffer);
const markWidth = font.getAdvanceWidth(WORDMARK, WORDMARK_SIZE, { kerning: true });
const markPath = font.getPath(
  WORDMARK,
  (SIZE - markWidth) / 2,
  WORDMARK_BASELINE,
  WORDMARK_SIZE,
  { kerning: true }
);

// Округляем координаты команд до 2 знаков для предотвращения бага экспоненциальной
// записи в opentype.js, из-за которой в SVG попадал NaN и срезал правую часть надписи.
for (const cmd of markPath.commands) {
  for (const k of ["x", "y", "x1", "y1", "x2", "y2"]) {
    if (typeof cmd[k] === "number") {
      cmd[k] = Math.round(cmd[k] * 100) / 100;
    }
  }
}
const wordmarkD = markPath.toPathData(2);

/* 1. Основной логотип (public/logo.svg) и иконки для purpose: "any" */
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="trophyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e0e7ff"/>
    </linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c7d2fe"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glowIndigo" cx="0.18" cy="0.04" r="0.85">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowViolet" cx="0.92" cy="0.16" r="0.8">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowSky" cx="0.5" cy="1.08" r="0.9">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="trophyGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Фон: полноразмерная плитка, без белых рамок и прозрачных углов -->
  <rect width="${SIZE}" height="${SIZE}" fill="#0a0c1e"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowIndigo)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowViolet)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowSky)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#gloss)"/>

  <!-- Орбита «событий» вокруг трофея -->
  <circle cx="256" cy="205" r="160" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/>
  <circle cx="400" cy="95" r="10" fill="#7dd3fc"/>
  <circle cx="112" cy="105" r="7" fill="#a78bfa" fill-opacity="0.9"/>
  <circle cx="410" cy="290" r="6" fill="#818cf8" fill-opacity="0.75"/>

  <!-- Мягкое свечение за трофеем (без искусственных прямоугольных белых рамок) -->
  <circle cx="256" cy="205" r="110" fill="url(#trophyGlow)"/>
  <circle cx="256" cy="205" r="90" fill="#ffffff" fill-opacity="0.05"/>

  <!-- Центр — Трофей DSU Event -->
  <g transform="translate(256, 205)">
    <!-- Чаша трофея -->
    <path d="M -36 -50 L -36 8 C -36 28  -18 42 0 42 C 18 42 36 28 36 8 L 36 -50 Z" fill="url(#trophyGrad)"/>
    
    <!-- Ручки трофея -->
    <path d="M -36 -32 C -58 -32 -64 -10 -45 10" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="8" stroke-linecap="round"/>
    <path d="M 36 -32 C 58 -32 64 -10 45 10" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="8" stroke-linecap="round"/>
    
    <!-- Ножка и база -->
    <rect x="-10" y="42" width="20" height="24" rx="5" fill="#ffffff"/>
    <rect x="-38" y="66" width="76" height="18" rx="7" fill="#ffffff"/>
    
    <!-- Звезда на чаше -->
    <g transform="translate(0 -8) scale(2.2)">
      <path d="M 0 -7 L 2.1 -2.2 L 7.3 -1.5 L 3.5 2.2 L 4.4 7.3 L 0 4.8 L -4.4 7.3 L -3.5 2.2 L -7.3 -1.5 L -2.1 -2.2 Z" fill="#6366f1"/>
    </g>
  </g>

  <!-- Словесный знак DSU Event (контуры шрифта) -->
  <path d="${wordmarkD}" fill="url(#word)"/>
</svg>
`;

/* 2. Адаптивная иконка (purpose: "maskable" + apple-touch-icon):
   Эмблема отцентрована строго по центру плитки (256, 256) и полностью
   вписывается в круг безопасной зоны 80% (r = 150 < 204.8px).
   Градиент залит до самых краёв (0, 0, 512, 512), поэтому Android/iOS
   при маскировании не добавляют белых подложек, а надписи внизу нет
   (её отображает сам лаунчер ОС). */
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="trophyGradM" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e0e7ff"/>
    </linearGradient>
    <linearGradient id="glossM" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glowIndigoM" cx="0.18" cy="0.04" r="0.85">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowVioletM" cx="0.92" cy="0.16" r="0.8">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowSkyM" cx="0.5" cy="1.08" r="0.9">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="trophyGlowM" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Фон: полноразмерная плитка, без белых и прозрачных углов -->
  <rect width="${SIZE}" height="${SIZE}" fill="#0a0c1e"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowIndigoM)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowVioletM)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowSkyM)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glossM)"/>

  <!-- Орбита строго внутри safe-zone (r = 150 < 204.8) -->
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/>
  <circle cx="390" cy="155" r="9.5" fill="#7dd3fc"/>
  <circle cx="120" cy="165" r="7" fill="#a78bfa" fill-opacity="0.9"/>
  <circle cx="400" cy="335" r="6" fill="#818cf8" fill-opacity="0.75"/>

  <!-- Мягкое свечение за трофеем -->
  <circle cx="256" cy="256" r="120" fill="url(#trophyGlowM)"/>
  <circle cx="256" cy="256" r="95" fill="#ffffff" fill-opacity="0.05"/>

  <!-- Центр — Трофей DSU Event строго по центру безопасной зоны 80% (без белых рамок) -->
  <g transform="translate(256, 256) scale(1.15)">
    <!-- Чаша трофея -->
    <path d="M -36 -50 L -36 8 C -36 28  -18 42 0 42 C 18 42 36 28 36 8 L 36 -50 Z" fill="url(#trophyGradM)"/>
    
    <!-- Ручки трофея -->
    <path d="M -36 -32 C -58 -32 -64 -10 -45 10" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="8" stroke-linecap="round"/>
    <path d="M 36 -32 C 58 -32 64 -10 45 10" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="8" stroke-linecap="round"/>
    
    <!-- Ножка и база -->
    <rect x="-10" y="42" width="20" height="24" rx="5" fill="#ffffff"/>
    <rect x="-38" y="66" width="76" height="18" rx="7" fill="#ffffff"/>
    
    <!-- Звезда на чаше -->
    <g transform="translate(0 -8) scale(2.2)">
      <path d="M 0 -7 L 2.1 -2.2 L 7.3 -1.5 L 3.5 2.2 L 4.4 7.3 L 0 4.8 L -4.4 7.3 L -3.5 2.2 L -7.3 -1.5 L -2.1 -2.2 Z" fill="#6366f1"/>
    </g>
  </g>
</svg>
`;

writeFileSync(path.join(root, "public/logo.svg"), logoSvg);

// Рендеринг стандартных иконок (purpose: "any")
for (const [file, px] of [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
]) {
  const resvg = new Resvg(logoSvg, { fitTo: { mode: "width", value: px } });
  writeFileSync(path.join(root, file), resvg.render().asPng());
  console.log("✓", file, px + "px (any)");
}

// Рендеринг адаптивных маскируемых иконок (purpose: "maskable" + apple-touch-icon)
for (const [file, px] of [
  ["public/icon-maskable-512.png", 512],
  ["public/icon-maskable-192.png", 192],
  ["public/apple-touch-icon.png", 180],
]) {
  const resvg = new Resvg(maskableSvg, { fitTo: { mode: "width", value: px } });
  writeFileSync(path.join(root, file), resvg.render().asPng());
  console.log("✓", file, px + "px (maskable)");
}

console.log("✓ public/logo.svg (wordmark width", Math.round(markWidth), "px, no white frames, NaN fixed)");
