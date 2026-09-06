"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Inbox, Scissors } from "lucide-react";
import { CORAL } from "@/lib/tablero/colores";

// A dónde va el trabajo de las jornadas que se sacan del tablero.
//
// EL PROBLEMA: sacar una jornada significa dos cosas distintas y hasta ahora era el mismo
// clic. "Se reprograma" —la obra sigue necesitando ese día, se planifica más adelante— y
// "no hacía falta" —Comercial estimó ocho jornadas y son siete—. La app asumía siempre la
// primera, así que la obra volvía a la bandeja pidiendo un día que nadie iba a trabajar, y
// no había forma de sacarla de ahí salvo asignársela a alguien.
//
// La información falta EN EL MOMENTO DEL GESTO: ninguna cuenta río abajo puede distinguir
// los dos casos después. Por eso se pregunta acá y no se deduce.
//
// POR QUÉ NO CONTRADICE EL "DESHACER Y NO ¿ESTÁS SEGURO?" de volverABandeja: un confirm
// agrega fricción y no recoge nada —a la semana se clickea sin leer y el error pasa
// igual—. Esto no confirma nada: las dos respuestas hacen cosas distintas, así que leerlo
// es parte de decidir. Y por eso mismo el board sólo lo abre cuando la pregunta tiene las
// dos respuestas posibles: si sacar estas jornadas dejara la obra en menos de una, "no
// hacía falta" no es una opción —eso es cancelar la OT, que se hace en Odoo—.

export type PedidoDestino = {
  otId: number;
  titulo: string;
  /** Cuántas jornadas se están sacando. */
  cantidad: number;
  /** En cuántas jornadas queda la obra si la respuesta es "no hacía falta". */
  duracionNueva: number;
  /** Lo que hay que hacer en los dos casos: sacar las jornadas del tablero. */
  aplicar: () => void;
};

export function DialogoDestinoJornadas({
  pedido,
  guardando,
  onBandeja,
  onNoHaciaFalta,
  onCerrar,
}: {
  pedido: PedidoDestino | null;
  guardando: boolean;
  onBandeja: (p: PedidoDestino) => void;
  onNoHaciaFalta: (p: PedidoDestino) => void;
  onCerrar: () => void;
}) {
  if (!pedido) return null;
  const { cantidad, titulo, duracionNueva } = pedido;
  const plural = cantidad === 1 ? "" : "s";

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base leading-snug">
            {cantidad} jornada{plural} menos en el tablero
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{titulo}</p>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          ¿La obra sigue necesitando {cantidad === 1 ? "ese día" : "esos días"}?
        </p>

        <div className="space-y-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => onBandeja(pedido)}
            className="flex w-full items-start gap-3 rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50"
          >
            <Inbox className="mt-0.5 h-4 w-4 shrink-0" style={{ color: CORAL }} />
            <span>
              <span className="block text-sm font-medium">Sí, se reprograma</span>
              <span className="block text-xs text-muted-foreground">
                Vuelve{cantidad === 1 ? "" : "n"} a la bandeja como pendiente{plural} de
                planificar.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={guardando}
            onClick={() => onNoHaciaFalta(pedido)}
            className="flex w-full items-start gap-3 rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50"
          >
            <Scissors className="mt-0.5 h-4 w-4 shrink-0" style={{ color: CORAL }} />
            <span>
              <span className="block text-sm font-medium">No, la obra es más corta</span>
              <span className="block text-xs text-muted-foreground">
                La obra queda en {duracionNueva} jornada{duracionNueva === 1 ? "" : "s"} y no
                vuelve a la bandeja. El estimado de Comercial no se toca.
              </span>
            </span>
          </button>
        </div>

        <Button variant="outline" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
