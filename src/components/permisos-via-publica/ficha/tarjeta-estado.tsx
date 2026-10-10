"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAccionPresentacion } from "@/hooks/use-permisos-via-publica";
import { NOMBRE_ETAPA, haceCuanto, horaCorta, type EstadoPermiso } from "@/lib/permisos-via-publica/estado";
import type { FichaPermiso } from "@/lib/permisos-via-publica/ficha";
import type { AccionConPersona } from "@/lib/permisos-via-publica/lista";
import { Chip, Linea, type TonoChip } from "../ui";
import { LO_TIENE, teTocaA } from "../textos";
import { BotonAccion } from "./acciones";
import { useState } from "react";
import { Dialogo } from "../dialogo";

// La tarjeta de estado: lo primero de la ficha (rediseño 09/10). Contesta en qué etapa está, qué
// falta, quién lo mueve y desde cuándo, con UN botón principal (coral) para lo que le toca a la
// oficina. Es la misma cuenta que la fila de la lista (estado.ts).

const TONO_ETAPA: Record<EstadoPermiso["tono"], TonoChip> = { bloqueo: "bloqueo", aviso: "aviso", marcha: "marcha", listo: "listo", neutro: "neutro" };
const ESTADO_TEXTO = { listo: "Listo", marcha: "En marcha", frenado: "Frenado", te_toca: "Te toca", todavia: "Todavía no" } as const;

export function TarjetaEstado({
  estado,
  acciones,
  ahora,
  ficha,
  pie,
  boton,
}: {
  estado: EstadoPermiso;
  acciones: AccionConPersona[];
  ahora: number;
  /** Con ficha de trámite, los botones de las acciones; sin ella (expediente solo), `boton`. */
  ficha?: FichaPermiso;
  pie?: React.ReactNode;
  boton?: (a: AccionConPersona, principal: boolean) => React.ReactNode;
}) {
  const actual = estado.etapas.find((e) => e.clave === estado.actual)!;
  const tonoTiempo: TonoChip = estado.demora === "muy" ? "bloqueo" : estado.demora === "tarde" ? "aviso" : estado.loTiene && estado.loTiene !== "Oficina" ? "marcha" : "neutro";
  const render = (a: AccionConPersona, principal: boolean) => (ficha ? <BotonAccion accion={a} ficha={ficha} principal={principal} /> : boton?.(a, principal));

  return (
    <section id="estado" aria-labelledby="estado-titulo" className="scroll-mt-4 space-y-4 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip tono={estado.grupo === "emitido" ? "listo" : TONO_ETAPA[estado.tono]}>
          {NOMBRE_ETAPA[estado.actual]} · {ESTADO_TEXTO[actual.estado]}
        </Chip>
        {(estado.loTiene || estado.desde) && estado.grupo !== "emitido" && (
          <Chip tono={tonoTiempo}>
            {[estado.loTiene ? `Lo tiene: ${LO_TIENE[estado.loTiene]}` : null, estado.desde ? haceCuanto(estado.desde, ahora) : null].filter(Boolean).join(" · ")}
          </Chip>
        )}
      </div>

      <div className="space-y-2">
        <h2 id="estado-titulo" className="text-[19px] font-bold leading-snug">{estado.titulo}</h2>
        {estado.motivo && (
          <blockquote className={cn("rounded-md px-3 py-2 text-[14px]", estado.tono === "bloqueo" ? "bg-red-500/10 text-red-900 dark:text-red-100" : "bg-muted")}>
            «{estado.motivo}»
          </blockquote>
        )}
        {estado.bajada && <p className="text-[14px] text-foreground/80">{estado.bajada}</p>}
      </div>

      {acciones.length > 0 && (
        <div className="space-y-3 rounded-md bg-muted p-3">
          {acciones.map((a, i) => (
            <div key={a.clave} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", i > 0 && "border-t border-border pt-3")}>
              <div className="min-w-0 flex-[999_1_18rem] space-y-1">
                <Chip tono="toca" sinIcono>{teTocaA(a.persona?.corto)}</Chip>
                <p className="text-[14px] font-medium">{a.titulo}</p>
                {a.detalle && <p className="text-[13px] text-foreground/75">{a.detalle}</p>}
              </div>
              {render(a, i === 0)}
            </div>
          ))}
        </div>
      )}

      {ficha && <Programada ficha={ficha} />}

      <Linea etapas={estado.etapas} />

      {(estado.estimado || pie) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[13px] text-muted-foreground">
          {estado.estimado && <span>{estado.estimado}</span>}
          {pie}
        </div>
      )}
    </section>
  );
}

/**
 * Una presentación en la cola con hora (fuera de horario, o el reintento porque TAD no respondía):
 * adelantarla (fuera de horario, nivel 3) o frenarla.
 */
function Programada({ ficha }: { ficha: FichaPermiso }) {
  const accion = useAccionPresentacion(ficha.tramite.id);
  const [que, setQue] = useState<"probar_ahora" | "dejar_de_reintentar" | null>(null);
  const tarea = ficha.presentacion.tarea;
  if (!tarea || tarea.estado !== "pendiente" || !tarea.reintentar_desde) return null;
  if (ficha.estado.acciones.some((a) => a.clave === "empezar_de_cero")) return null;
  const reintento = !!tarea.resultado?.reintento;
  const puede = ficha.tramite.es_prueba || ficha.yo.puedeIrreversible;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!puede || accion.isPending} onClick={() => setQue("probar_ahora")}>
        {reintento ? "Probar ahora…" : "Presentar ya…"}
      </Button>
      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={!ficha.yo.puedeEditar || accion.isPending} onClick={() => setQue("dejar_de_reintentar")}>
        Frenar la presentación…
      </Button>
      <Dialogo
        open={que === "probar_ahora"}
        onOpenChange={(o) => !o && setQue(null)}
        peligroso
        titulo={reintento ? "¿Probar ahora?" : "¿Presentar ahora, fuera de horario?"}
        texto={reintento
          ? `El robot vuelve a intentar ya, en vez de a las ${horaCorta(tarea.reintentar_desde)}.`
          : `De día TAD falla seguido y, si se corta a mitad de camino, el borrador puede quedar inservible. Programada, sale sola a las ${horaCorta(tarea.reintentar_desde)}.`}
        confirmar={reintento ? "Probar ahora" : "Presentar ahora"}
        cancelar={reintento ? "Cancelar" : "Esperar"}
        cargando={accion.isPending}
        onConfirmar={() => accion.mutate("probar_ahora", { onSuccess: () => { toast.success("El robot la toma en unos segundos"); setQue(null); }, onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo") })}
      />
      <Dialogo
        open={que === "dejar_de_reintentar"}
        onOpenChange={(o) => !o && setQue(null)}
        titulo="¿Frenar la presentación?"
        texto="Queda frenada hasta que alguien la vuelva a pedir desde esta ficha."
        confirmar="Frenar"
        cargando={accion.isPending}
        onConfirmar={() => accion.mutate("dejar_de_reintentar", { onSuccess: () => { toast.success("Presentación frenada"); setQue(null); }, onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo") })}
      />
    </div>
  );
}
