// A quién y dónde le sale un recorrido obligatorio. Funciones puras: las usan el layout del
// dashboard (servidor) y el componente que lo corre (cliente), y tienen tests.

import type { Acceso } from "../auth/acceso.ts";
import { esCuentaTecnica } from "../sistemas/tipos.ts";

/**
 * Pantallas donde el recorrido ESPERA: arranca cuando la persona navega a otra.
 *
 * - `/p/…`: la ficha pública de un parte, que se abre desde un QR en la obra.
 * - `/fichadas/escanear`: la cámara del lector de fichadas. Un recorrido encima tapa el visor.
 * - `/organigrama/imprimir`: se abre para imprimir; el recorrido saldría en el papel.
 *
 * Se comparan por prefijo con borde de segmento (`/p` abre `/p/123` pero no `/partes`).
 */
export const RUTAS_SIN_RECORRIDO = ["/p", "/fichadas/escanear", "/organigrama/imprimir"] as const;

/**
 * Donde no corre NUNCA aunque el componente estuviera montado. Hoy están fuera del dashboard
 * (no tienen su layout), así que es un seguro por si alguna se muda adentro: en
 * `/cambiar-clave` la persona tiene que hacer otra cosa primero.
 */
export const RUTAS_FUERA_DE_RECORRIDO = ["/cambiar-clave", "/kiosco", "/h"] as const;

function empiezaCon(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/**
 * - `"nunca"`: sin acceso, usuario inactivo, con la clave por cambiar, o la cuenta técnica del
 *   pañol (`esCuentaTecnica`: no es admin y su único permiso es el kiosco). Tampoco fuera del
 *   dashboard.
 * - `"postergar"`: en una de `RUTAS_SIN_RECORRIDO`. Se vuelve a evaluar al cambiar de pantalla.
 * - `"mostrar"`: el resto.
 *
 * No sabe si ya lo vio: eso lo decide `recorridoPendiente` (registro.ts) con la tabla.
 */
export function decidirRecorrido(a: { pathname: string; acceso: Acceso | null }): "mostrar" | "postergar" | "nunca" {
  const { acceso } = a;
  if (!acceso || !acceso.activo || acceso.debeCambiarClave) return "nunca";
  if (esCuentaTecnica(acceso)) return "nunca";
  const pathname = a.pathname || "/";
  if (RUTAS_FUERA_DE_RECORRIDO.some((r) => empiezaCon(pathname, r))) return "nunca";
  if (RUTAS_SIN_RECORRIDO.some((r) => empiezaCon(pathname, r))) return "postergar";
  return "mostrar";
}
