"use client";

import { useState } from "react";
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
  error = false,
  onReintentar,
  observaciones,
  tipo,
  clasificacion,
}: {
  texto?: string | null;
  /** Fecha en que Operaciones confirmó la estructura en obra. */
  confirmadoEl?: string | null;
  cargando?: boolean;
  /** La ficha no se pudo leer: sin esto el esqueleto quedaba para siempre. */
  error?: boolean;
  onReintentar?: () => void;
  /**
   * Las observaciones que Comercial carga en la OT: accesos, horarios, restricciones del
   * cliente. Van ACÁ ADENTRO y no en una fila al pie de la ficha, que es donde estaban:
   * suelen decir cosas que cambian cómo se hace el trabajo ("entrar por el portón de
   * atrás", "no antes de las 9"), así que se leen junto con qué hay que hacer.
   */
  observaciones?: string | null;
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
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Hammer className="h-3.5 w-3.5" />
          Qué hay que ejecutar
        </p>
        {tipo !== undefined && <ChipTipoOt tipo={tipo} />}
        {clasificacion && (
          <span className="text-xs text-muted-foreground">{clasificacion}</span>
        )}
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">
          No se pudo leer la ficha de la OT.{" "}
          {onReintentar && (
            <button type="button" className="underline hover:text-foreground" onClick={onReintentar}>
              Reintentar
            </button>
          )}
        </p>
      ) : cargando ? (
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
      {observaciones?.trim() && <Observaciones texto={observaciones.trim()} />}
    </div>
  );
}

/** Tres renglones y "ver más": son de largo libre y no pueden empujar todo lo demás. */
function Observaciones({ texto }: { texto: string }) {
  const [entera, setEntera] = useState(false);
  const larga = texto.length > 180 || texto.split("\n").length > 3;
  return (
    <div className="mt-2.5 border-t border-foreground/10 pt-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Observaciones de comercial</p>
      <p className={`mt-0.5 whitespace-pre-wrap text-sm leading-snug ${entera ? "" : "line-clamp-3"}`}>{texto}</p>
      {larga && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => setEntera((v) => !v)}
        >
          {entera ? "ver menos" : "ver más"}
        </button>
      )}
    </div>
  );
}
