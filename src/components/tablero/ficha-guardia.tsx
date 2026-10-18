"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Check, CalendarRange, KeyRound, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AVISO, GUARDIA, OK_TEXTO, PELIGRO_TEXTO, RAYADO_GUARDIA } from "@/lib/tablero/colores";
import {
  ETIQUETA_SOLICITUD,
  ETIQUETA_USO,
  type EstadoGuardia,
  type EstadoSolicitud,
  type EventoGuardia,
  type Guardia,
  type SolicitudGuardia,
} from "@/lib/tablero/guardias-tipos";
import { useCancelarSolicitud, useOfrecerDeshacerAprobado, useResponderSolicitud } from "@/hooks/use-guardias";

// La ficha de una GUARDIA (guardias-contrato.md §1.6): lo que se abre al tocarla.
//
// Contesta, en este orden, lo que pregunta quien la toca:
//   1. ¿quién la puso y por qué acá? — "La puso el sistema el vie 23/10" y el porQué que
//      escribe la regla ("jueves le tocaba a la C3 por rotación"). Si eso no se ve, la
//      guardia parece un capricho y se la saca;
//   2. ¿en qué está? — activa (y qué pasa si nadie la usa), usada, rellenada o sacada;
//   3. ¿qué puedo hacer? — correrla dentro de la semana (Planificación, sin pedir nada),
//      pedir autorización para sacarla, o sacarla (sólo JS);
//   4. los pedidos a JS y la historia, con quién y cuándo.
//
// ES UN SHEET COMO LA FICHA DE LA OT (panel-ot.tsx) a propósito: es el mismo gesto —tocar
// una tarjeta abre su ficha a la derecha— y aprenderlo dos veces no tiene sentido. Los
// mismos tres tamaños: 17px el título, 14px el texto, 12px lo secundario.

/** Un lugar donde se la puede correr (ya validado con destinoValidoGuardia). */
export type DestinoCorrer = { fecha: string; cuadrillaId: number; sigla: string };

const diaCorto = (f: string) => format(parseISO(f), "EEE dd/MM", { locale: es });
const diaTitulo = (f: string) => format(parseISO(f), "EEE d MMM", { locale: es });
const momento = (iso: string) => format(parseISO(iso), "EEE dd/MM HH:mm", { locale: es });

const ESTADO: Record<EstadoGuardia, string> = {
  activa: "Activa",
  usada: "Usada",
  rellenada: "Rellenada",
  sacada: "Sacada",
};

const ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: "esperando a JS",
  aprobada: "aprobada",
  rechazada: "rechazada",
  cancelada: "cancelada",
};

/** Una línea de la historia, en castellano. */
function textoEvento(e: EventoGuardia, sigla: (id: number) => string): string {
  const donde = (x: { fecha: string; cuadrillaId: number } | null) =>
    x ? `${diaCorto(x.fecha)} (${sigla(x.cuadrillaId)})` : "";
  const obra = e.otTitulo ? `: ${e.otTitulo}` : "";
  switch (e.accion) {
    case "poner":
      return "La puso";
    case "mover":
      return `La corrió del ${donde(e.de)} al ${donde(e.a)}`;
    case "usar":
      return `Se usó para ${e.uso ? ETIQUETA_USO[e.uso] : "una obra"}${obra}`;
    case "rellenar":
      return e.uso === "deposito" ? "Nadie la usó: la cuadrilla fue al depósito" : `Se rellenó con un comodín${obra}`;
    case "reactivar":
      return "Volvió a estar activa";
    case "sacar":
      return "La sacó";
    case "pedir":
      return `Pidió autorización${obra}`;
    case "aprobar":
      return "Aprobó el pedido";
    case "rechazar":
      return "Rechazó el pedido";
    case "cancelar":
      return "Canceló el pedido";
  }
}

export function FichaGuardia({
  guardia,
  eventos,
  solicitudes,
  sigla,
  relleno,
  destinos,
  hoy,
  puedeAutorizar,
  usuarioId,
  onCorrer,
  onPedirSacar,
  onSacar,
  onOpenChange,
}: {
  /** null = cerrada. */
  guardia: Guardia | null;
  eventos: EventoGuardia[];
  solicitudes: SolicitudGuardia[];
  sigla: (cuadrillaId: number) => string;
  /** "Depósito" o el comodín previsto. */
  relleno: string;
  /** Dónde se puede correr dentro de la semana. Vacío si no hay lugar (o no está activa). */
  destinos: DestinoCorrer[];
  hoy: string;
  puedeAutorizar: boolean;
  usuarioId: string | null;
  onCorrer: (destino: DestinoCorrer) => void;
  onPedirSacar: () => void;
  onSacar: () => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  const cancelar = useCancelarSolicitud();
  const responder = useResponderSolicitud();
  const ofrecerDeshacer = useOfrecerDeshacerAprobado();
  // Cuál botón se tocó: con sólo `responder.isPending`, "Rechazar" mostraba el spinner en
  // "Aprobar" (lo mismo que ya resolvía la bandeja).
  const [eligiendo, setEligiendo] = useState<{ id: string; aprobar: boolean } | null>(null);

  if (!guardia) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const activa = guardia.estado === "activa";
  const editable = activa && guardia.fecha >= hoy;
  const suyos = eventos.filter((e) => e.guardiaId === guardia.id).sort((a, b) => b.at.localeCompare(a.at));
  const pedidos = solicitudes.filter((s) => s.guardiaId === guardia.id).sort((a, b) => b.pedidoAt.localeCompare(a.pedidoAt));
  const s = sigla(guardia.cuadrillaId);
  const origen =
    guardia.creadaAt &&
    (guardia.origen === "sistema"
      ? `La puso el sistema el ${diaCorto(guardia.creadaAt)}`
      : `La puso una persona el ${diaCorto(guardia.creadaAt)}`);

  // Los destinos agrupados por día: "mié 21: C2 · C4". Es más corto de leer que una lista
  // de diez botones sueltos, y el día es lo primero que se elige.
  const porDia = new Map<string, DestinoCorrer[]>();
  for (const d of destinos) porDia.set(d.fecha, [...(porDia.get(d.fecha) ?? []), d]);

  const estadoDetalle =
    guardia.estado === "activa"
      ? `si no entra nada: ${relleno}`
      : guardia.estado === "sacada"
        ? [guardia.estadoPorNombre ? `la sacó ${guardia.estadoPorNombre}` : null, guardia.estadoMotivo].filter(Boolean).join(" · ")
        : [
            guardia.uso ? ETIQUETA_USO[guardia.uso] : null,
            guardia.estadoPorNombre ?? (guardia.uso === "deposito" || guardia.uso === "lluvia" ? "el sistema" : null),
            guardia.estadoMotivo,
          ]
            .filter(Boolean)
            .join(" · ");

  async function responderPedido(solicitudId: string, aprobar: boolean) {
    setEligiendo({ id: solicitudId, aprobar });
    try {
      const r = await responder.mutateAsync({ solicitudId, aprobar });
      if (!aprobar) toast.success("Pedido rechazado: la guardia sigue puesta");
      else if (r.ejecutada) ofrecerDeshacer(r, "Aprobado y hecho");
      else
        toast.warning("Aprobado, pero no se pudo hacer solo", {
          description: `${r.solicitud.errorEjecucion ?? "La grilla cambió."} Quien lo pidió ya puede hacerlo.`,
        });
    } catch (e) {
      toast.error("No se pudo responder", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setEligiendo(null);
    }
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <header className="sticky top-0 z-10 space-y-3 border-b bg-popover px-4 pt-4 pb-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="flex items-center gap-2 text-[17px] leading-snug font-semibold">
                <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: GUARDIA.sello }} aria-hidden />
                Guardia · {diaTitulo(guardia.fecha)} · {s}
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {origen || "Lugar guardado para lo que no se puede prever"}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => onOpenChange(false)}>
              <X />
            </Button>
          </div>

          {/* El estado, dibujado como la tarjeta: el mismo ámbar rayado si está activa. */}
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-sm"
            style={
              activa
                ? { backgroundColor: GUARDIA.fondo, backgroundImage: RAYADO_GUARDIA, borderColor: GUARDIA.borde, color: GUARDIA.texto }
                : { backgroundColor: "var(--muted)" }
            }
          >
            <span className="font-semibold">{ESTADO[guardia.estado]}</span>
            {estadoDetalle && <span>· {estadoDetalle}</span>}
          </div>

          {guardia.porQue && (
            <p className="text-sm">
              <span className="text-muted-foreground">Por qué está acá: </span>
              {guardia.porQue}
            </p>
          )}

          {editable && (
            <div className="flex flex-wrap gap-1.5">
              {puedeAutorizar ? (
                <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={onSacar}>
                  <ShieldOff />
                  Sacar la guardia…
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-10 md:h-8" onClick={onPedirSacar}>
                  <KeyRound />
                  Pedir autorización para sacarla…
                </Button>
              )}
            </div>
          )}
        </header>

        <div className="divide-y px-4 pb-6 *:py-5">
          {/* CORRERLA: sin pedir nada, dentro de la misma semana y sólo a celdas totalmente
              libres de una cuadrilla propia (contrato §1.3, punto 5). La lista ya viene
              filtrada con destinoValidoGuardia, la misma regla que valida el servidor: lo
              que se ofrece acá, el servidor lo acepta. */}
          {editable && (
            <section aria-labelledby="ficha-guardia-correr" className="space-y-2">
              <h3 id="ficha-guardia-correr" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                Correrla dentro de la semana
              </h3>
              {porDia.size === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay otra celda libre de una cuadrilla propia esta semana.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {[...porDia.entries()].map(([fecha, lugares]) => (
                    <li key={fecha} className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="w-20 shrink-0 text-muted-foreground">{diaCorto(fecha)}</span>
                      {lugares.map((d) => (
                        <Button
                          key={`${d.fecha}-${d.cuadrillaId}`}
                          variant="outline"
                          size="sm"
                          className="h-9 md:h-7"
                          onClick={() => onCorrer(d)}
                          aria-label={`Correr la guardia al ${diaTitulo(d.fecha)}, ${d.sigla}`}
                        >
                          {d.sigla}
                        </Button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">También se puede arrastrar en la grilla.</p>
            </section>
          )}

          {pedidos.length > 0 && (
            <section aria-labelledby="ficha-guardia-pedidos" className="space-y-2">
              <h3 id="ficha-guardia-pedidos" className="text-xs font-medium text-muted-foreground">
                Pedidos a JS
              </h3>
              <ul className="space-y-2">
                {pedidos.map((p) => {
                  const pendiente = p.estado === "pendiente";
                  return (
                    <li
                      key={p.id}
                      className="space-y-1 rounded-md border px-3 py-2 text-sm"
                      style={pendiente ? { backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto } : undefined}
                    >
                      <p>
                        <span className="font-medium">{ETIQUETA_SOLICITUD[p.tipo]}</span>
                        {p.otTitulo ? ` · ${p.otTitulo}` : ""}
                      </p>
                      <p className="text-xs">
                        “{p.motivo}” · {p.pedidoPorNombre ?? "alguien"}, {momento(p.pedidoAt)}
                      </p>
                      <p
                        className="text-xs font-medium"
                        style={
                          p.estado === "aprobada" ? { color: OK_TEXTO } : p.estado === "rechazada" ? { color: PELIGRO_TEXTO } : undefined
                        }
                      >
                        {ESTADO_SOLICITUD[p.estado]}
                        {p.respondidoPorNombre ? ` por ${p.respondidoPorNombre}` : ""}
                        {p.respuesta ? `: “${p.respuesta}”` : ""}
                        {p.estado === "aprobada" && p.errorEjecucion ? ` · falta hacerlo: ${p.errorEjecucion}` : ""}
                      </p>
                      {pendiente && (puedeAutorizar || p.pedidoPorId === usuarioId) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {puedeAutorizar && (
                            <>
                              <Button size="sm" disabled={responder.isPending} onClick={() => void responderPedido(p.id, true)}>
                                {eligiendo?.id === p.id && eligiendo.aprobar ? <Loader2 className="animate-spin" /> : <Check />}
                                Aprobar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={responder.isPending}
                                onClick={() => void responderPedido(p.id, false)}
                              >
                                {eligiendo?.id === p.id && !eligiendo.aprobar && <Loader2 className="animate-spin" />}
                                Rechazar
                              </Button>
                            </>
                          )}
                          {!puedeAutorizar && p.pedidoPorId === usuarioId && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={cancelar.isPending}
                              onClick={() =>
                                cancelar.mutate(
                                  { solicitudId: p.id },
                                  {
                                    onSuccess: () => toast.success("Pedido cancelado"),
                                    onError: (e) => toast.error("No se pudo cancelar", { description: e.message }),
                                  },
                                )
                              }
                            >
                              Cancelar el pedido
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="ficha-guardia-historia" className="space-y-2">
            <h3 id="ficha-guardia-historia" className="text-xs font-medium text-muted-foreground">
              Historia
            </h3>
            {suyos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no pasó nada con esta guardia.</p>
            ) : (
              <ol className="space-y-2">
                {suyos.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>
                      <span className="font-medium">{e.autorNombre ?? "El sistema"}</span> · {textoEvento(e, sigla)}
                    </p>
                    {e.motivo && <p className="text-xs text-muted-foreground">“{e.motivo}”</p>}
                    <p className="text-xs text-muted-foreground">{momento(e.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
