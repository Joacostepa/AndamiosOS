"use client";

import { useState } from "react";
import { Loader2, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useRegistrarCandado } from "@/hooks/use-habilitaciones";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Friccion } from "@/lib/habilitaciones/derivacion";

// El candado al CONFIRMAR una jornada. Tres situaciones distintas, tres respuestas.
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

export type PedidoConfirmacion = {
  otId: number;
  friccion: NonNullable<Friccion>;
  pedidosPrevios: number;
  /** Se ejecuta cuando el usuario decide seguir adelante. */
  confirmar: () => void;
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
  const { friccion, otId, pedidosPrevios, confirmar } = pedido;
  const necesitaMotivo = friccion.tipo === "bloqueo" || friccion.tipo === "falta_expediente";

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
        motivo: necesitaMotivo ? motivo.trim() : null,
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
          } else {
            toast.success("Confirmada · la excepción quedó registrada");
          }
          cerrar();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar"),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {friccion.tipo === "bloqueo" ? (
              <Lock className="h-4 w-4" style={{ color: "#912018" }} />
            ) : (
              <TriangleAlert className="h-4 w-4" style={{ color: "#B54708" }} />
            )}
            {friccion.tipo === "bloqueo"
              ? "No se puede confirmar sin el permiso"
              : friccion.tipo === "pedir_modalidad"
                ? "Falta la modalidad de permiso"
                : "Falta el número de expediente"}
          </DialogTitle>
          <DialogDescription>{friccion.motivo}</DialogDescription>
        </DialogHeader>

        {friccion.tipo === "pedir_modalidad" && (
          <div className="space-y-2 rounded-md border px-3 py-2.5 text-[13px]" style={{ backgroundColor: "#FEF6E7" }}>
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
              {friccion.tipo === "bloqueo"
                ? "Se puede confirmar igual, pero la excepción queda registrada con tu nombre y la fecha."
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
