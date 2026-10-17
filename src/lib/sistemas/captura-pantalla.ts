/**
 * Sistemas: la foto de lo que se ve al tocar «Reportar» (docs/sistemas/contrato.md §6.2).
 *
 * snapdom (@zumer/snapdom, 3.3.4 exacta) clona el DOM, lo pinta en un SVG y lo pasa a un
 * canvas. Se importa recién al tocar el botón: no pesa en la carga de ninguna pantalla.
 *
 *  · clip "viewport": sólo lo que está en pantalla. El <main> del dashboard tiene overflow-auto
 *    y snapdom respeta su scroll: sale lo que la persona ve, no el principio de la página.
 *  · Afuera de la foto: todo lo que tenga data-capture="exclude" (el botón Reportar, el panel,
 *    el editor), los toasts de sonner y el cartel de desarrollo de Next.
 *  · Los lienzos WebGL (mapas, vista 3D) se cambian por su foto mientras dura (lienzos-webgl.ts).
 *
 * NUNCA tira: si snapdom falla, tarda más de LIMITES.capturaMs o la imagen sale casi pareja
 * (en blanco, toda negra), devuelve { ok: false, motivo } y el panel se abre sin foto con
 * «Sumar imagen» a mano.
 */

import { EXCLUIR_CAPTURA, LIMITES, type ResultadoCaptura } from "./tipos.ts";
import { congelarLienzos } from "./lienzos-webgl.ts";
import { normalizarImagen } from "./imagen.ts";

/** Lo que snapdom deja afuera, además de data-capture="exclude" (que ya respeta solo). */
const EXCLUIR = [`[${EXCLUIR_CAPTURA.atributo}="${EXCLUIR_CAPTURA.valor}"]`, "[data-sonner-toaster]", "nextjs-portal"];

// ─────────────────────────────────────────────────────────────────────────────
// Detección de imagen pareja (pura, con tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Debajo de este desvío (en niveles de 0 a 255) la imagen se considera «toda igual». */
export const DESVIO_MINIMO = 2;

/**
 * ¿Los píxeles (RGBA) son casi todos iguales? Muestrea hasta `muestras` píxeles repartidos y
 * mira el desvío estándar de la luminancia. Los transparentes cuentan como blancos (así se ven
 * en el panel). Una pantalla real, aunque tenga mucho blanco, tiene texto, bordes y la barra
 * lateral: queda muy por encima del umbral.
 */
export function esCasiUniforme(rgba: ArrayLike<number>, muestras = 200): boolean {
  const total = Math.floor(rgba.length / 4);
  if (total === 0) return true;
  const n = Math.min(total, Math.max(1, muestras));
  const paso = total / n;
  let suma = 0;
  let sumaCuad = 0;
  for (let k = 0; k < n; k++) {
    const i = Math.floor(k * paso) * 4;
    const alfa = (rgba[i + 3] ?? 255) / 255;
    const lum = 0.2126 * (rgba[i] ?? 0) + 0.7152 * (rgba[i + 1] ?? 0) + 0.0722 * (rgba[i + 2] ?? 0);
    const v = lum * alfa + 255 * (1 - alfa);
    suma += v;
    sumaCuad += v * v;
  }
  const media = suma / n;
  const varianza = Math.max(0, sumaCuad / n - media * media);
  return Math.sqrt(varianza) < DESVIO_MINIMO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navegador
// ─────────────────────────────────────────────────────────────────────────────

class SinTiempo extends Error {}

function conTiempo<T>(p: Promise<T>, ms: number, alVencer: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        alVencer();
      } finally {
        reject(new SinTiempo());
      }
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Achica la captura a un canvas de ~40 px de ancho y mira si es toda del mismo color. */
function saleUniforme(canvas: HTMLCanvasElement): boolean {
  try {
    const ancho = 40;
    const alto = Math.max(1, Math.round((canvas.height / Math.max(1, canvas.width)) * ancho));
    const chico = document.createElement("canvas");
    chico.width = ancho;
    chico.height = alto;
    const ctx = chico.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(canvas, 0, 0, ancho, alto);
    return esCasiUniforme(ctx.getImageData(0, 0, ancho, alto).data);
  } catch {
    // Un canvas «sucio» (imagen de otro sitio sin CORS) no deja leer píxeles: no lo
    // descartamos por eso. Si después no se puede exportar, normalizarImagen lo dirá.
    return false;
  }
}

/** El fondo de la página, para que lo transparente no salga negro en WebP/JPEG. */
function fondoDePagina(): string {
  try {
    for (const el of [document.body, document.documentElement]) {
      const c = el ? getComputedStyle(el).backgroundColor : "";
      if (c && c !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c)) return c;
    }
  } catch {
    /* blanco */
  }
  return "#ffffff";
}

/** Saca la foto de lo que se ve. NUNCA tira: ante cualquier problema devuelve { ok: false, motivo }. */
export async function capturarPantalla(): Promise<ResultadoCaptura> {
  try {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      typeof HTMLCanvasElement === "undefined" ||
      typeof HTMLCanvasElement.prototype.toBlob !== "function"
    ) {
      return { ok: false, motivo: "sin-soporte" };
    }
  } catch {
    return { ok: false, motivo: "sin-soporte" };
  }

  let restaurar: () => void = () => {};
  const soltar = () => {
    const r = restaurar;
    restaurar = () => {};
    try {
      r();
    } catch {
      /* nunca */
    }
  };

  const sacar = async (): Promise<HTMLCanvasElement> => {
    const { snapdom } = await import("@zumer/snapdom");
    restaurar = congelarLienzos();
    try {
      const captura = await snapdom(document.documentElement, {
        clip: "viewport",
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        scale: 1,
        exclude: EXCLUIR,
        backgroundColor: fondoDePagina(),
      });
      return await captura.toCanvas();
    } finally {
      soltar();
    }
  };

  let canvas: HTMLCanvasElement;
  try {
    // Si vence el tiempo, se restauran los lienzos ya mismo; snapdom puede terminar después
    // en segundo plano y su resultado se tira.
    canvas = await conTiempo(sacar(), LIMITES.capturaMs, soltar);
  } catch (e) {
    soltar();
    return { ok: false, motivo: e instanceof SinTiempo ? "tiempo" : "error" };
  }

  try {
    if (!canvas.width || !canvas.height || saleUniforme(canvas)) return { ok: false, motivo: "uniforme" };
    const imagen = await normalizarImagen(canvas);
    return { ok: true, imagen };
  } catch {
    return { ok: false, motivo: "error" };
  } finally {
    // El canvas grande ya no hace falta: se libera la memoria (en iOS el límite es estricto).
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      /* nunca */
    }
  }
}
