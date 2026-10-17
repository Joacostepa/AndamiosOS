/**
 * Sistemas: los lienzos WebGL en la foto de la pantalla (docs/sistemas/contrato.md §6.5).
 *
 * Un canvas WebGL creado sin `preserveDrawingBuffer` (maplibre y three lo crean así, por
 * rendimiento) borra su contenido después de cada cuadro: leído desde afuera (snapdom hace
 * canvas.toDataURL) sale en blanco. Por eso cada componente WebGL registra acá una función
 * que REDIBUJA y lee en el mismo instante (map.redraw() / renderer.render(...) seguido de
 * toDataURL, sin ceder el hilo), y antes de capturar se cambia cada lienzo por un <img> con
 * esa foto. Al terminar se restaura todo.
 *
 * Registrados: el mapa de Ciudad Armada (ciudad-armada-mapa.tsx), el mini-mapa del Pizarrón
 * (mini-mapa.tsx) y la vista 3D del Modelador (escena.ts).
 */

/** Redibuja el lienzo y devuelve canvas.toDataURL("image/png"), o null si no puede. */
export type FotoLienzo = () => string | null;

const registrados = new Map<HTMLCanvasElement, FotoLienzo>();

/** Registra un canvas WebGL. Devuelve la función para desregistrarlo (llamarla en el cleanup). */
export function registrarLienzo(canvas: HTMLCanvasElement, foto: FotoLienzo): () => void {
  registrados.set(canvas, foto);
  return () => {
    if (registrados.get(canvas) === foto) registrados.delete(canvas);
  };
}

/** ¿Se ve algo de este lienzo en la ventana? Los ocultos o fuera de pantalla no hace falta tocarlos. */
function seVe(canvas: HTMLCanvasElement): boolean {
  if (!canvas.isConnected) return false;
  const r = canvas.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) return false;
  return getComputedStyle(canvas).visibility !== "hidden";
}

/**
 * Pone un <img> con la foto en el lugar de cada lienzo registrado y visible (mismas clases,
 * mismo estilo en línea y la medida exacta en píxeles), y oculta el canvas. Devuelve
 * «restaurar», que se puede llamar más de una vez. Nunca tira: un lienzo que no se deja
 * fotografiar queda como está (saldrá en blanco, pero el resto de la foto sale).
 */
export function congelarLienzos(): () => void {
  const deshacer: (() => void)[] = [];
  if (typeof document === "undefined") return () => {};

  for (const [canvas, foto] of registrados) {
    try {
      if (!seVe(canvas)) continue;
      const datos = foto();
      // "data:," es lo que devuelve toDataURL de un canvas de 0×0 o perdido.
      if (!datos || datos.length < 32 || !datos.startsWith("data:image/")) continue;
      const r = canvas.getBoundingClientRect();
      const img = document.createElement("img");
      img.src = datos;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.setAttribute("data-sistemas-foto-lienzo", "");
      img.className = canvas.className;
      img.style.cssText = canvas.style.cssText;
      img.style.width = `${r.width}px`;
      img.style.height = `${r.height}px`;
      img.style.maxWidth = "none";
      img.style.pointerEvents = "none";
      const displayAntes = canvas.style.display;
      canvas.insertAdjacentElement("afterend", img);
      canvas.style.display = "none";
      deshacer.push(() => {
        canvas.style.display = displayAntes;
        img.remove();
      });
    } catch {
      /* este lienzo sale en blanco; los demás siguen */
    }
  }

  let hecho = false;
  return () => {
    if (hecho) return;
    hecho = true;
    for (const d of deshacer) {
      try {
        d();
      } catch {
        /* nunca */
      }
    }
  };
}
