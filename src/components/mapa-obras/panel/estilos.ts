// Clases compartidas de los paneles de Ciudad Armada.
//
// Los paneles flotan sobre el mapa en VIDRIO OSCURO, de día y de noche, como en la maqueta
// aprobada: sobre un mapa claro un panel claro se pierde, uno oscuro se lee. Para que los
// componentes ui (Input, Button) tomen los tokens oscuros, el contenedor de los paneles
// lleva la clase `dark` (ver la página).

export const vidrio =
  "rounded-xl border border-white/10 bg-[oklch(0.16_0.008_240/0.88)] text-foreground shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md";

/** Rótulo en versalitas: "PARA DECIDIR", "FOTOS DE LOS PARTES". */
export const rotulo = "text-[11px] font-semibold uppercase leading-tight tracking-[0.09em] text-muted-foreground";

export const foco =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Botón de la barra (Día, 2D, General, Modo TV) y acciones de la ficha. */
export const botonVidrio =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-[oklch(0.16_0.008_240/0.88)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground backdrop-blur-md transition-colors hover:border-white/30 aria-pressed:border-primary aria-pressed:text-primary " +
  foco;

export const accion =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground no-underline transition-colors hover:border-white/35 " +
  foco;

export const accionPrincipal =
  "inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground no-underline transition-colors hover:bg-primary/85 " +
  foco;

/** Etiqueta chica dentro de una fila: "3 fotos", "sin ubicación". */
export const tag = "ml-1 inline-block rounded border border-white/12 px-1 py-px align-[1px] font-mono text-[10px] leading-none text-muted-foreground";
export const tagAviso = "ml-1 inline-block rounded border border-amber-400/40 px-1 py-px align-[1px] font-mono text-[10px] leading-none text-amber-300";
