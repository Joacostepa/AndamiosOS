import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { haceCuanto } from "@/lib/permisos-via-publica/estado";
import type { FilaPermiso } from "@/lib/permisos-via-publica/lista";
import { Chip, Linea, type TonoChip } from "./ui";
import { BOTON, LO_TIENE, teTocaA } from "./textos";

// Una fila de la lista de permisos (rediseño 09/10): dónde, de quién, la línea de 7 etapas, en qué
// está, quién lo tiene y hace cuánto, y —si le toca a la oficina— a quién y el botón. El botón
// lleva a la ficha: ahí están los datos que salen y la confirmación.

export function FilaPermisoView({ f, ahora, extra }: { f: FilaPermiso; ahora: number; extra?: React.ReactNode }) {
  const e = f.estado;
  const principal = f.acciones[0];
  const desde = principal?.desde ?? e.desde;
  const demora = e.demora;
  const tonoTiempo: TonoChip = demora === "muy" ? "bloqueo" : demora === "tarde" ? "aviso" : e.loTiene && e.loTiene !== "Oficina" ? "marcha" : "neutro";
  const linea2 = [e.titulo, e.grupo === "gobierno" || e.grupo === "esperando" ? e.estimado : null].filter(Boolean).join(" · ");

  return (
    <li className="border-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3">
        <div className="min-w-0 flex-[999_1_20rem] space-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link href={f.href} className="rounded-sm text-[14px] font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {f.direccion}
            </Link>
            {f.esPrueba && <Chip tono="prueba" sinIcono>Prueba</Chip>}
            {(f.venta || f.expediente) && (
              <span className="font-mono text-[12px] text-muted-foreground">{[f.venta, f.expediente].filter(Boolean).join(" · ")}</span>
            )}
            {f.vendedora && <span className="text-[12px] text-muted-foreground">Vendió: {f.vendedora.corto}</span>}
          </p>
          <p className={cn("text-[13px]", e.tono === "bloqueo" ? "text-foreground" : "text-foreground/80")}>{linea2}</p>
          {f.acciones.length > 0 && (
            <ul className="space-y-0.5">
              {f.acciones.slice(0, 2).map((a) => (
                <li key={a.clave} className="text-[12.5px]">
                  <span className="font-semibold">{teTocaA(a.persona?.corto)}</span>
                  <span className="text-foreground/80"> — {a.titulo}</span>
                </li>
              ))}
            </ul>
          )}
          {e.motivo && e.tono === "bloqueo" && (
            <p className="line-clamp-2 rounded bg-red-500/10 px-2 py-1 text-[12px] text-red-800 dark:text-red-200">{e.motivo}</p>
          )}
        </div>
        <div className="flex-[0_0_11rem]">
          <Linea etapas={e.etapas} compacta />
        </div>
        <div className="flex flex-[1_1_12rem] flex-wrap items-center gap-1.5">
          {principal && <Chip tono="toca" sinIcono>{teTocaA(principal.persona?.corto)}</Chip>}
          {(e.loTiene || desde) && (
            <Chip tono={tonoTiempo}>
              {[e.loTiene && e.loTiene !== "Oficina" ? `Lo tiene: ${LO_TIENE[e.loTiene]}` : null, desde ? haceCuanto(desde, ahora).replace("hace ", "") : null].filter(Boolean).join(" · ")}
            </Chip>
          )}
        </div>
        {principal && (
          <Link
            href={`${f.href}#estado`}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border bg-background px-3 text-[13px] font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-sm:h-10"
          >
            {BOTON[principal.clave]} <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
      {extra}
    </li>
  );
}
