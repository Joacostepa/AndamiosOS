"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CORAL } from "@/lib/tablero/colores";

/**
 * QUÉ QUEDÓ EFECTIVAMENTE ARMADO. Se pregunta una sola vez: al cerrar la OT.
 *
 * EL PROBLEMA QUE RESUELVE: el armado real casi nunca es idéntico al vendido —cambian
 * alturas, metros, sectores— y esa diferencia hoy muere en la cabeza del capataz. Meses
 * después, cuando el cliente llama para desarmar, Comercial emite la OT describiendo lo
 * VENDIDO y la cuadrilla llega a bajar algo que no coincide con el papel.
 *
 * POR QUÉ VIENE PRECARGADO Y NO VACÍO: esto se carga desde la obra, muchas veces en un
 * celular. Un textarea vacío y obligatorio se llena con "ok" y el dato queda peor que si
 * no existiera. Precargado con lo previsto, el caso normal —que coincida— es un clic, y
 * escribir queda reservado para cuando de verdad hubo una diferencia.
 *
 * Sólo aparece para los trabajos que dejan estructura en pie: armado, ampliación y
 * desmonte parcial. El desarme y el mantenimiento no cambian lo que hay.
 */

export function ComoQuedoArmado({
  previsto,
  coincide,
  texto,
  onCoincide,
  onTexto,
  compacto = false,
}: {
  /** El detalle técnico de la OT: lo que se suponía que había que armar. */
  previsto: string | null;
  /** null = todavía no contestó. */
  coincide: boolean | null;
  texto: string;
  onCoincide: (v: boolean) => void;
  onTexto: (v: string) => void;
  /** La fila de /partes es mucho más angosta que el diálogo del tablero. */
  compacto?: boolean;
}) {
  const chico = compacto ? "text-[11px]" : "text-xs";

  return (
    <div className="space-y-2 border-t pt-2.5">
      <p className={compacto ? "text-[12px] font-medium" : "text-sm font-medium"}>
        ¿Quedó como estaba previsto?
      </p>
      {previsto ? (
        <p className={`whitespace-pre-wrap rounded-md bg-muted/60 p-2 ${chico} text-muted-foreground`}>
          {previsto}
        </p>
      ) : (
        <p className={`${chico} text-muted-foreground`}>
          La OT no traía detalle técnico: escribí vos qué quedó armado.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={coincide === true ? "default" : "outline"}
          style={coincide === true ? { backgroundColor: CORAL, color: "#fff" } : undefined}
          onClick={() => onCoincide(true)}
          disabled={!previsto}
        >
          Igual a lo previsto
        </Button>
        <Button
          type="button"
          size="sm"
          variant={coincide === false ? "default" : "outline"}
          style={coincide === false ? { backgroundColor: CORAL, color: "#fff" } : undefined}
          onClick={() => onCoincide(false)}
        >
          Hubo diferencias
        </Button>
      </div>

      {coincide === false && (
        <div className="space-y-1">
          <Textarea
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            rows={compacto ? 3 : 4}
            placeholder="Qué quedó armado en realidad. Ej: se armaron 11,5 m.l. en vez de 9, y la altura real es 3,40 m."
          />
          <p className={`${chico} text-muted-foreground`}>
            Esto es lo que va a leer Comercial para emitir el desarme.
          </p>
        </div>
      )}
    </div>
  );
}
