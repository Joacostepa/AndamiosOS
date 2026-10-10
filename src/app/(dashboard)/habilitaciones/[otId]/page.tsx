"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { useHabilitacion, useVencimiento } from "@/hooks/use-habilitaciones";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ChipUrgencia } from "@/components/habilitaciones/chip-urgencia";
import { FechasObra } from "@/components/habilitaciones/fechas-obra";
import { DetalleTecnico } from "@/components/tablero/detalle-tecnico";
import { ColumnaPermiso } from "@/components/habilitaciones/columna-permiso";
import { ListadoRequisitos } from "@/components/habilitaciones/listado-requisitos";
import { NotasObra } from "@/components/habilitaciones/notas-obra";
import { TarjetaEstado } from "@/components/habilitaciones/tarjeta-estado";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { BotonAyuda } from "@/components/habilitaciones/boton-ayuda";
import { BotonPlanificacion } from "@/components/habilitaciones/planificacion-contexto";
import { useTour } from "@/hooks/use-tour";
import { PASOS_FICHA, TOUR_FICHA } from "@/lib/habilitaciones/tour";
import { TIPO_GESTION_LABEL } from "@/lib/habilitaciones/tipos";
import { partesTitulo, direccionDeObra } from "@/lib/tablero/titulo";
import type { FichaHabilitacion } from "@/lib/habilitaciones/tipos";

// Ficha de una habilitación (rediseño del 09/10, docs/habilitaciones/rediseno.md §4.3).
//
// ARRIBA, UNA SOLA TARJETA DE ESTADO: qué sigue y su botón, cuándo se arma, qué hace el
// tablero con ella (ver tarjeta-estado.tsx). Antes eran cinco bloques que decían lo mismo
// con palabras distintas, y la decisión quedaba debajo de cuatro de contexto.
//
// DOS COLUMNAS. A la izquierda la de trabajo: los papeles —con a quién mandárselos arriba y
// el vencimiento al pie— y las notas, justo debajo, porque ahí van los datos que piden los
// papeles (7 de las últimas 12 notas eran razones sociales con CUIT para la cláusula). A la
// derecha el contexto: cuándo se arma, qué se ejecuta, el permiso (sólo lectura) y el
// historial.

export default function FichaHabilitacionPage({
  params,
}: {
  params: Promise<{ otId: string }>;
}) {
  const { otId: raw } = use(params);
  const otId = Number(raw);
  const { data: ficha, isLoading, error } = useHabilitacion(otId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="No se pudo abrir la habilitación"
        description={error instanceof Error ? error.message : "La OT no existe en Odoo"}
      />
    );
  }

  return <Ficha ficha={ficha} otId={otId} />;
}

function Ficha({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const partes = partesTitulo(ficha.titulo);
  const direccion = direccionDeObra(ficha);
  // La ficha ya está en pantalla cuando este componente se monta: el tour puede arrancar.
  // Es la continuación del de la bandeja, que termina invitando a abrir una obra.
  const tour = useTour(TOUR_FICHA, PASOS_FICHA, { listo: true });
  const contacto = ficha.trabajo.syhObra;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/habilitaciones"
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Habilitaciones
        </Link>
        <a
          href={ficha.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground hover:underline"
        >
          Ver la OT en Odoo
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{direccion}</h1>
            <ChipUrgencia urgencia={ficha.urgencia} motivo={ficha.motivoUrgencia} />
            {ficha.tipo !== "armado" && <ChipTipoOt tipo={ficha.tipo} />}
            {/* En la ficha el motivo va escrito: el title no se lee desde un celular. */}
            {ficha.urgencia !== "baja" && ficha.motivoUrgencia && (
              <span className="text-[12px] text-muted-foreground">{ficha.motivoUrgencia}</span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {[
              ficha.tipo === "armado" ? "Armado" : null,
              partes.numero ?? ficha.permiso.ventaNombre,
              partes.cliente,
              ficha.trabajo.tipoLabel,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BotonPlanificacion />
          <BotonAyuda onRecorrido={tour.reiniciar} />
        </div>
      </div>

      <TarjetaEstado ficha={ficha} otId={otId} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div data-tour="requisitos">
            <ListadoRequisitos
              otId={otId}
              requisitos={ficha.requisitos}
              contacto={
                // A QUIÉN MANDARLE LOS PAPELES, pegado a los papeles. Sólo si hay algo
                // cargado: las órdenes viejas no lo tienen y nunca lo van a tener.
                contacto && ficha.triage === "aplica" && !ficha.habilitadaEl ? (
                  <p
                    data-tour="contacto-papeles"
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b bg-muted/40 px-3 py-2 text-[13px]"
                  >
                    <span className="text-muted-foreground">Mandárselos a</span>
                    <span className="font-medium">{contacto.nombre ?? "—"}</span>
                    {contacto.celular && (
                      <a href={`tel:${contacto.celular.replace(/[^+\d]/g, "")}`} className="underline underline-offset-2">
                        {contacto.celular}
                      </a>
                    )}
                    {contacto.email && (
                      <a href={`mailto:${contacto.email}`} className="underline underline-offset-2">
                        {contacto.email}
                      </a>
                    )}
                  </p>
                ) : null
              }
              pie={<Vencimiento ficha={ficha} otId={otId} />}
            />
          </div>
          <div data-tour="notas">
            <NotasObra otId={otId} notas={ficha.notas} />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div data-tour="fechas-obra">
            <FechasObra ficha={ficha} />
          </div>
          {/* QUÉ HAY QUE EJECUTAR, el mismo texto que ve Operaciones en el tablero: qué
              papeles pide el cliente depende de qué se va a hacer. */}
          <div data-tour="que-ejecutar">
            <DetalleTecnico
              texto={ficha.detalleTecnico}
              confirmadoEl={ficha.estructuraConfirmadaEl}
              tipo={ficha.tipo}
              clasificacion={ficha.trabajo.tipoLabel}
            />
          </div>
          <div data-tour="permiso">
            <ColumnaPermiso permiso={ficha.permiso} urlVenta={ficha.urlVenta} />
          </div>
          <div data-tour="historial">
            <Historial ficha={ficha} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * El vencimiento de la documentación, al pie de los papeles.
 *
 * No manda ningún aviso aparte: 30 días antes, la obra aparece en la bandeja en "Vencen en
 * menos de 30 días". Antes decía "Odoo avisa solo al pasar la fecha", y no había tal aviso.
 */
function Vencimiento({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const vencimiento = useVencimiento(otId);
  const [fecha, setFecha] = useState(ficha.vencimiento ?? "");
  return (
    <div
      data-tour="vencimiento"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2 text-[12px] text-muted-foreground"
    >
      <label htmlFor="venc">La documentación vence el</label>
      <Input
        id="venc"
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        onBlur={() => {
          if (fecha !== (ficha.vencimiento ?? "")) vencimiento.mutate(fecha || null);
        }}
        className="h-7 w-40 text-[12px]"
      />
      <span>· 30 días antes aparece en la bandeja</span>
    </div>
  );
}

const VISIBLES = 5;

/** Append-only y de sólo lectura: no hay forma de editar ni borrar desde acá. */
function Historial({ ficha }: { ficha: FichaHabilitacion }) {
  const [todo, setTodo] = useState(false);
  const gestiones = todo ? ficha.gestiones : ficha.gestiones.slice(0, VISIBLES);
  return (
    <section className="rounded-md border">
      <header className="flex items-center border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">Historial</h3>
        {ficha.gestiones.length > VISIBLES && (
          <button
            type="button"
            className="ml-auto text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setTodo((v) => !v)}
          >
            {todo ? "Ver menos" : `Ver todo (${ficha.gestiones.length})`}
          </button>
        )}
      </header>
      <ul className={todo ? "max-h-96 overflow-y-auto" : undefined}>
        {gestiones.map((g) => (
          <li key={g.id} className="border-b px-3 py-2 text-[13px] last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{TIPO_GESTION_LABEL[g.tipo]}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {format(parseISO(g.created_at), "d MMM HH:mm", { locale: es })}
              </span>
            </div>
            {g.detalle && <p className="text-[12px] text-muted-foreground">{g.detalle}</p>}
            <p className="text-[11px] text-muted-foreground">{g.autor_nombre ?? "—"}</p>
          </li>
        ))}
        {ficha.gestiones.length === 0 && (
          <li className="px-3 py-3 text-[12px] text-muted-foreground">Sin gestiones registradas.</li>
        )}
      </ul>
    </section>
  );
}
