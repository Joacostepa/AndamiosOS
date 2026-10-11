// Qué puede tocar el "Deshacer" (B2 de la revisión). Pura y sin dependencias: la usan
// servicio.ts y los tests.
//
// El Deshacer vuelve a escribir las filas que guardó `hd_historial.cambios`. Esa columna no
// puede ser una puerta para escribir CUALQUIER tabla con la sesión de quien toca Deshacer
// (antes, una fila de historial con `tabla: "user_profiles"` hacía que un admin se diera
// rol a otro sin saberlo). Por eso:
//   1. Sólo tablas del módulo (TABLAS_HD), y de Legajos sólo las dos columnas que la hoja
//      escribe (el celular y "puede estar a cargo"), y sólo como actualización.
//   2. Cada cambio tiene que ser coherente: el id del cambio es el de las filas, y una fila
//      de Legajos no se crea ni se borra.
//   3. Si cualquier cambio no pasa, no se deshace NADA.
// Además, en la base nadie puede insertar en hd_historial desde el navegador (sólo el
// servidor, con la service role): ver la migración.

export type FilaJson = Record<string, unknown>;
export type CambioHistorial = { tabla: string; id: string; antes: FilaJson | null; despues: FilaJson | null };

/** Las tablas del módulo que el Deshacer puede escribir (con la sesión: decide la RLS). */
export const TABLAS_HD = [
  "hd_hojas", "hd_integrantes", "hd_camiones_dia", "hd_viajes", "hd_pedidos", "hd_instrucciones", "hd_ausencias", "hd_links", "hd_lugares",
  // Contratistas (20261011000002): el alta y la edición, y cuántos van en cada hoja.
  "hd_contratistas", "hd_hoja_contratistas",
] as const;

/** Legajos: sólo estas columnas, sólo actualizar (lo escribe "Cargar celular" / "Puede estar a cargo"). */
export const COLUMNAS_LEGAJO: Record<string, readonly string[]> = {
  personal: ["telefono", "puede_estar_a_cargo"],
  pan_personas_externas: ["telefono", "puede_estar_a_cargo"],
};

/** Las entidades que anota el módulo (la fila de historial tiene que ser de una de éstas). */
export const ENTIDADES = [
  "hoja", "integrante", "viaje", "pedido", "ausencia", "instruccion", "camion", "link", "telegram", "lugar", "precarga", "persona", "contratista",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esFila = (x: unknown): x is FilaJson => !!x && typeof x === "object" && !Array.isArray(x);
const NO_SE_PUEDE = "Ese cambio no se puede deshacer desde acá.";

export const esTablaHd = (t: string): boolean => (TABLAS_HD as readonly string[]).includes(t);

/**
 * Valida la fila de historial y sus cambios. Tira (sin tocar nada) si algo no es del
 * módulo; si no, devuelve los cambios tipados.
 */
export function validarHistorial(h: { entidad?: unknown; cambios?: unknown }): CambioHistorial[] {
  if (typeof h.entidad !== "string" || !(ENTIDADES as readonly string[]).includes(h.entidad)) throw new Error(NO_SE_PUEDE);
  if (!Array.isArray(h.cambios) || !h.cambios.length) throw new Error("Ese cambio no se puede deshacer.");
  return h.cambios.map((c: unknown) => {
    if (!esFila(c)) throw new Error(NO_SE_PUEDE);
    const { tabla, id, antes, despues } = c as FilaJson;
    if (typeof tabla !== "string" || typeof id !== "string" || !UUID.test(id)) throw new Error(NO_SE_PUEDE);
    if (antes != null && !esFila(antes)) throw new Error(NO_SE_PUEDE);
    if (despues != null && !esFila(despues)) throw new Error(NO_SE_PUEDE);
    if (antes == null && despues == null) throw new Error(NO_SE_PUEDE);
    for (const f of [antes, despues]) if (f && String((f as FilaJson).id) !== id) throw new Error(NO_SE_PUEDE);
    if (esTablaHd(tabla)) return { tabla, id, antes: (antes as FilaJson) ?? null, despues: (despues as FilaJson) ?? null };
    const cols = COLUMNAS_LEGAJO[tabla];
    if (!cols || !antes || !despues) throw new Error(NO_SE_PUEDE);
    // Lo que cambió en esa fila tiene que estar dentro de las columnas permitidas.
    const claves = new Set([...Object.keys(antes as FilaJson), ...Object.keys(despues as FilaJson)]);
    for (const k of claves) {
      if (k === "updated_at") continue;
      if (JSON.stringify((antes as FilaJson)[k]) !== JSON.stringify((despues as FilaJson)[k]) && !cols.includes(k)) throw new Error(NO_SE_PUEDE);
    }
    return { tabla, id, antes: antes as FilaJson, despues: despues as FilaJson };
  });
}

/** Una escritura atómica (la aplica la función SQL hd_aplicar). `esperado`: la fila tiene que estar así (null = no existir). */
export type OpHd =
  | { op: "insertar"; tabla: string; id: string; valores: FilaJson; esperado?: FilaJson | null }
  | { op: "actualizar"; tabla: string; id: string; valores: FilaJson; esperado?: FilaJson | null }
  | { op: "borrar"; tabla: string; id: string; esperado?: FilaJson | null };

/** Las columnas de una fila sin las marcas que pone la base. */
export function sinMarcas(f: FilaJson | null): string | null {
  if (!f) return null;
  const { updated_at: _u, ...resto } = f;
  void _u;
  return JSON.stringify(Object.keys(resto).sort().map((k) => [k, resto[k]]));
}

/**
 * Las escrituras que vuelven las filas de las tablas del módulo a como estaban, en orden
 * inverso (lo último que se tocó vuelve primero: un integrante antes que su hoja). Cada
 * una exige que la fila siga como quedó (`esperado` = el "después"); las que ya están como
 * "antes" se saltean. `actuales` es cómo están ahora (por tabla:id); si alguna cambió de
 * otra forma, tira: deshacer encima de un cambio ajeno lo pisaría.
 */
export function planDeshacer(cambios: CambioHistorial[], actualesIn: Map<string, FilaJson | null>): OpHd[] {
  const ops: OpHd[] = [];
  // Una fila tocada dos veces por el mismo gesto: después de deshacer la segunda, queda
  // como "antes" de la segunda (= "después" de la primera).
  const actuales = new Map(actualesIn);
  for (const c of [...cambios].reverse()) {
    if (!esTablaHd(c.tabla)) continue;
    const k = `${c.tabla}:${c.id}`;
    const ahora = actuales.get(k) ?? null;
    actuales.set(k, c.antes);
    if (sinMarcas(ahora) === sinMarcas(c.antes)) continue;
    if (sinMarcas(ahora) !== sinMarcas(c.despues)) throw new Error("No se puede deshacer: eso cambió después. Hacelo a mano.");
    if (c.antes == null) ops.push({ op: "borrar", tabla: c.tabla, id: c.id, esperado: c.despues });
    else if (ahora == null) ops.push({ op: "insertar", tabla: c.tabla, id: c.id, valores: c.antes, esperado: null });
    else ops.push({ op: "actualizar", tabla: c.tabla, id: c.id, valores: c.antes, esperado: c.despues });
  }
  return ops;
}
