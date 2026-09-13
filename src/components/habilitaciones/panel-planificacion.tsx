"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Check, TriangleAlert } from "lucide-react";
import { useTablero } from "@/hooks/use-tablero";
import { armarAgenda, type TarjetaAgenda } from "@/lib/habilitaciones/agenda";
import { hoyISO, sumarDias } from "@/lib/habilitaciones/derivacion";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ChipUrgencia } from "@/components/habilitaciones/chip-urgencia";
import { ChipPantalla } from "@/components/habilitaciones/chip-pantalla";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bandeja } from "@/lib/habilitaciones/tipos";

// La planificación de las próximas dos semanas, para Habilitaciones. SÓLO LECTURA.
//
// PANEL LATERAL Y NO UN CAJÓN DE ABAJO: la pregunta es "qué viene y si está listo", que se
// lee de arriba a abajo, y así se puede tener abierto sin tapar la bandeja. Es el mismo
// Sheet que el panel de la OT en el tablero, así que funciona igual en el celular.
//
// NO SE MUEVE NADA DESDE ACÁ. Tocar una tarjeta abre la ficha de habilitación de esa obra,
// no el tablero: planificar es de Operaciones, y un panel que permite arrastrar desde otra
// oficina es la forma de que una jornada cambie sin que quien planifica se entere.
//
// Usa la misma lectura que el tablero (useTablero), con su misma caché.

const DIAS = 14;

const HAB = {
  habilitada: { texto: "Habilitada", color: "#27500A", fondo: "#EAF3DE" },
  pospuesta: { texto: "Pospuesta", color: "#854F0B", fondo: "#FEF6E7" },
  sin_habilitar: { texto: "Sin habilitar", color: "#912018", fondo: "#FDECEA" },
} as const;

export function PanelPlanificacion({
  abierto,
  onOpenChange,
  bandeja,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  bandeja: Bandeja | undefined;
}) {
  const hoy = hoyISO();
  const hasta = sumarDias(hoy, DIAS - 1);
  // Sólo pide cuando se abre: la bandeja no tiene por qué pagar la lectura del tablero.
  const { data, isLoading, error } = useTablero(abierto ? hoy : "", abierto ? hasta : "");
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
    <Sheet open={abierto} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Planificación
          </SheetTitle>
          <p className="text-[12px] text-muted-foreground">
            Próximas dos semanas, del {format(parseISO(hoy), "d MMM", { locale: es })} al{" "}
            {format(parseISO(hasta), "d MMM", { locale: es })}. Sólo lectura: se planifica en el tablero.
          </p>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
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
              <h3 className="sticky top-0 z-10 bg-popover py-1 text-[12px] font-semibold capitalize">
                {dia.fecha === hoy ? "Hoy · " : ""}
                {format(parseISO(dia.fecha), "EEEE d 'de' MMMM", { locale: es })}
                <span className="ml-1.5 font-normal text-muted-foreground">{dia.tarjetas.length}</span>
              </h3>
              {dia.tarjetas.map((t) => (
                <Tarjeta key={t.asignacionId} t={t} />
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
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
