// Las medidas de la estructura, leídas del texto de lo que está armado.
//
// PURO y con tests (medidas.test.ts). POR QUÉ DEL TEXTO: `x_permiso_altura` está en 0 en todas
// las ventas (12/10/2026), así que el único lugar donde están las medidas es lo que escribe
// Operaciones en `x_estructura_actual` o en la OT: "Pantalla 9m x 1,25m x 2,50m H a 90°",
// "Estructura de 45m. x 19 de alto". Lo que no se puede leer se estima por tipo de trabajo y
// se marca, para que la ficha diga "(estimado)" y el 3D no se tome como un relevamiento.

import type { Medidas, TipoTrabajo } from "./tipos.ts";

const TIPOS: readonly TipoTrabajo[] = [
  "pantalla_proteccion", "estructura_pantalla", "estructura_sin_pantalla", "torre", "plataforma", "sercha", "apuntalamiento_vertical",
];

/** Un número escrito a la argentina ("1,25") o no ("1.25"). */
const num = (s: string) => parseFloat(s.replace(",", "."));
const N = String.raw`(\d+(?:[.,]\d+)?)`;

/** Tope de cualquier medida: un texto mal leído no puede dibujar un rascacielos de andamio. */
const TOPE_M = 60;

/**
 * Las medidas y el tipo de trabajo.
 *
 *  · "A x B x C H" o "A x B x C alt": largo y ancho son el mayor y el menor de A y B (cada
 *    uno las escribe en otro orden), C es el alto.
 *  · "A x B de alto": largo y alto.
 *  · Si no, un alto suelto ("3m H", "12 mts de altura").
 *
 * El largo que falta sale de los metros lineales del permiso; si tampoco, 10 m. El alto que
 * falta, por tipo: 3 m una pantalla (la mayoría son de 2,5 a 4), 10 una torre, 8 el resto.
 * El ancho casi nunca se escribe y es estándar por tipo (1,25 la pantalla), así que tomarlo
 * por defecto no marca la obra como estimada: si lo hiciera, lo serían todas y el aviso no
 * diría nada.
 */
export function medidasDe(
  texto: string | null | undefined,
  venta: { tipo?: string | false | null; metrosLineales?: number | false | null } = {},
): { medidas: Medidas; tipo: TipoTrabajo | null } {
  const t = texto ?? "";
  let largo: number | null = null;
  let ancho: number | null = null;
  let alto: number | null = null;

  const tres = t.match(new RegExp(String.raw`${N}\s*m?\s*x\s*${N}\s*m?\s*x\s*${N}\s*m?\s*(?:H\b|alt)`, "i"));
  if (tres) {
    const a = num(tres[1]), b = num(tres[2]);
    largo = Math.max(a, b);
    ancho = Math.min(a, b);
    alto = num(tres[3]);
  } else {
    const dos = t.match(new RegExp(String.raw`${N}\s*m?\.?\s*x\s*${N}\s*(?:m\s*)?de alto`, "i"));
    if (dos) {
      largo = num(dos[1]);
      alto = num(dos[2]);
    }
  }
  if (alto == null) {
    const suelto = t.match(new RegExp(String.raw`${N}\s*m\s*H\b`, "i")) ?? t.match(new RegExp(String.raw`${N}\s*m(?:to|ts)?\.?\s*d?e?\s*altura`, "i"));
    if (suelto) alto = num(suelto[1]);
  }

  const deVenta = typeof venta.tipo === "string" && (TIPOS as readonly string[]).includes(venta.tipo) ? (venta.tipo as TipoTrabajo) : null;
  const tipo: TipoTrabajo | null = deVenta ?? (/pantalla/i.test(t) ? "pantalla_proteccion" : null);

  let estimadas = false;
  if (!largo) largo = typeof venta.metrosLineales === "number" && venta.metrosLineales > 0 ? venta.metrosLineales : null;
  if (!largo) {
    largo = 10;
    estimadas = true;
  }
  if (!alto) {
    alto = tipo === "pantalla_proteccion" ? 3 : tipo === "torre" ? 10 : 8;
    estimadas = true;
  }
  if (!ancho) ancho = tipo === "pantalla_proteccion" ? 1.25 : 1.1;

  return {
    medidas: { largo: Math.min(largo, TOPE_M), ancho: Math.min(ancho, TOPE_M), alto: Math.min(alto, TOPE_M), estimadas },
    tipo,
  };
}
