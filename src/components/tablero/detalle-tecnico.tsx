"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Hammer } from "lucide-react";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { Skeleton } from "@/components/ui/skeleton";
import { CORAL } from "@/lib/tablero/colores";

/**
 * Qué estructura hay que montar o bajar.
 *
 * Lo carga Comercial en la OT de Odoo, precargado con el párrafo técnico de la propuesta
 * de la venta (cubre 517 de las 632 obras confirmadas; el resto cae a las líneas de la
 * orden). Sin esto la cuadrilla salía sabiendo la dirección y nada más.
 *
 * UN SOLO COMPONENTE para el panel del tablero y la ficha de Habilitaciones: las dos
 * oficinas miran la misma obra y tienen que leer el mismo texto con la misma forma, o
 * terminan hablando de dos cosas.
 */
export function DetalleTecnico({
  texto,
  confirmadoEl,
  cargando = false,
  tipo,
  clasificacion,
}: {
  texto?: string | null;
  /** Fecha en que Operaciones confirmó la estructura en obra. */
  confirmadoEl?: string | null;
  cargando?: boolean;
  /**
   * x_tipo de la OT. En el panel del tablero ya va como badge arriba y no se pasa; en la
   * ficha de Habilitaciones va acá, porque qué papeles pedir depende de si se arma o se
   * desarma, y esa pregunta se hace leyendo esta caja.
   */
  tipo?: string | null;
  /** La clasificación que Comercial carga en la venta ("Fachada", "Torre"…). */
  clasificacion?: string | null;
}) {
  return (
    <div className="space-y-1.5 rounded-md border-l-4 bg-muted/40 px-3 py-2.5" style={{ borderLeftColor: CORAL }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Hammer className="h-3.5 w-3.5" />
          Qué hay que ejecutar
        </p>
        {tipo !== undefined && <ChipTipoOt tipo={tipo} />}
        {clasificacion && (
          <span className="text-[11px] text-muted-foreground">{clasificacion}</span>
        )}
      </div>
      {cargando ? (
        <Skeleton className="h-4 w-3/4" />
      ) : texto ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-snug">{texto}</p>
          {/* Cambia cómo hay que leer el texto de arriba: con fecha, no es lo que se
              vendió sino lo que se armó de verdad, verificado por alguien que estuvo. */}
          {confirmadoEl && (
            <p className="text-xs text-muted-foreground">
              Estructura confirmada en obra el{" "}
              {format(parseISO(confirmadoEl), "d MMM yyyy", { locale: es })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin detalle técnico cargado. Pedíselo a Comercial antes de mandar la cuadrilla.
        </p>
      )}
    </div>
  );
}
