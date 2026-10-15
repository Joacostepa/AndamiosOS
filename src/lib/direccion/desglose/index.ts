// Registro de nodos de desglose. Cada área agrega los suyos en SU archivo (caja.ts, …);
// este índice ya los importa a todos y no hace falta tocarlo.
//
// Un `tipo` repetido entre áreas es un error de programación: se avisa al cargar (y lo
// verifica desglose.test.ts).

import type { DefNodo } from "./contrato.ts";
import { nodos as comun } from "./comun.ts";
import { nodos as semana } from "./semana.ts";
import { nodos as caja } from "./caja.ts";
import { nodos as ventas } from "./ventas.ts";
import { nodos as cobranzas } from "./cobranzas.ts";
import { nodos as calle } from "./calle.ts";
import { nodos as socios } from "./socios.ts";
import { nodos as datos } from "./datos.ts";

export function armarRegistro(listas: DefNodo[][]): Record<string, DefNodo> {
  const reg: Record<string, DefNodo> = {};
  for (const n of listas.flat()) {
    if (reg[n.tipo]) throw new Error(`Dirección: el nodo de desglose "${n.tipo}" está registrado dos veces.`);
    // Todo lo de la pantalla Socios es reservado aunque el nodo se olvide de decirlo.
    reg[n.tipo] = n.pantalla === "socios" ? { ...n, reservado: true } : n;
  }
  return reg;
}

export const NODOS: Readonly<Record<string, DefNodo>> = armarRegistro([comun, semana, caja, ventas, cobranzas, calle, socios, datos]);
