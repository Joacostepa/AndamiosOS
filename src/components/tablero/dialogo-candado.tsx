"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useRegistrarCandado } from "@/hooks/use-habilitaciones";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AVISO, CANDADO } from "@/lib/tablero/colores";
import type { Friccion } from "@/lib/habilitaciones/derivacion";

// El candado al CONFIRMAR una jornada.
//
// LLEGAN CUATRO DE LAS CINCO. Las de la ventana del cliente —antes del piso, después del
// techo— y dos de permiso: `bloqueo` y `falta_expediente`.
//
// LA QUE NO LLEGA es `pedir_modalidad`, y vale la pena saber por qué. El candado entero se
// apagó el 3/9 porque esa fricción saltaba en el 98,9% de las obras: la modalidad de
// permiso sólo se podía cargar desde la ficha de habilitaciones, o sea después de cerrada
// la venta y en una pantalla donde Comercial no entra. Desde el 5/9 se pregunta en la
// orden de venta y es obligatoria para confirmarla, así que el resto del candado volvió —
// pero ésa ya no tiene sentido acá: se resuelve antes, donde está quien sabe la respuesta.
// La rama queda escrita porque el diálogo es genérico (ver friccionDelTablero).
//
// POR QUÉ ACÁ Y NO AL PLANIFICAR: planificar es un borrador, y poner una obra tentativa
// para la semana que viene sabiendo que el permiso sale en tres días es legítimo.
// Bloquear ahí frena a Operaciones por un dato que depende de terceros, y la reacción va
// a ser buscarle la vuelta — marcar mal la modalidad, planificar en otro lado. Un
// candado que estorba se rompe.
//
// Confirmar ya significa algo preciso en el sistema (ver cierre.ts): es el momento en
// que la fecha se le promete al cliente y la cuadrilla queda tomada. Ahí sí corresponde
// preguntar si el permiso está.
//
// CARGAR EL PARTE NUNCA SE BLOQUEA y no pasa por acá. Si la cuadrilla fue igual, se
// registra igual: un sistema que no deja anotar lo que pasó garantiza datos falsos.

/**
 * NO SE PUDO COMPROBAR EL PERMISO (guardias-contrato.md §3, plan técnico §7.3): la consulta
 * del candado dio error, o todavía no terminó para esta OT.
 *
 * ANTES ESTO CONFIRMABA SIN FRICCIÓN, y era el agujero que encontró la auditoría del 08/10:
 * Depósito y Campo no tienen el módulo de habilitaciones, la consulta les daba 403 y el
 * tablero lo leía como "no hay nada que frenar". Un candado que se abre cuando falla no es
 * un candado. Ahora falla con AVISO: se puede confirmar igual —el permiso puede estar, y
 * frenar la operación por un error de red sería peor—, pero con un motivo escrito que queda
 * registrado como excepción, igual que confirmar sin el permiso. Y se ofrece volver a
 * comprobar, que es lo que casi siempre resuelve.
 *
 * Vive acá y no en derivacion.ts (que es el candado de habilitaciones) porque no es una
 * fricción del permiso sino de la consulta: no la calcula nadie, la pone el tablero.
 */
export type FriccionSinComprobar = {
  tipo: "sin_comprobar";
  motivo: string;
  /** true = la consulta dio error; false = todavía no terminó para esta OT. */
  error: boolean;
};

export type PedidoConfirmacion = {
  otId: number;
  friccion: NonNullable<Friccion> | FriccionSinComprobar;
  pedidosPrevios: number;
  /** Se ejecuta cuando el usuario decide seguir adelante. */
  confirmar: () => void;
  /** Sólo con `sin_comprobar`: vuelve a pedir el candado. */
  reintentar?: () => void;
};

export function DialogoCandado({
  pedido,
  onCerrar,
}: {
  pedido: PedidoConfirmacion | null;
  onCerrar: () => void;
}) {
  const registrar = useRegistrarCandado();
  const [motivo, setMotivo] = useState("");

  if (!pedido) return null;

  // Se desestructura a locales porque `seguir()` es una función anidada y el
  // estrechamiento del `if (!pedido)` no la alcanza.
  const { friccion, otId, pedidosPrevios, confirmar, reintentar } = pedido;
  const sinComprobar = friccion.tipo === "sin_comprobar";
  const necesitaMotivo =
    sinComprobar ||
    friccion.tipo === "bloqueo" ||
    friccion.tipo === "falta_expediente" ||
    friccion.tipo === "antes_de_piso" ||
    friccion.tipo === "despues_de_techo";

  function cerrar() {
    setMotivo("");
    onCerrar();
  }

  function seguir() {
    if (necesitaMotivo && !motivo.trim()) {
      toast.error("Escribí el motivo para poder confirmar");
      return;
    }

    registrar.mutate(
      {
        otId,
        // Sin modalidad definida se registra el PEDIDO al técnico, no una excepción:
        // no hicimos nada mal, falta que alguien conteste.
        tipo: friccion.tipo === "pedir_modalidad" ? "consulta" : "excepcion",
        // La excepción por no haber podido comprobar se distingue en el texto: en el
        // historial de la habilitación tiene que leerse distinto de "confirmé sin permiso".
        motivo: !necesitaMotivo
          ? null
          : sinComprobar
            ? `Sin poder comprobar el permiso: ${motivo.trim()}`
            : motivo.trim(),
      },
      {
        onSuccess: (r) => {
          confirmar();
          if (friccion.tipo === "pedir_modalidad") {
            toast.success(
              r.registrada
                ? `Confirmada · ${r.pedido}º pedido de modalidad registrado`
                : "Confirmada · ya había un pedido reciente, no se duplicó",
            );
          } else if (sinComprobar) {
            toast.success("Confirmada · quedó registrado que no se pudo comprobar el permiso");
          } else {
            toast.success("Confirmada · la excepción quedó registrada");
          }
          cerrar();
        },
        // FALLA CERRADO: si no queda registrado el motivo, no se confirma. Confirmar sin
        // registro sería volver al agujero de antes por otro camino.
        onError: (e) =>
          toast.error("No se confirmó: no se pudo registrar el motivo", {
            description: e instanceof Error ? e.message : String(e),
          }),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sinComprobar ? (
              <TriangleAlert className="h-4 w-4" style={{ color: AVISO.icono }} />
            ) : friccion.tipo === "bloqueo" ? (
              <Lock className="h-4 w-4" style={{ color: CANDADO }} />
            ) : friccion.tipo === "antes_de_piso" || friccion.tipo === "despues_de_techo" ? (
              <CalendarClock className="h-4 w-4" style={{ color: AVISO.icono }} />
            ) : (
              <TriangleAlert className="h-4 w-4" style={{ color: AVISO.icono }} />
            )}
            {sinComprobar
              ? "No pude comprobar el permiso municipal"
              : friccion.tipo === "bloqueo"
              ? "No se puede confirmar sin el permiso"
              : friccion.tipo === "pedir_modalidad"
                ? "Falta la modalidad de permiso"
                : friccion.tipo === "antes_de_piso"
                  ? "La obra no entra todavía"
                  : friccion.tipo === "despues_de_techo"
                    ? "La obra termina después de la fecha límite"
                    : "Falta el número de expediente"}
          </DialogTitle>
          <DialogDescription>{friccion.motivo}</DialogDescription>
        </DialogHeader>

        {friccion.tipo === "pedir_modalidad" && (
          <div
            className="space-y-2 rounded-md border px-3 py-2.5 text-[13px]"
            style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }}
          >
            <p>
              Esta obra no tiene modalidad de permiso definida
              {friccion.dias !== null ? ` hace ${friccion.dias} días` : ""}.
            </p>
            <p>
              Confirmar deja registrado el pedido a{" "}
              <strong>{friccion.tecnico ?? "el técnico de la obra"}</strong>; Agustina lo ve en
              su bandeja.
              {pedidosPrevios > 0 && ` Ya hay ${pedidosPrevios} ${pedidosPrevios === 1 ? "pedido" : "pedidos"}.`}
            </p>
            {/* No se pide texto: quien confirma es Operaciones y Operaciones NO PUEDE
                definir la modalidad —sólo el técnico—. Pedirle un motivo por algo que no
                está en su mano lo entrena a escribir "no sé" o un punto. */}
            <p className="text-[11px] text-muted-foreground">
              No se manda ningún mail: se registra la fecha del pedido.
            </p>
          </div>
        )}

        {necesitaMotivo && (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              {sinComprobar
                ? "Se puede confirmar igual, pero queda registrado con tu nombre que no se pudo comprobar. Si el cliente pidió esperar el permiso, la cuadrilla podría no poder trabajar."
                : friccion.tipo === "bloqueo"
                ? "Se puede confirmar igual, pero la excepción queda registrada con tu nombre y la fecha."
                : friccion.tipo === "antes_de_piso"
                  ? `La dejaste el ${friccion.fecha} y el cliente la recibe a partir del ${friccion.piso}. Se puede confirmar igual —a veces se reacuerda por teléfono— pero decí por qué, porque si no la cuadrilla viaja y vuelve.`
                  : friccion.tipo === "despues_de_techo"
                    // El día que se muestra es el ÚLTIMO de la obra, no el de esta jornada:
                    // el cliente pidió el trabajo terminado, no empezado.
                    ? `Con el plan de hoy la obra termina el ${friccion.fecha} y el cliente la pidió antes del ${friccion.techo}. Se puede confirmar igual —a veces se reacuerda— pero decí por qué, porque es una condición que le pusieron a la obra.`
                    : "El número de expediente lo tenemos nosotros. Si confirmás sin él, decí por qué."}
            </p>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo — queda en el historial de la habilitación"
              className="min-h-20 text-[13px]"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          {sinComprobar && reintentar && (
            <Button
              variant="outline"
              onClick={() => {
                reintentar();
                cerrar();
                toast.info("Comprobando el permiso de nuevo", {
                  description: "Confirmá otra vez en unos segundos.",
                });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Volver a comprobar
            </Button>
          )}
          <Button onClick={seguir} disabled={registrar.isPending}>
            {registrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {friccion.tipo === "pedir_modalidad"
              ? "Confirmar y registrar el pedido"
              : "Confirmar de todas formas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
