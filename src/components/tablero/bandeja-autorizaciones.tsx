"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Inbox, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/use-user";
import {
  CLAVE_SOLICITUDES_GUARDIA,
  useGuardias,
  useOfrecerDeshacerAprobado,
  usePuedeAutorizar,
  useResponderSolicitud,
  useSolicitudesGuardia,
} from "@/hooks/use-guardias";
import { conectarAvisos } from "@/lib/tablero/avisos";
import { siglaCuadrilla } from "@/lib/tablero/guardias";
import { GUARDIA, OK_TEXTO, PELIGRO_TEXTO, RAYADO_GUARDIA } from "@/lib/tablero/colores";
import { ETIQUETA_SOLICITUD, SEMANAS_ROTACION, type SolicitudGuardia } from "@/lib/tablero/guardias-tipos";
import { hoyBA, lunesDe, sumarDias } from "@/lib/tablero/dias-habiles";

// La bandeja de JS: los pedidos sobre las guardias (guardias-contrato.md §1.3).
//
// SÓLO LO QUE HAY QUE DECIDIR, ARRIBA. Cada pedido dice qué se pide, sobre qué guardia
// (día y cuadrilla), para qué obra, el motivo de quien pidió y quién y cuándo. Aprobar
// EJECUTA lo pedido —saca la guardia o pone la obra en su lugar— y rechazar no toca nada:
// la guardia sigue puesta y quien pidió se entera. La respuesta es opcional: un "no" sin
// explicación también es una respuesta, y obligarla convertiría la bandeja en un trámite.
//
// DEBAJO, LO RESUELTO RECIENTE, para poder contestar "¿qué aprobé esta semana?" sin abrir
// cada guardia.
//
// EN VIVO SIN CONSULTAR CADA RATO: se cuelga del mismo canal de avisos del tablero. Cuando
// alguien pide algo desde el tablero, el aviso llega acá y se vuelve a pedir la lista; si
// nadie pide nada, no cuesta nada. Y al revés: lo que JS aprueba acá les avisa a los
// tableros abiertos que algo cambió.

const momento = (iso: string) => format(parseISO(iso), "EEE dd/MM HH:mm", { locale: es });
const diaCorto = (f: string) => format(parseISO(f), "EEE dd/MM", { locale: es });

/** "C3" con el nombre de Odoo que trae el pedido; sin nombre (Odoo no contestó), "cuadrilla". */
function sigla(g: SolicitudGuardia["guardia"]): string {
  return g.cuadrillaNombre != null ? siglaCuadrilla({ id: g.cuadrillaId, nombre: g.cuadrillaNombre }) : "cuadrilla";
}

export function BandejaAutorizaciones() {
  const puede = usePuedeAutorizar();
  const pendientes = useSolicitudesGuardia("pendiente", { habilitado: puede });
  const todas = useSolicitudesGuardia("todas", { habilitado: puede });
  const qc = useQueryClient();
  const { data: user } = useUser();
  const nombre = user?.nombre?.trim() || "JS";
  // Las SACADAS no están en la grilla y, si las sacó JS directo, tampoco tienen pedido: sin
  // esta lista no había dónde verlas (contrato §1.6: "sacada: queda en la historia"). Cuatro
  // semanas para atrás (la rotación) y dos para adelante (lo que puso la corrida).
  const [rango] = useState(() => {
    const hoy = hoyBA();
    return { desde: sumarDias(lunesDe(hoy), -7 * SEMANAS_ROTACION), hasta: sumarDias(lunesDe(hoy), 20) };
  });
  const guardias = useGuardias(puede ? rango.desde : "", puede ? rango.hasta : "");

  useEffect(() => {
    if (!puede) return;
    return conectarAvisos(nombre, () => {
      void qc.invalidateQueries({ queryKey: CLAVE_SOLICITUDES_GUARDIA });
    });
  }, [puede, nombre, qc]);

  if (!puede) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Esta bandeja es de quien autoriza las guardias.
      </p>
    );
  }

  const sacadas = (guardias.data?.guardias ?? [])
    .filter((g) => g.estado === "sacada")
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const resueltas = (todas.data ?? [])
    .filter((s) => s.estado !== "pendiente")
    .sort((a, b) => (b.respondidoAt ?? b.pedidoAt).localeCompare(a.respondidoAt ?? a.pedidoAt))
    .slice(0, 20);

  return (
    <div className="space-y-8">
      <section aria-labelledby="pendientes-titulo" className="space-y-3">
        <h2 id="pendientes-titulo" className="flex items-center gap-2 text-sm font-medium">
          Para decidir
          {(pendientes.data?.length ?? 0) > 0 && (
            <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{pendientes.data!.length}</span>
          )}
        </h2>
        {pendientes.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : pendientes.isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            No se pudieron leer los pedidos.
            <Button variant="outline" size="sm" onClick={() => pendientes.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (pendientes.data ?? []).length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <Inbox className="h-4 w-4" aria-hidden />
            No hay pedidos esperando. Las guardias siguen como las dejó el sistema.
          </div>
        ) : (
          <ul className="space-y-3">
            {pendientes.data!.map((s) => (
              <li key={s.id}>
                <Pedido solicitud={s} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="resueltas-titulo" className="space-y-3">
        <h2 id="resueltas-titulo" className="text-sm font-medium text-muted-foreground">
          Resueltos hace poco
        </h2>
        {todas.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : resueltas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no respondiste ningún pedido.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {resueltas.map((s) => (
              <li key={s.id} className="space-y-0.5 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">{ETIQUETA_SOLICITUD[s.tipo]}</span> · guardia del{" "}
                  {diaCorto(s.guardia.fecha)} ({sigla(s.guardia)})
                  {s.otTitulo ? ` · ${s.otTitulo}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  “{s.motivo}” · {s.pedidoPorNombre ?? "alguien"}
                </p>
                <p
                  className="text-xs font-medium"
                  style={{ color: s.estado === "aprobada" ? OK_TEXTO : s.estado === "rechazada" ? PELIGRO_TEXTO : undefined }}
                >
                  {s.estado === "aprobada"
                    ? "Aprobado"
                    : s.estado === "rechazada"
                      ? "Rechazado"
                      : // Sin respuesta lo canceló quien pidió; con respuesta, se cerró solo porque la
                        // guardia cambió (se usó, se sacó, se corrió) y ya no se podía hacer.
                        s.respuesta
                        ? "Se cerró solo"
                        : "Cancelado por quien pidió"}
                  {s.respondidoAt ? ` · ${momento(s.respondidoAt)}` : ""}
                  {s.respuesta ? ` · “${s.respuesta}”` : ""}
                  {s.estado === "aprobada" && !s.ejecutadaAt && s.errorEjecucion
                    ? ` · falta hacerlo: ${s.errorEjecucion}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sacadas.length > 0 && (
        <section aria-labelledby="sacadas-titulo" className="space-y-3">
          <h2 id="sacadas-titulo" className="text-sm font-medium text-muted-foreground">
            Guardias sacadas
          </h2>
          <ul className="divide-y rounded-lg border">
            {sacadas.map((g) => (
              <li key={g.id} className="space-y-0.5 px-3 py-2 text-sm">
                <p>
                  Guardia del {diaCorto(g.fecha)} (
                  {g.cuadrillaNombre != null ? siglaCuadrilla({ id: g.cuadrillaId, nombre: g.cuadrillaNombre }) : "cuadrilla"})
                </p>
                <p className="text-xs text-muted-foreground">
                  {g.estadoMotivo ? `“${g.estadoMotivo}”` : "Sin motivo"}
                  {g.estadoPorNombre ? ` · ${g.estadoPorNombre}` : ""}
                  {g.estadoAt ? ` · ${momento(g.estadoAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Las jornadas que se lleva el pedido, con fecha: "lun 02/11, mar 03/11 (guardia), mié 04/11".
 * null si es sólo la de la guardia. Una obra de varios días se aprueba ENTERA (las otras
 * jornadas van a celdas comunes), y aprobarla sin ver eso es aprobar a ciegas.
 */
function jornadasDelPedido(s: SolicitudGuardia): string | null {
  const p = s.pedido;
  if (!p) return null;
  const fechas = [...(p.crear ?? []).map((c) => c.fecha), ...(p.mover ?? []).map((m) => m.fecha)].sort();
  if (fechas.length <= p.guardiaIds.length) return null;
  return fechas.map((f) => (f === s.guardia.fecha ? `${diaCorto(f)} (guardia)` : diaCorto(f))).join(", ");
}

/** Un pedido pendiente, con su respuesta opcional y los dos botones. */
function Pedido({ solicitud: s }: { solicitud: SolicitudGuardia }) {
  const [respuesta, setRespuesta] = useState("");
  const responder = useResponderSolicitud();
  const ofrecerDeshacer = useOfrecerDeshacerAprobado();
  const jornadas = jornadasDelPedido(s);
  const [eligiendo, setEligiendo] = useState<boolean | null>(null);
  const idRespuesta = `respuesta-${s.id}`;

  async function decidir(aprobar: boolean) {
    setEligiendo(aprobar);
    try {
      const r = await responder.mutateAsync({ solicitudId: s.id, aprobar, respuesta });
      if (!aprobar) {
        toast.success("Rechazado: la guardia sigue puesta", { description: "Quien lo pidió ya tiene el aviso." });
      } else if (r.ejecutada) {
        ofrecerDeshacer(r, "Aprobado y hecho");
      } else {
        // Aprobado pero la grilla cambió desde que se pidió: queda habilitado para quien
        // pidió, que lo vuelve a soltar (plan técnico §0, decisión 5).
        toast.warning("Aprobado, pero no se pudo hacer solo", {
          description: `${r.solicitud.errorEjecucion ?? "La grilla cambió."} Quien lo pidió ya puede hacerlo desde el tablero.`,
        });
      }
    } catch (e) {
      toast.error("No se pudo responder", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setEligiendo(null);
    }
  }

  return (
    <article className="space-y-3 rounded-lg border p-3" aria-labelledby={`pedido-${s.id}`}>
      <div className="space-y-1">
        <h3 id={`pedido-${s.id}`} className="text-[15px] font-medium">
          {ETIQUETA_SOLICITUD[s.tipo]}
        </h3>
        <p
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm"
          style={{ backgroundColor: GUARDIA.fondo, backgroundImage: RAYADO_GUARDIA, borderColor: GUARDIA.borde, color: GUARDIA.texto }}
        >
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: GUARDIA.sello }} aria-hidden />
          Guardia del {diaCorto(s.guardia.fecha)} · {sigla(s.guardia)}
          {s.guardia.estado !== "activa" ? ` · ya ${s.guardia.estado}` : ""}
        </p>
        {s.otTitulo && <p className="text-sm">Para: {s.otTitulo}</p>}
        {jornadas && <p className="text-sm text-muted-foreground">Jornadas: {jornadas}</p>}
        <p className="text-sm">“{s.motivo}”</p>
        <p className="text-xs text-muted-foreground">
          Lo pidió {s.pedidoPorNombre ?? "alguien"} · {momento(s.pedidoAt)}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor={idRespuesta} className="text-xs text-muted-foreground">
          Respuesta (opcional)
        </label>
        <Input
          id={idRespuesta}
          value={respuesta}
          maxLength={200}
          onChange={(e) => setRespuesta(e.target.value)}
          placeholder="Ej: dale, pero avisale al cliente de la C3"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void decidir(true)} disabled={responder.isPending}>
          {eligiendo === true ? <Loader2 className="animate-spin" /> : <Check />}
          Aprobar
        </Button>
        <Button variant="outline" onClick={() => void decidir(false)} disabled={responder.isPending}>
          {eligiendo === false && <Loader2 className="animate-spin" />}
          Rechazar
        </Button>
      </div>
    </article>
  );
}
