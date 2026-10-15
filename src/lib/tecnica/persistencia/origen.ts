/**
 * Origen de una fila de computo_items cuando alguien guarda el cómputo A MANO (useSaveComputoItems).
 * Módulo aparte y sin dependencias para que la pantalla de cómputos no cargue el núcleo del modelador.
 *
 * - fila nueva → 'manual'
 * - fila del modelo cuya cantidad cambió → 'modelo_editado' (y si vuelve a lo del modelo, otra vez 'modelo')
 * - 'manual' sigue 'manual'. Siempre se conserva modelo_cantidad (lo que dijo el modelo, para el diff).
 */
import type { OrigenItem } from './tipos.ts';

export function origenAlGuardar(
  previo: { origen: OrigenItem; modelo_cantidad: number | null } | undefined,
  cantidadNueva: number,
): { origen: OrigenItem; modelo_cantidad: number | null } {
  if (!previo) return { origen: 'manual', modelo_cantidad: null };
  if (previo.origen === 'manual') return { origen: 'manual', modelo_cantidad: previo.modelo_cantidad };
  if (previo.modelo_cantidad !== null && cantidadNueva === previo.modelo_cantidad) return { origen: 'modelo', modelo_cantidad: previo.modelo_cantidad };
  return { origen: 'modelo_editado', modelo_cantidad: previo.modelo_cantidad };
}
