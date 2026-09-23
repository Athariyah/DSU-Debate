/* =============================================================================
 * Генератор логотипа DSU Event: public/logo.svg + иконки PWA.
 *
 * Надпись «DSU Event» превращается в векторный путь шрифта Manrope ExtraBold
 * (opentype.js), поэтому ни SVG, ни растр не зависят от наличия шрифта
 * в системе или браузере.
 *
 * ---------------------------------------------------------------------------
 * Что исправлено — «кривое» расположение предметов
 * ---------------------------------------------------------------------------
 * 1. ТРОФЕЙ ЦЕНТРИРУЕТСЯ ПО СВОЕМУ BBOX. Фигура уходит от опорной точки вниз
 *    на 80 и вверх всего на 52, поэтому локальный центр равен +14 — раньше
 *    этот сдвиг игнорировался, и знак оказывался на 17px ниже центра плитки
 *    (в maskable ×1.15 — на 19.5px, ~7px на иконке 180px). Теперь внутрь
 *    группы добавлен translate(0, -TROPHY_MID_Y): bbox фигуры совпадает с
 *    точкой позиционирования.
 *
 * 2. РУЧКИ ПРИКРЕПЛЕНЫ К ЧАШЕ. Раньше нижний конец кривой заканчивался в
 *    (-45, 10) при стенке чаши x = -36 — между ручкой и чашей зиял зазор 9px
 *    (видимый фон между ними). Теперь оба конца лежат на стенке чаши с
 *    запасом под половину stroke, то есть ручка реально «приварена».
 *
 * 3. ЗВЕЗДА — ПРАВИЛЬНАЯ ПЯТИКОНЕЧНАЯ. Старый путь был «рукописным»: внешние
 *    вершины на радиусах 7.0 / 7.45 / 8.52 (разброс 22%), внутренние —
 *    3.04 / 4.13 / 4.80, углы -90/-12/59/121/-168 вместо -90/-18/54/126/198,
 *    и центр тяжести съехал вниз на 0.94 (≈2px после масштаба). Теперь звезда
 *    строится формулой (внешний R, внутренний R×0.382, старт сверху) и стоит
 *    ровно по оси чаши. Плюс она заметно крупнее, поэтому чаша больше не
 *    читается как большая белая плашка вокруг мелкой звёздочки.
 *
 * 4. СПУТНИКИ СТОЯТ НА ОРБИТЕ. Раньше радиус орбиты был 160 (maskable 150),
 *    а спутники висели на 175–181 (maskable 164–168) — то есть ВНЕ кольца.
 *    Теперь их координаты считаются от R по углам треножника 270°/30°/150°
 *    (шаг 120°, симметрия относительно вертикальной оси).
 *
 * 5. СВЯЗКА ЦЕНТРИРОВАНА ОПТИЧЕСКИ. Блок «трофей + надпись» центрируется по
 *    плитке по фактическим bbox (а не «на глаз»), орбита концентрична трофею
 *    и её радиус выводится из крайней точки трофея, а зазор до надписи
 *    рассчитывается так, что кольцо со спутником гарантированно не задевает
 *    текст. Раньше верхнее поле было 155px против нижнего 92px.
 *
 * ---------------------------------------------------------------------------
 * Иконки PWA — по спецификации W3C
 * ---------------------------------------------------------------------------
 * 1) purpose: "any" (icon-192/512) — эмблема + словесный знак, тёмный фон
 *    залит до самых краёв: никаких внешних и внутренних светлых рамок.
 * 2) purpose: "maskable" (icon-maskable-192/512) + apple-touch-icon — только
 *    эмблема, строго по центру, целиком внутри безопасной зоны 80%
 *    (r <= 204.8 при 512×512). Фон до краёв, поэтому Android/iOS при любой
 *    форме маски (круг, сквиркл, закруглённый квадрат) режут только
 *    градиент — без белых подложек и полей. Надписи нет: её рисует лаунчер.
 *
 * Запуск: node tools/generate-icons.mjs
 * Шрифт: dev-зависимость @fontsource/manrope (woff 800).
 * ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import opentype from "opentype.js";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT = path.join(root, "node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff");

const SIZE = 512;
const WORDMARK = "DSU Event";
const WORDMARK_SIZE = 46;

/* ─────────────────────────── утилиты ─────────────────────────── */
const r2 = (n) => Math.round(n * 100) / 100;

/** Точка кубической кривой Безье в параметре t. */
function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Максимум |x| по кривой — чтобы точно знать bbox ручек вместе со stroke. */
function maxAbsX(curve, samples = 201) {
  let m = 0;
  for (let i = 0; i <= samples; i++) m = Math.max(m, Math.abs(cubicAt(...curve, i / samples)[0]));
  return m;
}

/** Кубическая кривая в синтаксисе SVG: ОДИН оператор C на три пары координат
 *  (ступили на этом раньше: «C» перед каждой парой — невалидный путь, resvg
 *  его молча выбрасывал и ручки трофея не рисовались). */
function cubicD(c) {
  return `M ${c[0].join(" ")} C ${c[1].join(" ")} ${c[2].join(" ")} ${c[3].join(" ")}`;
}

/** Путь правильной пятиконечной звезды (внешний/внутренний радиус, старт сверху). */
function starPath(cx, cy, outer, inner = outer * 0.382) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/* ──────────────────── геометрия трофея (локально) ──────────────────── */
/* Чаша: плоский верх ±38, плавно сужается к низу → не читается прямоугольником. */
const BOWL_D = "M -38 -52 L 38 -52 L 31 4 C 28.5 26 16 42 0 42 C -16 42 -28.5 26 -31 4 Z";
/* Ручки: ОБА конца лежат на стенке чаши (34/-34 сверху и 27/14 снизу) —
   раньше нижний конец был в (-45, 10) при стенке -36, отсюда зазор 9px. */
const HANDLE_R = [
  [34, -34],
  [62, -34],
  [66, 8],
  [27, 14],
];
const HANDLE_L = HANDLE_R.map(([x, y]) => [-x, y]);
const HANDLE_STROKE = 8;

const STEM = { x: -11, y: 42, w: 22, h: 22, rx: 6 };
const BASE = { x: -35, y: 64, w: 70, h: 16, rx: 8 };
const STAR = { cx: 0, cy: -6, outer: 23 };

const TROPHY_TOP = -52; // верх чаши
const TROPHY_BOTTOM = BASE.y + BASE.h; // 80 — низ подставки
const TROPHY_MID_Y = (TROPHY_TOP + TROPHY_BOTTOM) / 2; // 14 — центр bbox
const TROPHY_HALF_W = Math.max(maxAbsX(HANDLE_R) + HANDLE_STROKE / 2, 38, BASE.w / 2, STAR.outer);
const TROPHY_HALF_H = (TROPHY_BOTTOM - TROPHY_TOP) / 2; // 66
/* Самая дальняя от центра точка фигуры — верхние углы чаши. От неё считается
   радиус орбиты, чтобы трофей гарантированно помещался внутрь кольца. */
const TROPHY_CIRCUM_R = Math.hypot(38, TROPHY_TOP - TROPHY_MID_Y);

/* ───────────────────── параметры компоновки ───────────────────── */
const RING_CLEAR = 24; // зазор между крайней точкой трофея и орбитой
const RING_TO_TEXT = 14; // зазор между орбитой (вместе со спутником) и надписью
const DOT_R_TOP = 9.5; // спутник сверху
const DOT_R_SIDE = 7; // спутники по бокам (одинаковые — симметрия по оси)
const SAFE_ZONE_R = SIZE * 0.4; // 204.8 — безопасная зона maskable (80%)

/* Спутники — треножник с шагом 120°: 270° (верх), 30° и 150° (низ, симметрично). */
const DOT_ANGLES = [
  [270, DOT_R_TOP],
  [30, DOT_R_SIDE],
  [150, DOT_R_SIDE],
];
const DOT_COLORS = ["#7dd3fc", "#818cf8", "#a78bfa"];

function satellites(cx, cy, R, scale) {
  return DOT_ANGLES.map(([deg, r], i) => {
    const a = (deg * Math.PI) / 180;
    return `<circle cx="${r2(cx + R * Math.cos(a))}" cy="${r2(cy + R * Math.sin(a))}" r="${r2(r * scale)}" fill="${DOT_COLORS[i]}"${
      i === 2 ? ' fill-opacity="0.9"' : ""
    }/>`;
  }).join("\n  ");
}

/** Группа трофея: сначала сдвигаем bbox в ноль, потом масштаб, потом позиция. */
function trophyGroup(cx, cy, scale, suffix) {
  return `  <g transform="translate(${r2(cx)} ${r2(cy)}) scale(${scale}) translate(0 ${r2(-TROPHY_MID_Y)})">
    <path d="${BOWL_D}" fill="url(#trophyGrad${suffix})"/>
    <path d="${cubicD(HANDLE_R)}" fill="none" stroke="#f4f7ff" stroke-width="${HANDLE_STROKE}" stroke-linecap="round"/>
    <path d="${cubicD(HANDLE_L)}" fill="none" stroke="#f4f7ff" stroke-width="${HANDLE_STROKE}" stroke-linecap="round"/>
    <rect x="${STEM.x}" y="${STEM.y}" width="${STEM.w}" height="${STEM.h}" rx="${STEM.rx}" fill="#eef2ff"/>
    <rect x="${BASE.x}" y="${BASE.y}" width="${BASE.w}" height="${BASE.h}" rx="${BASE.rx}" fill="#eef2ff"/>
    <path d="${starPath(STAR.cx, STAR.cy, STAR.outer)}" fill="#6366f1"/>
  </g>`;
}

/** Общий фон: тёмная плитка + три световых пятна + шеврона — до самых краёв. */
function background(suffix) {
  return `  <rect width="${SIZE}" height="${SIZE}" fill="#0a0c1e"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowIndigo${suffix})"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowViolet${suffix})"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#glowSky${suffix})"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#gloss${suffix})"/>`;
}

function defs(suffix) {
  return `  <defs>
    <linearGradient id="trophyGrad${suffix}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dbe3ff"/>
    </linearGradient>
    <linearGradient id="word${suffix}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c7d2fe"/>
    </linearGradient>
    <linearGradient id="gloss${suffix}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glowIndigo${suffix}" cx="0.18" cy="0.04" r="0.85">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowViolet${suffix}" cx="0.92" cy="0.16" r="0.8">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowSky${suffix}" cx="0.5" cy="1.08" r="0.9">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="trophyGlow${suffix}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

/** Мягкое свечение за трофеем (круг, а не белый прямоугольник). */
function glow(cx, cy, halfH, suffix) {
  return `  <circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(halfH * 1.45)}" fill="url(#trophyGlow${suffix})"/>
  <circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(halfH)}" fill="#ffffff" fill-opacity="0.045"/>`;
}

/* ─────────────────────── словесный знак ─────────────────────── */
const font = opentype.parse(readFileSync(FONT).buffer);

/** Контуры надписи; bbox считается по факту, поэтому центровка оптическая.
 *  Параметр inkTop — желаемая ВЕРХНЯЯ граница заливки (не базовая линия):
 *  сдвиг на minY внутри функции уже превращает её в базовую линию. */
function wordmarkPath(inkTop) {
  const p = font.getPath(WORDMARK, 0, 0, WORDMARK_SIZE, { kerning: true });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of p.commands) {
    for (const k of ["x", "y", "x1", "y1", "x2", "y2"]) {
      if (typeof c[k] !== "number" || !Number.isFinite(c[k])) continue;
      if (k === "x" || k === "x1" || k === "x2") {
        minX = Math.min(minX, c[k]);
        maxX = Math.max(maxX, c[k]);
      } else {
        minY = Math.min(minY, c[k]);
        maxY = Math.max(maxY, c[k]);
      }
    }
  }
  const inkW = maxX - minX;
  const x = (SIZE - inkW) / 2 - minX;
  const y = inkTop - minY; // minY отрицателен (высота прописных над базовой)
  const out = font.getPath(WORDMARK, x, y, WORDMARK_SIZE, { kerning: true });
  /* Округление координат — защита от бага opentype.js с экспоненциальной
     записью, из-за которой в SVG попадал NaN и срезало правую часть надписи. */
  for (const cmd of out.commands) {
    for (const k of ["x", "y", "x1", "y1", "x2", "y2"]) {
      if (typeof cmd[k] === "number") cmd[k] = Math.round(cmd[k] * 100) / 100;
    }
  }
  return { d: out.toPathData(2), width: inkW, height: maxY - minY, top: minY, x, y };
}

/* ============================ 1. Основной логотип ============================
 * Связка «трофей + надпись» центрируется по плитке: верхнее поле равно нижнему.
 * Орбита концентрична трофею; её радиус и зазор до надписи выводятся из
 * геометрии, а не подбираются на глаз. */
const S_MAIN = 1.4;
const halfHMain = TROPHY_HALF_H * S_MAIN;
const ringMain = Math.round(TROPHY_CIRCUM_R * S_MAIN + RING_CLEAR);
const wm = wordmarkPath(0); // замер bbox надписи (ширина/высота) для компоновки
const gapMain = Math.round(ringMain + DOT_R_TOP + RING_TO_TEXT - halfHMain);
const cyMain = SIZE / 2 - (gapMain + wm.height) / 2;
const textTop = cyMain + halfHMain + gapMain;
const wmFinal = wordmarkPath(textTop); // inkTop: слово должно начаться ровно здесь

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
${defs("")}

${background("")}

  <!-- Орбита «событий» и спутники: строго на окружности радиуса ${ringMain} -->
  <circle cx="${r2(SIZE / 2)}" cy="${r2(cyMain)}" r="${ringMain}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/>
  ${satellites(SIZE / 2, cyMain, ringMain, 1)}

${glow(SIZE / 2, cyMain, halfHMain, "")}

${trophyGroup(SIZE / 2, cyMain, S_MAIN, "")}

  <!-- Словесный знак DSU Event (контуры шрифта) -->
  <path d="${wmFinal.d}" fill="url(#word)"/>
</svg>
`;

/* ========================= 2. Адаптивная иконка =========================
 * Только эмблема, строго по центру плитки, целиком внутри зоны 80%.
 * Фон залит до краёв — маска Android/iOS режет градиент, без белых полей. */
const S_MASK = 1.8;
const halfHMask = TROPHY_HALF_H * S_MASK;
const ringMask = Math.round(TROPHY_CIRCUM_R * S_MASK + 28);
const dotScale = S_MASK / S_MAIN;
const maxExtent = ringMask + DOT_R_TOP * dotScale;
if (maxExtent > SAFE_ZONE_R) {
  throw new Error(`Эмблема выходит из безопасной зоны: ${maxExtent.toFixed(1)} > ${SAFE_ZONE_R}`);
}

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
${defs("M")}

${background("M")}

  <!-- Орбита и спутники: радиус ${ringMask}, всё внутри safe zone r=${SAFE_ZONE_R} -->
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${ringMask}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/>
  ${satellites(SIZE / 2, SIZE / 2, ringMask, dotScale)}

${glow(SIZE / 2, SIZE / 2, halfHMask, "M")}

${trophyGroup(SIZE / 2, SIZE / 2, S_MASK, "M")}
</svg>
`;

/* ─────────────────────────── запись файлов ─────────────────────────── */
writeFileSync(path.join(root, "public/logo.svg"), logoSvg);

for (const [file, px] of [
  ["public/icon-512.png", 512],
  ["public/icon-192.png", 192],
]) {
  const resvg = new Resvg(logoSvg, { fitTo: { mode: "width", value: px } });
  writeFileSync(path.join(root, file), resvg.render().asPng());
  console.log("✓", file, px + "px (any)");
}

for (const [file, px] of [
  ["public/icon-maskable-512.png", 512],
  ["public/icon-maskable-192.png", 192],
  ["public/apple-touch-icon.png", 180],
]) {
  const resvg = new Resvg(maskableSvg, { fitTo: { mode: "width", value: px } });
  writeFileSync(path.join(root, file), resvg.render().asPng());
  console.log("✓", file, px + "px (maskable)");
}

/* ─────────────────────────── самопроверка ─────────────────────────── */
const contentTop = cyMain - halfHMain;
const contentBottom = textTop + wm.height;
console.log("\nГеометрия трофея (локально):");
console.log(`  bbox y: ${TROPHY_TOP} … ${TROPHY_BOTTOM}, центр bbox = ${TROPHY_MID_Y} (компенсируется translate)`);
console.log(`  половина ширины ${TROPHY_HALF_W.toFixed(1)}, половина высоты ${TROPHY_HALF_H}, обходной радиус ${TROPHY_CIRCUM_R.toFixed(1)}`);
console.log("\nОсновной логотип (512×512):");
console.log(`  трофей: центр (256, ${cyMain.toFixed(1)}), высота ${(halfHMain * 2).toFixed(1)}, ширина ${(TROPHY_HALF_W * 2 * S_MAIN).toFixed(1)}`);
console.log(`  орбита r=${ringMain} (зазор до трофея ${(ringMain - TROPHY_CIRCUM_R * S_MAIN).toFixed(1)}), спутники на окружности`);
console.log(`  надпись: ширина ${wm.width.toFixed(1)}, верх ${textTop.toFixed(1)}, низ ${contentBottom.toFixed(1)}`);
console.log(`  поля: верх ${contentTop.toFixed(1)} / низ ${(SIZE - contentBottom).toFixed(1)} (разница ${Math.abs(contentTop - (SIZE - contentBottom)).toFixed(1)})`);
console.log(`  зазор орбита→надпись: ${(textTop - (cyMain + ringMain + DOT_R_TOP)).toFixed(1)}`);
console.log("\nАдаптивная иконка (512×512):");
console.log(`  трофей: центр (256, 256), высота ${(halfHMask * 2).toFixed(1)}, ширина ${(TROPHY_HALF_W * 2 * S_MASK).toFixed(1)}`);
console.log(`  крайняя точка ${maxExtent.toFixed(1)} из безопасной зоны ${SAFE_ZONE_R} (запас ${(SAFE_ZONE_R - maxExtent).toFixed(1)})`);
console.log("\n✓ public/logo.svg — предметы выровнены по осям и по орбите");
