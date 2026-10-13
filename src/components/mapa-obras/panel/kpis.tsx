"use client";

import { cn } from "@/lib/utils";
import { fmtEntero, fmtFecha, type KpisCalle, type KpisHistorico } from "@/lib/mapa-obras/categorias";
import { vidrio } from "./estilos";

// Contadores de arriba a la izquierda. Los textos son los de la maqueta.

export function PanelKpis({
  datos,
  hoy,
  fecha,
  generado,
  cargando,
  className,
}: {
  datos: KpisCalle | KpisHistorico | null;
  hoy: string;
  /** Fecha elegida en la línea de tiempo (sólo histórico). */
  fecha: string | null;
  /** Cuándo se armó la respuesta (ISO). */
  generado: string | null;
  cargando: boolean;
  className?: string;
}) {
  return (
    <section className={cn(vidrio, "px-3.5 py-3", className)} aria-label="Resumen">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold leading-none tracking-tight">Ciudad Armada</h1>
        {generado && (
          <span className="whitespace-nowrap rounded-full border border-emerald-400/40 px-1.5 py-0.5 font-mono text-[10px] leading-none text-emerald-300">
            {/* La hora en Argentina: `generado` es ISO en UTC y a la noche ya es "mañana". */}
            Odoo · {new Date(generado).toLocaleString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {cargando || !datos ? (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">Cargando las obras…</p>
      ) : datos.vista === "calle" ? (
        <>
          <div className="mt-2.5 grid grid-cols-4 justify-between gap-x-2.5 gap-y-1">
            <Kpi v={datos.armadas} l="armadas" />
            <Kpi v={datos.pendientes} l="pendientes de desarme" />
            <Kpi v={`~${fmtEntero(datos.metrosLineales)}`} l="metros lineales" />
            <Kpi v={datos.vencidas} l="fin estimado vencido" />
          </div>
          <p className="mt-2 font-mono text-[11px] leading-snug text-muted-foreground">
            Hoy · {fmtFecha(hoy)} · {datos.sinUbicacion} sin ubicación en el mapa (ver lista)
          </p>
        </>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-4 justify-between gap-x-2.5 gap-y-1">
            <Kpi v={datos.desarmadas} l="desarmadas" />
            <Kpi v={datos.conUbicacion} l="con ubicación" />
            <Kpi v={datos.diasPromedio} l="días promedio armadas" />
            <Kpi v={datos.enLaCalle} l="en la calle ese día" />
          </div>
          <p className="mt-2 font-mono text-[11px] leading-snug text-muted-foreground">
            Viendo el {fmtFecha(fecha)} · {datos.enLaCalleEnMapa} de {datos.enLaCalle} se ven en el mapa
          </p>
        </>
      )}
    </section>
  );
}

function Kpi({ v, l }: { v: number | string; l: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[22px] font-semibold leading-none tabular-nums max-md:text-lg">{v}</span>
      <span className="block max-w-[12ch] text-[10.5px] leading-tight text-muted-foreground">{l}</span>
    </div>
  );
}
