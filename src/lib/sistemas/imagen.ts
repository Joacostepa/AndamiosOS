/**
 * Sistemas: las imágenes del reporte (docs/sistemas/contrato.md §6.1). Todo lo que se sube
 * pasa por normalizarImagen(): la captura, las imágenes que suma la persona (archivo, galería,
 * Ctrl+V, arrastrar) y la versión aplanada del editor de marcas.
 *
 *  · Lado largo ≤ LIMITES.ladoMax (1920 px), sin agrandar nunca.
 *  · WebP 0,85. Safari no genera WebP (toBlob devuelve PNG aunque se le pida otro tipo): si el
 *    blob no vuelve como image/webp, PNG. Si pasa de LIMITES.bytesImagen (5 MB), JPEG con
 *    menos calidad y, si hace falta, más chica.
 *  · SIEMPRE se vuelve a codificar, aunque ya entre en los límites: así se van los metadatos
 *    de la foto original (ubicación GPS, modelo del teléfono) y el servidor recibe sólo
 *    png / jpeg / webp de verdad.
 *
 * Las cuentas (medidasAjustadas, planDeIntentos) son puras y tienen tests en imagen.test.ts.
 */

import { LIMITES, TEXTOS, type ImagenLista, type MimeImagen } from "./tipos.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas puras
// ─────────────────────────────────────────────────────────────────────────────

/** Medidas finales para que el lado largo no pase de `ladoMax`. Nunca agranda; mínimo 1×1. */
export function medidasAjustadas(ancho: number, alto: number, ladoMax: number = LIMITES.ladoMax): { ancho: number; alto: number; escala: number } {
  const a = Math.max(1, Math.round(ancho) || 1);
  const h = Math.max(1, Math.round(alto) || 1);
  const escala = Math.min(1, ladoMax / Math.max(a, h));
  return { ancho: Math.max(1, Math.round(a * escala)), alto: Math.max(1, Math.round(h * escala)), escala };
}

export type Intento = { mime: MimeImagen; calidad?: number; ladoMax: number };

/**
 * En qué orden se prueba hasta que entre en 5 MB: WebP 0,85 (o PNG si el navegador no hace
 * WebP), después JPEG cada vez con menos calidad y por último más chica. Una captura normal
 * sale en el primer intento.
 */
export function planDeIntentos(ladoMax: number = LIMITES.ladoMax): Intento[] {
  return [
    { mime: "image/webp", calidad: LIMITES.calidadWebp, ladoMax },
    { mime: "image/jpeg", calidad: 0.85, ladoMax },
    { mime: "image/jpeg", calidad: 0.7, ladoMax },
    { mime: "image/jpeg", calidad: 0.7, ladoMax: Math.round(ladoMax * 0.75) },
    { mime: "image/jpeg", calidad: 0.6, ladoMax: Math.round(ladoMax * 0.5) },
  ];
}

/** El mime que realmente devolvió el navegador, si es uno de los que acepta el bucket. */
export function mimeAceptado(tipo: string): MimeImagen | null {
  const t = tipo.toLowerCase();
  return t === "image/webp" || t === "image/png" || t === "image/jpeg" ? t : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas del editor de marcas (src/components/sistemas/editor-marcas.tsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tamaño en pantalla (px CSS) para que la imagen entre en `maxAncho × maxAlto` sin deformarse.
 * Sin agrandar más allá de 1:1, salvo las muy chicas (menos de 320 px), que se llevan hasta
 * ocupar el lugar para que se puedan marcar con el dedo.
 */
export function escalaParaCaber(ancho: number, alto: number, maxAncho: number, maxAlto: number): { ancho: number; alto: number; escala: number } {
  if (ancho <= 0 || alto <= 0 || maxAncho <= 0 || maxAlto <= 0) return { ancho: 0, alto: 0, escala: 0 };
  const cabe = Math.min(maxAncho / ancho, maxAlto / alto);
  const tope = Math.max(ancho, alto) < 320 ? cabe : 1;
  const escala = Math.min(cabe, tope);
  return { ancho: Math.floor(ancho * escala), alto: Math.floor(alto * escala), escala };
}

/**
 * Grosor del trazo rojo en píxeles DE LA IMAGEN: 3 px como base (lo de la maqueta) y más en
 * las imágenes grandes, para que en la bandeja se vea igual de firme en una captura de
 * escritorio (1920 px) que en una de celular.
 */
export function grosorTrazo(ancho: number, alto: number): number {
  return Math.max(3, Math.round(Math.max(ancho, alto) / 360));
}

/** El rectángulo entre dos puntos (en cualquier orden), con ancho y alto positivos, recortado a la imagen. */
export function rectEntre(
  a: readonly [number, number],
  b: readonly [number, number],
  limite: { ancho: number; alto: number },
): { x: number; y: number; ancho: number; alto: number } {
  const recorte = (v: number, max: number) => Math.min(Math.max(0, v), max);
  const x1 = recorte(Math.min(a[0], b[0]), limite.ancho);
  const y1 = recorte(Math.min(a[1], b[1]), limite.alto);
  const x2 = recorte(Math.max(a[0], b[0]), limite.ancho);
  const y2 = recorte(Math.max(a[1], b[1]), limite.alto);
  return { x: Math.round(x1), y: Math.round(y1), ancho: Math.round(x2 - x1), alto: Math.round(y2 - y1) };
}

/** De un punto de la pantalla (clientX/Y) a píxeles de la imagen, dado el rectángulo del lienzo. */
export function aCoordenadasImagen(
  cliente: { x: number; y: number },
  caja: { left: number; top: number; width: number; height: number },
  imagen: { ancho: number; alto: number },
): [number, number] {
  if (caja.width <= 0 || caja.height <= 0) return [0, 0];
  const x = ((cliente.x - caja.left) / caja.width) * imagen.ancho;
  const y = ((cliente.y - caja.top) / caja.height) * imagen.alto;
  return [Math.round(Math.min(Math.max(0, x), imagen.ancho)), Math.round(Math.min(Math.max(0, y), imagen.alto))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Navegador
// ─────────────────────────────────────────────────────────────────────────────

type Fuente = Blob | HTMLCanvasElement | ImageBitmap;
type Dibujable = HTMLCanvasElement | ImageBitmap | HTMLImageElement;

function ilegible(): Error {
  return new Error(TEXTOS.panel.imagenIlegible);
}

function medidasDe(d: Dibujable): { ancho: number; alto: number } {
  if (d instanceof HTMLImageElement) return { ancho: d.naturalWidth, alto: d.naturalHeight };
  return { ancho: d.width, alto: d.height };
}

/** Lee un Blob como algo dibujable. createImageBitmap respeta la orientación EXIF; si no está o falla, <img>. */
async function leerBlob(blob: Blob): Promise<{ d: Dibujable; liberar: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      return { d: bmp, liberar: () => bmp.close() };
    } catch {
      /* probamos con <img> (algunos Safari con ciertos JPEG) */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { d: img, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw ilegible();
  }
}

function aBlob(canvas: HTMLCanvasElement, mime: MimeImagen, calidad?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mime, calidad);
    } catch {
      resolve(null);
    }
  });
}

function lienzo(d: Dibujable, ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext("2d");
  if (!ctx) throw ilegible();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(d, 0, 0, ancho, alto);
  return c;
}

/**
 * Lleva cualquier fuente a ImagenLista: lado largo ≤ LIMITES.ladoMax, WebP 0,85; si el navegador
 * no genera WebP (blob.type !== "image/webp", Safari), PNG. Tira Error(TEXTOS.panel.imagenIlegible)
 * si no la puede leer.
 */
export async function normalizarImagen(fuente: Fuente): Promise<ImagenLista> {
  if (typeof document === "undefined") throw ilegible();
  let liberar = () => {};
  let d: Dibujable;
  if (fuente instanceof Blob) {
    if (fuente.size === 0) throw ilegible();
    const leida = await leerBlob(fuente);
    d = leida.d;
    liberar = leida.liberar;
  } else {
    d = fuente;
  }

  try {
    const orig = medidasDe(d);
    if (!orig.ancho || !orig.alto) throw ilegible();

    // Los lienzos se arman una vez por tamaño (los intentos de calidad comparten el mismo).
    const porLado = new Map<number, HTMLCanvasElement>();
    const lienzoPara = (ladoMax: number) => {
      let c = porLado.get(ladoMax);
      if (!c) {
        const m = medidasAjustadas(orig.ancho, orig.alto, ladoMax);
        c = lienzo(d, m.ancho, m.alto);
        porLado.set(ladoMax, c);
      }
      return c;
    };

    let ultimo: { blob: Blob; mime: MimeImagen; c: HTMLCanvasElement } | null = null;
    for (const intento of planDeIntentos()) {
      const c = lienzoPara(intento.ladoMax);
      let blob = await aBlob(c, intento.mime, intento.calidad);
      let mime = blob ? mimeAceptado(blob.type) : null;
      // Pedimos WebP y vino otra cosa (Safari): PNG, que todos generan.
      if (intento.mime === "image/webp" && mime !== "image/webp") {
        blob = await aBlob(c, "image/png");
        mime = blob ? mimeAceptado(blob.type) : null;
      }
      if (!blob || !mime) continue;
      ultimo = { blob, mime, c };
      if (blob.size <= LIMITES.bytesImagen) break;
    }
    if (!ultimo || ultimo.blob.size > LIMITES.bytesImagen) throw ilegible();

    return {
      blob: ultimo.blob,
      mime: ultimo.mime,
      ancho: ultimo.c.width,
      alto: ultimo.c.height,
      url: URL.createObjectURL(ultimo.blob),
    };
  } catch (e) {
    if (e instanceof Error && e.message === TEXTOS.panel.imagenIlegible) throw e;
    throw ilegible();
  } finally {
    liberar();
  }
}

/** Para las imágenes que se descartan (cierra el panel, Quitar). Se puede llamar dos veces. */
export function liberarImagen(img: ImagenLista | null | undefined): void {
  try {
    if (img?.url) URL.revokeObjectURL(img.url);
  } catch {
    /* nunca */
  }
}
