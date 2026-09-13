"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Check, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useTablero } from "@/hooks/use-tablero";
import { useBandejaHabilitaciones } from "@/hooks/use-habilitaciones";
import { armarAgenda, type TarjetaAgenda } from "@/lib/habilitaciones/agenda";
import { hoyISO, sumarDias } from "@/lib/habilitaciones/derivacion";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ChipUrgencia } from "@/components/habilitaciones/chip-urgencia";
import { ChipPantalla } from "@/components/habilitaciones/chip-pantalla";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

// La planificación de las próximas dos semanas, para Habilitaciones. SÓLO LECTURA.
//
// DOS FORMAS, UN CONTENIDO. En pantalla ancha es una COLUMNA al costado que puede quedar
// abierta mientras se trabaja la bandeja —hay quien la usa todo el día—; en pantalla
// angosta o en el celular no hay ancho para dos columnas y se abre ENCIMA, como el panel
// de la OT del tablero. Cuál se muestra y si queda abierta lo decide
// planificacion-contexto.tsx; acá sólo se dibuja.
//
// NO SE MUEVE NADA DESDE ACÁ. Tocar una tarjeta abre la ficha de habilitación de esa obra,
// no el tablero: planificar es de Operaciones, y un panel que permite arrastrar desde otra
// oficina es la forma de que una jornada cambie sin que quien planifica se entere.
//
// Usa la misma lectura que el tablero (useTablero), con su misma caché, y la bandeja para
// el estado de cada habilitación. Las dos se piden recién cuando el panel está abierto.

const DIAS = 14;

const HAB = {
  habilitada: { texto: "Habilitada", color: "#27500A", fondo: "#EAF3DE" },
  pospuesta: { texto: "Pospuesta", color: "#854F0B", fondo: "#FEF6E7" },
  sin_habilitar: { texto: "Sin habilitar", color: "#912018", fondo: "#FDECEA" },
} as const;

/** La hora actual, refrescada cada `cadaMs`, para que "hace 3 min" no se quede quieto. */
function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
  return ahora;
}

function haceCuanto(desde: number, ahora: number): string {
  const min = Math.floor(Math.max(0, ahora - desde) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  return `a las ${format(desde, "HH:mm")}`;
}

function primeraMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Rango() {
  const hoy = hoyISO();
  return (
    <p className="text-[12px] text-muted-foreground">
      Próximas dos semanas, del {format(parseISO(hoy), "d MMM", { locale: es })} al{" "}
      {format(parseISO(sumarDias(hoy, DIAS - 1)), "d MMM", { locale: es })}. Sólo lectura: se
      planifica en el tablero.
    </p>
  );
}

/** Columna al costado, para pantalla ancha. Queda abierta mientras se trabaja. */
export function PanelPlanificacionLateral({ onCerrar }: { onCerrar: () => void }) {
  return (
    <aside className="sticky top-0 flex max-h-[calc(100dvh-7rem)] w-[380px] shrink-0 flex-col self-start overflow-hidden rounded-md border bg-card">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="h-4 w-4" />
            Planificación
          </h2>
          <Rango />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCerrar} aria-label="Cerrar planificación">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="overflow-y-auto pt-3">
        <Cuerpo fondo="bg-card" />
      </div>
    </aside>
  );
}

/** Encima de la página, para pantalla angosta y celular. */
export function PanelPlanificacionHoja({
  abierto,
  onOpenChange,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}) {
  return (
    <Sheet open={abierto} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Planificación
          </SheetTitle>
          <Rango />
        </SheetHeader>
        {abierto && <Cuerpo fondo="bg-popover" />}
      </SheetContent>
    </Sheet>
  );
}

function Cuerpo({ fondo }: { fondo: string }) {
  const hoy = hoyISO();
  const hasta = sumarDias(hoy, DIAS - 1);
  // Se relee sola cada 2 minutos y al volver a la pestaña: el panel puede quedar abierto
  // todo el día, y Operaciones sigue planificando mientras tanto.
  const { data, isLoading, error, dataUpdatedAt, isFetching, refetch } = useTablero(hoy, hasta, {
    refrescoAutomatico: true,
  });
  const ahora = useAhora(30_000);
  // En la bandeja ya está cargada (misma clave); en la ficha se pide acá.
  const { data: bandeja } = useBandejaHabilitaciones();
  const [soloSinHabilitar, setSoloSinHabilitar] = useState(false);

  const dias = useMemo(() => (data ? armarAgenda(data, bandeja) : []), [data, bandeja]);
  const todas = dias.flatMap((d) => d.tarjetas);
  const sinHabilitar = todas.filter((t) => t.hab.clave !== "habilitada").length;
  const visibles = dias
    .map((d) => ({
      ...d,
      tarjetas: soloSinHabilitar ? d.tarjetas.filter((t) => t.hab.clave !== "habilitada") : d.tarjetas,
    }))
    .filter((d) => d.tarjetas.length > 0);

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* QUÉ TAN FRESCO ES LO QUE SE VE. No es instantáneo —Odoo no avisa cuando algo
          cambia—, así que se dice cuándo se leyó y se deja actualizar a mano para cuando
          Operaciones avisa que acaba de mover algo. */}
      {data && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {isFetching ? "Actualizando…" : `Actualizado ${haceCuanto(dataUpdatedAt, ahora)}`}
          </span>
          <button
            type="button"
            className="ml-auto flex items-center gap-1 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">
            {todas.length} jornadas ·{" "}
            <span style={{ color: sinHabilitar > 0 ? HAB.sin_habilitar.color : undefined }}>
              {sinHabilitar} sin habilitar
            </span>
          </span>
          <Button
            size="sm"
            variant={soloSinHabilitar ? "secondary" : "outline"}
            className="ml-auto"
            aria-pressed={soloSinHabilitar}
            onClick={() => setSoloSinHabilitar((v) => !v)}
          >
            Solo sin habilitar
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-[13px]" style={{ color: HAB.sin_habilitar.color }}>
          <TriangleAlert className="h-4 w-4" />
          No se pudo leer la planificación.
        </p>
      )}

      {data && visibles.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          {soloSinHabilitar
            ? "Todo lo planificado en estas dos semanas está habilitado."
            : "No hay obras planificadas en las próximas dos semanas."}
        </p>
      )}

      {visibles.map((dia) => (
        <section key={dia.fecha} className="space-y-1.5">
          {/* Sin `capitalize` de CSS: pone en mayúscula cada palabra ("14 De Septiembre").
              Sólo la primera letra, que es como se escribe en castellano. */}
          <h3 className={`sticky top-0 z-10 py-1 text-[12px] font-semibold ${fondo}`}>
            {dia.fecha === hoy ? "Hoy · " : ""}
            {primeraMayuscula(format(parseISO(dia.fecha), "EEEE d 'de' MMMM", { locale: es }))}
            <span className="ml-1.5 font-normal text-muted-foreground">{dia.tarjetas.length}</span>
          </h3>
          {dia.tarjetas.map((t) => (
            <Tarjeta key={t.asignacionId} t={t} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Tarjeta({ t }: { t: TarjetaAgenda }) {
  const hab = HAB[t.hab.clave];
  return (
    <Link
      href={`/habilitaciones/${t.otId}`}
      // Tentativa con borde punteado, confirmada con borde lleno: la misma convención que
      // la tarjeta del tablero, para que se lea igual en las dos pantallas.
      className="block rounded-md border px-2.5 py-2 text-[13px] hover:bg-muted/40"
      style={{ borderStyle: t.estado === "tentativa" ? "dashed" : "solid" }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <ChipTipoOt tipo={t.tipo} />
        <ChipUrgencia urgencia={t.urgencia} />
        <ChipPantalla trabajo={t.fila?.trabajo} />
        <span className="truncate font-medium">{t.direccion}</span>
      </span>
      {/* El cliente en su propio renglón, debajo de la dirección: es a quién hay que
          pedirle los papeles, y en el renglón de la cuadrilla se cortaría. */}
      {t.cliente && (
        <span className="mt-0.5 block truncate text-[12px]">{t.cliente}</span>
      )}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{t.cuadrilla ?? "Sin cuadrilla"}</span>
        <span>·</span>
        <span>{t.estado}</span>
        {t.cerrada && (
          <span className="flex items-center gap-0.5">
            <Check className="h-3 w-3" style={{ color: "#639922" }} />
            con parte
          </span>
        )}
        <span
          className="ml-auto rounded px-1.5 py-0.5 font-semibold"
          style={{ backgroundColor: hab.fondo, color: hab.color }}
        >
          {t.hab.clave === "pospuesta"
            ? `Pospuesta hasta el ${format(parseISO(t.hab.hasta), "d MMM", { locale: es })}`
            : hab.texto}
        </span>
      </span>
    </Link>
  );
}
