// Verifica el contraste de la paleta del tablero EN LOS DOS TEMAS.
//
// POR QUÉ EXISTE: el módulo se diseñó sobre fondo blanco con los hex clavados en el TS.
// Al encender el modo oscuro nada de eso cambiaba, y el peor caso —tarjeta tentativa:
// fondo `var(--card)`, que sí seguía al tema, con el texto navy de la paleta clara—
// quedaba en 1,4:1. Nadie lo vio hasta que alguien miró la pantalla, porque no había nada
// en el repo que pudiera verlo.
//
// Esto lee src/app/globals.css, resuelve los tokens de :root y de .dark, y compara cada
// par (fondo, texto) contra WCAG. Es lo único que ata la paleta a una promesa verificable:
// un token nuevo que no entre acá vuelve a ser un color que nadie mira.
//
//   node scripts/contraste-tablero.mjs
//
// Sale con código 1 si algo no llega. Agregar un color al tablero = agregar su par acá.

import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

// ── Lectura de los tokens ────────────────────────────────────────────────────

/** Saca el cuerpo de un bloque `selector { ... }` contando llaves. */
function bloque(css, selector) {
  const i = css.indexOf(selector + " {");
  if (i < 0) throw new Error(`No encontré el bloque ${selector} en globals.css`);
  let nivel = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") nivel++;
    else if (css[j] === "}" && --nivel === 0) return css.slice(css.indexOf("{", i) + 1, j);
  }
  throw new Error(`El bloque ${selector} no cierra`);
}

/** Propiedades `--x: valor;` de un bloque, con los comentarios ya sacados. */
function tokens(cuerpo) {
  const limpio = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "");
  const mapa = new Map();
  for (const m of limpio.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) mapa.set(m[1], m[2].trim());
  return mapa;
}

const CLARO = tokens(bloque(CSS, ":root"));
const OSCURO = new Map([...CLARO, ...tokens(bloque(CSS, ".dark"))]);

// ── Color ────────────────────────────────────────────────────────────────────
//
// Todo termina en RGB LINEAL, que es lo que pide la luminancia relativa de WCAG. El
// camino corto desde oklch ya está en lineal, así que no hay ida y vuelta por sRGB.

/** oklch(L C H [/ A]) → {r,g,b} lineal + alpha. */
function deOklch(L, C, H, alpha) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return {
    r: clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

const aLineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Resuelve un valor CSS a color lineal. Entiende hex, oklch(), `transparent`, `var(--x)`
 * y el `color-mix(in oklch, A p%, B)` que usan los velos del tablero.
 */
function color(valor, mapa, visto = new Set()) {
  const v = valor.trim();

  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const varRef = v.match(/^var\((--[\w-]+)\)$/);
  if (varRef) {
    if (visto.has(varRef[1])) throw new Error(`Ciclo de var() en ${varRef[1]}`);
    const destino = mapa.get(varRef[1]);
    if (!destino) throw new Error(`Token sin definir: ${varRef[1]}`);
    return color(destino, mapa, new Set(visto).add(varRef[1]));
  }

  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return {
      r: aLineal(((n >> 16) & 255) / 255),
      g: aLineal(((n >> 8) & 255) / 255),
      b: aLineal((n & 255) / 255),
      a: 1,
    };
  }

  const ok = v.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (ok) {
    const num = (x) => (x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x));
    return deOklch(num(ok[1]), parseFloat(ok[2]), parseFloat(ok[3]), ok[4] ? num(ok[4]) : 1);
  }

  // color-mix(in oklch, A p%, B). El único caso que hay es mezclar contra `transparent`,
  // que en CSS es "el color A con alpha p" — no un gris intermedio.
  const mix = v.match(/^color-mix\(\s*in oklch\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/);
  if (mix) {
    const p = parseFloat(mix[2]) / 100;
    const a = color(mix[1], mapa, visto);
    const b = color(mix[3], mapa, visto);
    if (b.a === 0) return { ...a, a: a.a * p };
    if (a.a === 0) return { ...b, a: b.a * (1 - p) };
    return {
      r: a.r * p + b.r * (1 - p),
      g: a.g * p + b.g * (1 - p),
      b: a.b * p + b.b * (1 - p),
      a: 1,
    };
  }

  throw new Error(`No sé leer el color: ${v}`);
}

/** Compone `frente` (que puede ser translúcido) sobre `fondo`, ya opaco. */
function sobre(frente, fondo) {
  const a = frente.a;
  return {
    r: frente.r * a + fondo.r * (1 - a),
    g: frente.g * a + fondo.g * (1 - a),
    b: frente.b * a + fondo.b * (1 - a),
    a: 1,
  };
}

const luminancia = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/**
 * Lightness de oklab. Es la métrica de los VELOS y de la grilla, no WCAG.
 *
 * POR QUÉ DOS MÉTRICAS: la razón de contraste de WCAG está construida para texto y se
 * derrumba cerca del negro, donde el +0.05 del denominador domina. Medida así, el mismo
 * velo perceptual da 1.02 en claro y 1.55 en oscuro, y uno termina "arreglando" un tema
 * hasta romper el otro. Para "cuánto más claro se ve esto que lo de atrás" la respuesta
 * es ΔL, que es perceptual y directamente comparable entre temas.
 */
function lightness(c) {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

function deltaL(frenteRaw, fondo, mapa) {
  return Math.abs(lightness(sobre(color(frenteRaw, mapa), fondo)) - lightness(fondo));
}

/** Coordenadas oklab completas, para medir distancia con el croma incluido. */
function oklab(c) {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Distancia perceptual entre dos rellenos. Va con croma y no sólo con lightness: dos
 * fondos pueden tener la misma claridad y distinguirse igual por el tinte, que es
 * exactamente cómo funciona el pastel sobre blanco del modo claro.
 */
function deltaE(aRaw, bRaw, mapa) {
  const [l1, a1, b1] = oklab(color(aRaw, mapa));
  const [l2, a2, b2] = oklab(color(bRaw, mapa));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function contraste(frenteRaw, fondo, mapa) {
  const frente = sobre(color(frenteRaw, mapa), fondo);
  const a = luminancia(frente);
  const b = luminancia(fondo);
  const [alto, bajo] = a > b ? [a, b] : [b, a];
  return (alto + 0.05) / (bajo + 0.05);
}

// ── Los pares ────────────────────────────────────────────────────────────────
//
// Tres clases, porque no todo el color del tablero es texto:
//
//   texto  → 4,5:1. WCAG AA. Las tarjetas son de 10 a 12px: acá no hay "texto grande".
//   trazo  → 3:1. WCAG 1.4.11 para lo que no es texto: franjas, puntos del semáforo,
//            íconos, el borde de la fila de cuadrilla. Si no llega, la señal no existe.
//   estado → ΔE en oklab entre el relleno confirmado y el de la tentativa.
//   velo   → una franja de ΔL, no un piso de WCAG. Son los fondos que tienen que
//            INSINUARSE: canaleta, feriado, día pasado, destino de arrastre. Por debajo
//            del piso no se ven; por encima del techo dejan de ser fondo y compiten con
//            las tarjetas que llevan encima, que es el bug de la canaleta beige en oscuro.

const TEXTO = [
  // El corazón del asunto: el mismo texto de tipo sobre la tarjeta confirmada (relleno de
  // color) y sobre la tentativa (relleno de la superficie). Los dos casos, los dos temas.
  ["armado confirmada", "var(--tb-azul-text)", "var(--tb-azul-bg)"],
  ["armado tentativa", "var(--tb-azul-text)", "var(--card)"],
  ["desarme confirmada", "var(--tb-ambar-text)", "var(--tb-ambar-bg)"],
  ["desarme tentativa", "var(--tb-ambar-text)", "var(--card)"],
  ["sin tipo confirmada", "var(--tb-neutro-text)", "var(--tb-neutro-bg)"],
  ["sin tipo tentativa", "var(--tb-neutro-text)", "var(--card)"],
  ["tarea confirmada", "var(--tb-violeta-text)", "var(--tb-violeta-bg)"],
  ["tarea tentativa", "var(--tb-violeta-text)", "var(--card)"],
  // El resto de la paleta de cuadrilla: hoy no lleva texto sobre su propio fondo, pero el
  // par existe en el token y cicla a partir de la novena cuadrilla.
  ["verde", "var(--tb-verde-text)", "var(--tb-verde-bg)"],
  ["rosa", "var(--tb-rosa-text)", "var(--tb-rosa-bg)"],
  ["teal", "var(--tb-teal-text)", "var(--tb-teal-bg)"],
  ["coral", "var(--tb-coral-text)", "var(--tb-coral-bg)"],
  ["gris azulado", "var(--tb-gris-text)", "var(--tb-gris-bg)"],
  // Estados.
  ["jornada no ejecutada", "var(--tb-peligro-text)", "var(--tb-peligro-suave)"],
  ["urgencia media (chip)", "var(--tb-ambar-text)", "var(--tb-ambar-bg)"],
  ["nota de la jornada", "var(--tb-nota-text)", "var(--tb-nota-bg)"],
  ["recuadro de aviso", "var(--tb-aviso-text)", "var(--tb-aviso-bg)"],
  ["encabezado de feriado", "var(--tb-feriado-texto)", "var(--tb-feriado-encabezado)"],
  // Rellenos con texto blanco. Son la razón por la que existen los `-solido`.
  ["botón ejecutado", "#ffffff", "var(--tb-ok-solido)"],
  ["badge urgencia alta", "#ffffff", "var(--tb-peligro-solido)"],
  // Chrome, que también se movió. El destructivo entra por el cajón de planificación:
  // el aviso de conflicto de las notas va a 10px y es lo único que separa "se guardó" de
  // "le pisaste el texto a alguien".
  ["aviso de conflicto", "var(--destructive)", "var(--card)"],
  ["texto secundario sobre tarjeta", "var(--muted-foreground)", "var(--card)"],
  ["texto secundario sobre fondo", "var(--muted-foreground)", "var(--background)"],
];

const TRAZO = [
  ["semáforo verde", "var(--tb-ok)", "var(--card)"],
  ["semáforo amarillo", "var(--tb-alerta)", "var(--card)"],
  ["semáforo rojo", "var(--tb-peligro)", "var(--card)"],
  ["semáforo vencida", "var(--tb-vencida)", "var(--card)"],
  ["candado", "var(--tb-candado)", "var(--card)"],
  ["ícono de aviso", "var(--tb-aviso-icono)", "var(--tb-aviso-bg)"],
  ["franja de nota", "var(--tb-nota-bg)", "var(--card)"],
  ["relleno de ocupación", "var(--tb-riel-relleno)", "var(--tb-riel)"],
  ["borde fila cuadrilla 1", "var(--tb-azul-borde)", "var(--card)"],
  ["borde fila cuadrilla 2", "var(--tb-ambar-borde)", "var(--card)"],
  ["borde fila cuadrilla 3", "var(--tb-verde-borde)", "var(--card)"],
  ["borde fila cuadrilla 4", "var(--tb-rosa-borde)", "var(--card)"],
  ["borde fila cuadrilla 5", "var(--tb-violeta-borde)", "var(--card)"],
  ["borde fila cuadrilla 6", "var(--tb-teal-borde)", "var(--card)"],
  ["borde fila cuadrilla 7", "var(--tb-coral-borde)", "var(--card)"],
  ["borde fila cuadrilla 8", "var(--tb-gris-borde)", "var(--card)"],
];

// La grilla del tablero. Va aparte porque se mide en ΔL: un separador de 1px no es un
// componente que haya que identificar, es una guía que tiene que existir. Medido con WCAG
// el borde claro da 1,35 y el oscuro 2,71 — y de ahí salió la idea equivocada de que en
// oscuro la grilla estaba floja. En ΔL es al revés: 0.10 en claro contra 0.28 en oscuro.
const GRILLA = [["línea de la grilla", "var(--border)", "var(--card)"]];

// El canal del ESTADO: confirmada (relleno de color) contra tentativa (sin relleno).
//
// Existe porque el chequeo de texto NO lo veía y la regresión pasó igual: con la tentativa
// pintada de `var(--card)` los dos rellenos quedaban a ΔE 0.07 en oscuro y desde un metro
// eran la misma tarjeta. Que cada texto se lea no alcanza si el tablero deja de decir cuál
// está confirmada.
const ESTADO = [
  ["armado: confirmada vs tentativa", "var(--tb-azul-bg)", "var(--tb-tentativa)"],
  ["desarme: confirmada vs tentativa", "var(--tb-ambar-bg)", "var(--tb-tentativa)"],
  ["tarea: confirmada vs tentativa", "var(--tb-violeta-bg)", "var(--tb-tentativa)"],
  ["sin tipo: confirmada vs tentativa", "var(--tb-neutro-bg)", "var(--tb-tentativa)"],
];

const VELO = [
  ["canaleta del domingo", "var(--tb-canaleta)", "var(--card)"],
  ["columna de feriado", "var(--tb-feriado-columna)", "var(--background)"],
  ["día pasado", "var(--tb-pasado)", "var(--card)"],
  ["destino de arrastre", "var(--tb-acento-bg)", "var(--card)"],
  ["riel de ocupación", "var(--tb-riel)", "var(--card)"],
];

// Lo que queda afuera a sabiendas. Sin esta lista la tentación es aflojar el piso, que es
// como se pierde un chequeo entero.
const EXENCIONES = [
  "blanco sobre el coral de marca (#D85A30) da 3,4:1 — es el pill de HOY y el botón" +
    " primario de toda la app, no una decisión del tablero. Cambiarlo es cambiar la" +
    " marca y va por otro lado.",
];

// Deuda conocida, toda del MODO CLARO y toda anterior a esto. No se arregla acá porque
// arreglarla es cambiar cómo se ve el tema que hoy está bien: el ámbar de los tres
// primeros es #EF9F27, color de marca, y aparece en media app. Se listan para que sean
// una decisión pendiente y no un chequeo que alguien aflojó.
const DEUDA = new Map([
  ["CLARO/semáforo amarillo", "el ámbar de marca sobre blanco da 2,17:1"],
  ["CLARO/franja de nota", "mismo ámbar de marca sobre blanco"],
  ["CLARO/borde fila cuadrilla 2", "mismo ámbar de marca sobre blanco"],
  ["CLARO/borde fila cuadrilla 6", "el teal #2AA79E queda en 2,95:1, a un pelo del piso"],
  ["CLARO/relleno de ocupación", "#B4B2A9 sobre el riel #E8E6DF da 1,70:1"],
]);

// ── Corrida ──────────────────────────────────────────────────────────────────

let fallas = 0;

function chequear(tema, mapa) {
  console.log(`\n  ${tema}`);
  const linea = (ok, nombre, valor, unidad, esperado) => {
    const deuda = !ok && DEUDA.has(`${tema}/${nombre}`);
    if (!ok && !deuda) fallas++;
    const marca = ok ? "ok   " : deuda ? "deuda" : "MAL  ";
    const cola = deuda ? `  ← ${DEUDA.get(`${tema}/${nombre}`)}` : "";
    console.log(
      `    ${marca} ${nombre.padEnd(32)} ${valor.toFixed(2).padStart(5)}${unidad}  ${esperado}${cola}`,
    );
  };

  for (const [nombre, frente, fondo] of TEXTO) {
    const r = contraste(frente, color(fondo, mapa), mapa);
    linea(r >= 4.5, nombre, r, ":1", "≥ 4.50");
  }
  for (const [nombre, frente, fondo] of TRAZO) {
    const r = contraste(frente, color(fondo, mapa), mapa);
    linea(r >= 3, nombre, r, ":1", "≥ 3.00");
  }
  for (const [nombre, a, b] of ESTADO) {
    const e = deltaE(a, b, mapa);
    linea(e >= 0.03, nombre, e, "ΔE", "≥ 0.03");
  }
  for (const [nombre, frente, fondo] of GRILLA) {
    const d = deltaL(frente, color(fondo, mapa), mapa);
    linea(d >= 0.06, nombre, d, "ΔL", "≥ 0.06");
  }
  for (const [nombre, frente, fondo] of VELO) {
    const d = deltaL(frente, color(fondo, mapa), mapa);
    linea(d >= 0.02 && d <= 0.1, nombre, d, "ΔL", "0.02 – 0.10");
  }
}

console.log("Contraste de la paleta del tablero (src/app/globals.css)");
chequear("CLARO", CLARO);
chequear("OSCURO", OSCURO);

console.log("\n  exentos a sabiendas");
for (const e of EXENCIONES) console.log(`    · ${e}`);

console.log(
  fallas === 0
    ? `\n  Todo en regla. ${DEUDA.size} par(es) marcados como deuda del modo claro.\n`
    : `\n  ${fallas} par(es) fuera de norma. Se arreglan en globals.css, no acá.\n`,
);
process.exit(fallas === 0 ? 0 : 1);
