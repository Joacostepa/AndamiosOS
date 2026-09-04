"use client";

import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";
import { colorTipo } from "@/lib/tablero/colores";
import { tipoOtLabel } from "@/lib/tablero/tipos";

// Qué clase de trabajo es la OT: armado, desarme, ampliación, desmonte parcial.
//
// SALE DE x_tipo, no de partir el título. `partesTitulo` también devuelve un `tipo`, pero
// es una cadena parseada de un nombre que Odoo arma por su cuenta; el campo es el dato.
//
// LA PALABRA ES LA SEÑAL PRIMARIA y el color acompaña. En el tablero alcanza con azul
// armado / ámbar desarme porque ahí no hay otra cosa, pero entre las OTs activas hay
// cuatro tipos vivos —41 armados, 17 desarmes, 1 ampliación, 1 desmonte parcial— y los
// dos últimos comparten el gris neutro. Dos chips idénticos con distinto significado
// serían peor que no ponerlos; escritos no se confunden nunca. Es además la señal que
// sobrevive al daltonismo y al blanco y negro.

const ICONO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

export function ChipTipoOt({
  tipo,
  enColumna = false,
}: {
  tipo: string | null | undefined;
  /**
   * En listas, ancho FIJO para que los chips formen una columna: la pregunta de la
   * bandeja no es "de qué tipo es ésta" sino "cuáles de estas son desarmes", y eso se
   * contesta barriendo de arriba a abajo, no leyendo fila por fila. Suelto —en el
   * encabezado de una ficha— no hay nada con qué alinearse y el ancho sobra.
   */
  enColumna?: boolean;
}) {
  const color = colorTipo(tipo);
  const Icono = ICONO[color.icono];

  const chip = (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      <Icono className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{tipoOtLabel(tipo)}</span>
    </span>
  );

  return enColumna ? <span className="w-[124px] shrink-0">{chip}</span> : chip;
}
