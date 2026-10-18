"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GUARDIA, RAYADO_GUARDIA } from "@/lib/tablero/colores";
import {
  ETIQUETA_SOLICITUD,
  type PedidoUsoGuardia,
  type ResultadoAutorizacion,
  type TipoSolicitud,
} from "@/lib/tablero/guardias-tipos";
import type { MovimientoAsignacion } from "@/lib/tablero/tipos";
import {
  usePedirAutorizacion,
  usePuedeAutorizar,
  useResponderSolicitud,
  useSacarGuardia,
} from "@/hooks/use-guardias";

// "Pedir autorización a JS" (guardias-contrato.md §1.3).
//
// LO QUE PLANIFICACIÓN NO PUEDE HACER SOLA con una guardia —sacarla, poner una obra común
// encima, un comodín antes de las 13 h del día anterior, una urgencia que no cumple la
// regla— no se bloquea con un error: se PIDE. El motivo es obligatorio y de una línea, que
// es lo que JS lee en la bandeja para decidir; un párrafo no se lee y un punto no dice nada.
//
// NO SE APILA NI SE SUMA NADA MIENTRAS TANTO. El pedido viaja con la acción entera
// (`pedido`, el mismo cuerpo de /guardias/usar) y al aprobar la ejecuta el servidor; hasta
// entonces la guardia sigue puesta, y el diálogo lo dice. Si se pudiera soltar la obra
// "a cuenta" de la respuesta, la guardia dejaría de proteger justo mientras se discute.
//
// JS NO SE PIDE A SÍ MISMO. Si el que suelta es JS, el mismo diálogo le pide el motivo y lo
// autoriza en el acto, EN UNA SOLA LLAMADA (`autoaprobar`): queda la solicitud aprobada con su
// motivo, igual que si hubiera llegado por la bandeja, la acción la ejecuta el servidor por el
// mismo camino, y nadie recibe un aviso —ni JS en la campanita ni el canal— de un pedido que
// ya está resuelto. Si se ejecutó, el tablero ofrece el mismo "Deshacer" que cualquier uso
// (`onUsada`).
//
// MODO "sacar": es el "Sacar" directo de JS (§1.6). También con motivo, porque una guardia
// sacada no se repone esa semana y alguien va a preguntar por qué.

export type PedidoAutorizacion = {
  guardia: { id: number; fecha: string; cuadrillaId: number };
  /** "C3". */
  sigla: string;
  tipo: TipoSolicitud;
  /** Lo que dijo el candado ("Esa jornada es una guardia: …"). */
  mensaje?: string | null;
  /** Lo que se ejecuta al aprobar. Ausente en 'sacar'. */
  pedido?: PedidoUsoGuardia;
  /** La obra que se quiere poner, en palabras ("Thames 1820"). */
  obra?: string | null;
  /** "sacar" = JS la saca directo, sin pedido. */
  modo?: "pedir" | "sacar";
  /** Para el optimista del deshacer: adónde vuelven las jornadas que el uso mueve. */
  volver?: MovimientoAsignacion[];
};

/** Lo que se ejecutó al autorizar un uso (para ofrecer el deshacer). */
export type UsoAutorizado = NonNullable<ResultadoAutorizacion["uso"]>;

const diaLargo = (f: string) => format(parseISO(f), "EEEE d 'de' MMMM", { locale: es });

const TITULO: Record<TipoSolicitud, string> = {
  sacar: "Pedir autorización para sacar la guardia",
  obra_comun: "Esa jornada es una guardia",
  comodin_antes: "Todavía no se puede rellenar con el comodín",
  urgencia_fuera_regla: "La urgencia no cumple la regla de la guardia",
};

export function DialogoPedirAutorizacion({
  pedido,
  onCerrar,
  onUsada,
}: {
  pedido: PedidoAutorizacion | null;
  onCerrar: () => void;
  /** JS autorizó un uso y se ejecutó: el tablero ofrece deshacerlo. */
  onUsada?: (uso: UsoAutorizado, pedido: PedidoAutorizacion) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const pedir = usePedirAutorizacion();
  const responder = useResponderSolicitud();
  const sacar = useSacarGuardia();
  const esJS = usePuedeAutorizar();

  if (!pedido) return null;
  const { guardia, sigla, tipo, mensaje, obra } = pedido;
  const modo = pedido.modo ?? "pedir";
  const ocupado = pedir.isPending || responder.isPending || sacar.isPending;

  function cerrar() {
    setMotivo("");
    onCerrar();
  }

  async function seguir() {
    const texto = motivo.trim();
    if (!texto) {
      toast.error("Escribí el motivo: es lo que JS lee para decidir");
      return;
    }
    // Se desestructura acá para que el estrechamiento de `pedido` llegue a la función.
    const p = pedido!;
    try {
      if (modo === "sacar") {
        await sacar.mutateAsync({ guardiaId: guardia.id, motivo: texto });
        toast.success(`Se sacó la guardia del ${diaLargo(guardia.fecha)} (${sigla})`, {
          description: "Esa semana no se repone. Queda en la historia con tu motivo.",
        });
        cerrar();
        return;
      }
      const r = await pedir.mutateAsync({ guardiaId: guardia.id, tipo, motivo: texto, pedido: p.pedido, autoaprobar: esJS || undefined });
      if (esJS) {
        // JS autoriza lo suyo en el acto: misma solicitud, mismo registro, mismo camino. Si ya
        // había un pedido igual pendiente (de otra persona), se aprueba ése.
        const res = r.autorizacion ?? (await responder.mutateAsync({ solicitudId: r.solicitud.id, aprobar: true, respuesta: texto }));
        if (res.ejecutada && res.uso) onUsada?.(res.uso, p);
        if (res.ejecutada) {
          toast.success(tipo === "sacar" ? "Guardia sacada" : "Autorizado: la obra usa la guardia", {
            description: "Quedó registrado con tu motivo.",
          });
        } else {
          toast.warning("Quedó autorizado, pero no se pudo hacer solo", {
            description: `${res.solicitud.errorEjecucion ?? "La grilla cambió."} Soltá la obra de nuevo.`,
          });
        }
        cerrar();
        return;
      }
      toast.success(r.yaEstaba ? "Ya lo habías pedido: sigue esperando a JS" : "Listo, se lo pedimos a JS", {
        description: "Hasta que JS responda, la guardia sigue puesta. Te avisamos cuando conteste.",
      });
      cerrar();
    } catch (e) {
      toast.error(modo === "sacar" ? "No se pudo sacar la guardia" : "No se pudo pedir la autorización", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const titulo = modo === "sacar" ? "Sacar la guardia" : TITULO[tipo];
  const accion =
    modo === "sacar"
      ? "Sacar la guardia"
      : esJS
        ? tipo === "sacar"
          ? "Autorizar y sacar"
          : "Autorizar y usar"
        : "Pedir autorización";

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !ocupado && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modo === "sacar" ? (
              <ShieldOff className="h-4 w-4" style={{ color: GUARDIA.sello }} aria-hidden />
            ) : (
              <KeyRound className="h-4 w-4" style={{ color: GUARDIA.sello }} aria-hidden />
            )}
            {titulo}
          </DialogTitle>
          <DialogDescription>
            {modo === "sacar"
              ? "Sacada no se repone esta semana: queda menos lugar para lo imprevisto."
              : (mensaje ?? `${ETIQUETA_SOLICITUD[tipo]} necesita la autorización de JS.`)}
          </DialogDescription>
        </DialogHeader>

        {/* La guardia de la que se habla, dibujada como en la grilla: el texto solo ("la del
            jueves de la C3") obliga a ir a buscarla para saber si es ésa. */}
        <div
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
          style={{
            backgroundColor: GUARDIA.fondo,
            backgroundImage: RAYADO_GUARDIA,
            borderColor: GUARDIA.borde,
            color: GUARDIA.texto,
          }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: GUARDIA.sello }} aria-hidden />
          <span>
            Guardia del <strong className="font-semibold">{diaLargo(guardia.fecha)}</strong> · {sigla}
            {obra && modo !== "sacar" && tipo !== "sacar" ? (
              <>
                {" "}
                · para <strong className="font-semibold">{obra}</strong>
              </>
            ) : null}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-guardia" className="text-[12px]">
            Motivo
          </Label>
          <Input
            id="motivo-guardia"
            value={motivo}
            maxLength={200}
            autoFocus
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void seguir();
              }
            }}
            placeholder={
              tipo === "sacar" || modo === "sacar"
                ? "Ej: la C3 está con la grúa toda la semana"
                : "Ej: cliente grande, pidió esa fecha"
            }
            aria-describedby="motivo-guardia-ayuda"
          />
          <p id="motivo-guardia-ayuda" className="text-[12px] text-muted-foreground">
            {modo === "sacar"
              ? "Una línea. Queda en la historia de la guardia."
              : esJS
                ? "Una línea. Sos quien autoriza: queda registrado con tu motivo."
                : "Una línea, es lo que JS lee para decidir. Hasta que JS responda, la guardia sigue puesta."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={() => void seguir()} disabled={ocupado || !motivo.trim()}>
            {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {accion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
