// Qué comentarios ya miró quien está sentado acá.
//
// PARA QUÉ: el globito de la tarjeta late mientras hay algo sin leer y se apaga al abrir
// el panel. Sin esta marca la única alternativa era que latiera por antigüedad —"el
// último es de hoy"—, y eso sigue latiendo después de que lo leíste: en dos días se
// vuelve papel pintado y el día que sí importa tampoco se mira.
//
// EN localStorage Y NO EN LA BASE, a propósito. "Ya lo vi" es de la persona y del momento,
// no de la obra: no lo lee nadie más, no se audita, no se reconcilia con Odoo y no tiene
// sentido conservarlo si alguien reinstala. Una tabla nueva con una escritura por cada
// panel que se abre es mucha maquinaria para una preferencia de visualización.
//
// LO QUE SE PIERDE, y hay que saberlo: es POR DISPOSITIVO. Si mirás el tablero en la
// compu y después en la tablet, en la tablet vuelve a latir. Para un equipo de siete
// personas que trabajan siempre en la misma máquina el costo es chico, y la falla es
// benigna: mostrar de más un aviso que ya viste, nunca esconder uno que no.
//
// Todo va envuelto en try/catch: en una ventana privada o con las cookies bloqueadas,
// `localStorage` no falla al leer — TIRA. Y el tablero no se puede caer por esto.

const CLAVE = "aba:tablero:comentarios-vistos";

/** otId → fecha ISO del comentario más nuevo que esa persona ya tuvo delante. */
export type Vistos = Record<number, string>;

export function leerVistos(): Vistos {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return {};
    const datos = JSON.parse(crudo) as unknown;
    // Un JSON de otra versión —o pisado a mano— no puede romper el tablero: si no es un
    // objeto plano se descarta y se empieza de cero, que es el peor caso tolerable.
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return {};
    return datos as Vistos;
  } catch {
    return {};
  }
}

/**
 * Marca que esa OT se miró hasta ese comentario. Devuelve el mapa nuevo para que quien
 * llame actualice su estado — no hay evento de storage dentro de la misma pestaña.
 *
 * NUNCA RETROCEDE: si lo guardado ya es más nuevo que lo que se pasa, se deja como está.
 * Pasa al abrir un panel con el resumen del tablero desactualizado, y retroceder haría
 * que un comentario ya leído volviera a latir.
 */
export function marcarVisto(vistos: Vistos, otId: number, hasta: string): Vistos {
  if ((vistos[otId] ?? "") >= hasta) return vistos;
  const nuevo = { ...vistos, [otId]: hasta };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(nuevo));
  } catch {
    // Sin espacio o sin permiso: se pierde la marca y el globito sigue latiendo. Molesta,
    // no rompe.
  }
  return nuevo;
}

/** ¿Hay algo escrito en esta OT que esta persona todavía no tuvo delante? */
export function haySinLeer(vistos: Vistos, otId: number, ultimo: string): boolean {
  return (vistos[otId] ?? "") < ultimo;
}
