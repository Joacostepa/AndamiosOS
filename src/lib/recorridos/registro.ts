// Registro de los recorridos obligatorios: cuáles hay, a quién le tocan y cuál le falta a
// cada uno. Puro (sin Supabase ni DOM): lo usan el layout del dashboard y el cliente.
//
// La marca de «ya lo hizo» vive en `recorridos_vistos` (20261022000003): por usuario, clave y
// versión. Subir la versión de un recorrido lo vuelve a mostrar a todos sin borrar nada.

import type { Acceso } from "../auth/acceso.ts";
import { RECORRIDO, describirDispositivo, esCuentaTecnica } from "../sistemas/tipos.ts";
import { decidirRecorrido } from "./reglas.ts";

export type Recorrido = {
  /** La de `recorridos_vistos.clave` (minúsculas, números y guiones). */
  clave: string;
  version: number;
  /** Para listarlo (Novedades del sistema, etapa 2). No se muestra en el recorrido. */
  titulo: string;
  /** Hoy todos lo son: no se puede cerrar ni saltear hasta «Entendido». */
  obligatorio: boolean;
  /**
   * También a los usuarios que se den de alta después de publicarlo. Con `false` habría que
   * comparar contra la fecha de alta, que hoy no baja en `Acceso`: queda para las Novedades.
   */
  paraNuevos: boolean;
  /** A quién le toca, además de las exclusiones generales de `decidirRecorrido`. */
  para: (acceso: Acceso) => boolean;
  /** Cuántos pasos tiene (sin la bienvenida). Se guarda en `pasos_total`. */
  pasos: number;
};

/** Lo que baja del layout al cliente: plano y serializable (sin la función `para`). */
export type RecorridoPendiente = { clave: string; version: number; pasos: number };

/** Una fila de `recorridos_vistos`, ya filtrada a la persona. */
export type RecorridoVisto = { clave: string; version: number };

export const RECORRIDOS: readonly Recorrido[] = [
  {
    clave: RECORRIDO.clave,
    version: RECORRIDO.version,
    titulo: "Reportar algo a Sistemas",
    obligatorio: true,
    paraNuevos: true,
    // Cualquiera con sesión puede reportar, así que le toca a todos menos a la cuenta técnica
    // (ya la deja afuera decidirRecorrido; se repite acá para que la regla se lea sola).
    para: (acceso) => !esCuentaTecnica(acceso),
    pasos: RECORRIDO.pasos,
  },
];

/**
 * El primer recorrido obligatorio que le falta, o null.
 *
 * - `vistos = null` quiere decir que no se pudo leer la tabla (no existe todavía, falló la
 *   consulta): NO se muestra nada. Un recorrido obligatorio que no puede guardar que se hizo
 *   saldría en cada carga; mejor que no salga hasta que la tabla ande.
 * - Con `ruta`, además respeta las pantallas que postergan (`RUTAS_SIN_RECORRIDO`). El layout
 *   no la conoce y la omite: la posterga el cliente con `usePathname()`.
 */
export function recorridoPendiente(
  acceso: Acceso | null,
  vistos: readonly RecorridoVisto[] | null,
  ruta?: string | null,
  registro: readonly Recorrido[] = RECORRIDOS,
): RecorridoPendiente | null {
  if (!acceso || vistos === null) return null;
  // Sin ruta se evalúa como una pantalla cualquiera del dashboard: sólo cuentan los «nunca».
  const decision = decidirRecorrido({ pathname: ruta ?? "/", acceso });
  if (decision !== "mostrar") return null;
  const hecho = new Set(vistos.map((v) => `${v.clave}@${v.version}`));
  const r = registro.find((x) => x.obligatorio && x.para(acceso) && !hecho.has(`${x.clave}@${x.version}`));
  return r ? { clave: r.clave, version: r.version, pasos: r.pasos } : null;
}

/**
 * Lo que va en `recorridos_vistos.dispositivo`: «celular» o «compu» y el navegador, para saber
 * dónde lo hicieron. Táctil y angosto = celular (una tablet apaisada cuenta como compu).
 */
export function dispositivoRecorrido(userAgent: string, ancho: number, alto: number, tactil: boolean): string {
  const tipo = tactil && Math.min(ancho, alto) < 768 ? "celular" : "compu";
  return `${tipo} · ${describirDispositivo(userAgent, ancho, alto)}`.slice(0, 200);
}
