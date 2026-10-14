"use client";

// Encabezado de la Hoja del día, compartido por Cuadrillas y Camiones:
//   Hoja del día  [Cuadrillas | Camiones]  ‹ [Hoy · mar 13] [Mañana · mié 14] ›  …acciones de la vista
// El día va en `?dia=` y se conserva al cambiar de vista. Las acciones las pone cada vista
// con <AccionesHoja> (el hueco de la derecha).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { diaSemana } from "@/lib/hoja-dia/estado";
import type { Fecha } from "@/lib/hoja-dia/tipos";
import { useRefHueco } from "./acciones-hoja";
import { PestanasPlanificacion } from "./pestanas-planificacion";
import { useDiaHoja } from "./use-dia-hoja";

const RUTA_CUADRILLAS = "/planificacion/hoja";
const RUTA_CAMIONES = "/planificacion/hoja/camiones";

/** "mar 13" */
export const diaCorto = (f: Fecha) => `${diaSemana(f).slice(0, 3)} ${Number(f.slice(8, 10))}`;

export function EncabezadoHoja() {
  const pathname = usePathname();
  const { fecha, hoy, manana, anterior, siguiente, irA, hrefCon, montado } = useDiaHoja();
  const refHueco = useRefHueco();
  const enCamiones = pathname.startsWith(RUTA_CAMIONES);
  const tabs: { f: Fecha; l: string }[] = [
    { f: hoy, l: "Hoy" },
    { f: manana, l: "Mañana" },
  ];
  const fuera = fecha !== hoy && fecha !== manana;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
      <PestanasPlanificacion />
      <h1 className="hidden text-[17px] font-semibold whitespace-nowrap md:block">Hoja del día</h1>

      <nav aria-label="Vista" className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]">
        {[
          { href: RUTA_CUADRILLAS, l: "Cuadrillas", on: !enCamiones },
          { href: RUTA_CAMIONES, l: "Camiones", on: enCamiones },
        ].map((t) => (
          <Link
            key={t.href}
            href={montado ? hrefCon(t.href) : t.href}
            aria-current={t.on ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              t.on && "bg-card text-foreground shadow-xs",
            )}
          >
            {t.l}
          </Link>
        ))}
      </nav>

      {/* El día depende del reloj: se dibuja ya montado (si no, el del servidor y el del
          navegador pueden no coincidir al hidratar). Mientras, el lugar queda reservado. */}
      {!montado ? <div className="h-[30px] w-[260px]" aria-hidden /> : (
      <div className="inline-flex items-center gap-1" role="group" aria-label="Día">
        <BotonFlecha onClick={() => irA(anterior)} label="Día anterior">
          <ChevronLeft className="size-4" />
        </BotonFlecha>
        {tabs.map((t) => (
          <button
            key={t.l}
            type="button"
            onClick={() => irA(t.f)}
            aria-current={t.f === fecha ? "date" : undefined}
            className={cn(
              "h-[30px] rounded-lg border px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              t.f === fecha && "border-foreground/25 bg-card text-foreground",
            )}
          >
            <span className={cn(t.l === "Hoy" && "font-semibold text-primary")}>{t.l}</span> · {diaCorto(t.f)}
          </button>
        ))}
        {fuera && (
          <span
            aria-current="date"
            className="inline-flex h-[30px] items-center rounded-lg border border-foreground/25 bg-card px-2.5 text-[13px] font-medium whitespace-nowrap"
          >
            {diaCorto(fecha).replace(/^./, (c) => c.toUpperCase())}
          </span>
        )}
        <BotonFlecha onClick={() => irA(siguiente)} label="Día siguiente">
          <ChevronRight className="size-4" />
        </BotonFlecha>
      </div>
      )}

      {/* El hueco de cada vista (resumen + botones). En el celular ocupa la fila entera. */}
      <div ref={refHueco} className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-1" />
    </div>
  );
}

function BotonFlecha({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-[30px] place-items-center rounded-lg border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}
