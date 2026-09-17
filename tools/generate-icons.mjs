/* Генератор логотипа DSU Debate: public/logo.svg + иконки PWA.
 *
 * Надпись «DSU Debate» превращается в векторный путь шрифта Manrope
 * ExtraBold (opentype.js), поэтому ни SVG, ни растр не зависят от
 * наличия шрифта в системе/браузере. Плитка логотипа — полноразмерный
 * квадрат без прозрачных и белых углов: на домашних экранах iOS/Android
 * не остаётся «белых краёв», а любая маска (круг, скруглённый квадрат)
 * режет только фон-градиент.
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
const WORDMARK = "DSU Debate";
const WORDMARK_SIZE = 48;
const WORDMARK_BASELINE = 414;

const font = opentype.parse(readFileSync(FONT).buffer);
const markWidth = font.getAdvanceWidth(WORDMARK, WORDMARK_SIZE, { kerning: true });
const markPath = font.getPath(
  WORDMARK,
  (SIZE - markWidth) / 2,
  WORDMARK_BASELINE,
  WORDMARK_SIZE,
  { kerning: true }
);
const wordmarkD = markPath.toPathData(2);

/* Плитка 512×512: фон-градиент приложения, «стеклянный» диалог с живыми
   столбиками голосования и словесный знак внизу. Контур орбиты и точки —
   «голоса» вокруг дискуссии. */
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="bubble" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="0.55" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c7d2fe"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
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
  </defs>

  <!-- Фон: полноразмерная плитка, без белых и прозрачных углов -->
  <rect width="${SIZE}" height="${SIZE}" fill="#0a0c1e"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowIndigo)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowViolet)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowSky)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#gloss)"/>

  <!-- Орбита «голосов» вокруг дискуссии -->
  <circle cx="256" cy="228" r="176" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.5" stroke-dasharray="2 10" stroke-linecap="round"/>
  <circle cx="418" cy="106" r="9" fill="#7dd3fc"/>
  <circle cx="102" cy="118" r="6" fill="#a78bfa" fill-opacity="0.9"/>
  <circle cx="436" cy="318" r="5" fill="#818cf8" fill-opacity="0.75"/>

  <!-- Задний пузырь: стекло собеседника -->
  <rect x="246" y="90" width="172" height="136" rx="40" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.38" stroke-width="8"/>
  <circle cx="300" cy="158" r="9" fill="#ffffff" fill-opacity="0.45"/>
  <circle cx="332" cy="158" r="9" fill="#ffffff" fill-opacity="0.32"/>
  <circle cx="364" cy="158" r="9" fill="#ffffff" fill-opacity="0.2"/>

  <!-- Передний пузырь: живое голосование -->
  <path d="M 168 296 L 146 362 L 236 308 Z" fill="url(#bubble)"/>
  <rect x="110" y="146" width="218" height="166" rx="48" fill="url(#bubble)"/>
  <rect x="128" y="160" width="182" height="42" rx="21" fill="#ffffff" fill-opacity="0.16"/>
  <rect x="164" y="208" width="26" height="58" rx="13" fill="#ffffff" fill-opacity="0.95"/>
  <rect x="206" y="172" width="26" height="94" rx="13" fill="#ffffff" fill-opacity="0.95"/>
  <rect x="248" y="192" width="26" height="74" rx="13" fill="#ffffff" fill-opacity="0.95"/>

  <!-- Словесный знак (контуры шрифта, не текст) -->
  <path d="${wordmarkD}" fill="url(#word)"/>
</svg>
`;

writeFileSync(path.join(root, "public/logo.svg"), logoSvg);

for (const [file, px] of [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
  ["public/apple-touch-icon.png", 180],
]) {
  const resvg = new Resvg(logoSvg, { fitTo: { mode: "width", value: px } });
  writeFileSync(path.join(root, file), resvg.render().asPng());
  console.log("✓", file, px + "px");
}
console.log("✓ public/logo.svg (wordmark width", Math.round(markWidth), "px)");
