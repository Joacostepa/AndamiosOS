"use client";

import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useHistorialParametros } from "@/hooks/use-parametros-cotizacion";
import { mostrarValor, type Parametro, type TipoParametro } from "@/lib/parametros-cotizacion/tipos";

// Qué cambió, quién, cuándo y por qué: tarifas, versiones del criterio y listas. Es la
// respuesta a "¿desde cuándo la bandeja está a este precio?".

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function describir(clave: string, antes: Record<string, unknown> | null, despues: Record<string, unknown> | null, parametros: Parametro[]) {
  if (clave === "criterio") {
    return { titulo: "Criterio de cotización", detalle: `versión ${antes?.version ?? "—"} → versión ${despues?.version ?? "—"}` };
  }
  if (clave.startsWith("lista:")) {
    const id = clave.slice(6);
    if (despues && "piezas" in despues) {
      return { titulo: `Lista de alquiler ${id}`, detalle: `nueva, ${despues.piezas} piezas${despues.activada ? ", pasó a vigente" : ""}${despues.origen ? ` (${despues.origen})` : ""}` };
    }
    return { titulo: `Lista de alquiler ${id}`, detalle: `pasó a vigente${antes?.vigente ? ` (antes ${antes.vigente})` : ""}` };
  }
  const p = parametros.find((x) => x.clave === clave);
  const tipo = (p?.tipo ?? "numero") as TipoParametro;
  const fmt = (v: Record<string, unknown> | null) =>
    v
      ? mostrarValor({
          tipo,
          unidad: p?.unidad ?? null,
          valor: (v.valor as number | null) ?? null,
          valor_min: (v.valor_min as number | null) ?? null,
          valor_max: (v.valor_max as number | null) ?? null,
          texto: (v.texto as string | null) ?? null,
        })
      : "—";
  return { titulo: p?.etiqueta ?? clave, detalle: `${fmt(antes)} → ${fmt(despues)}` };
}

export function Historial({ parametros }: { parametros: Parametro[] }) {
  const { data, isLoading, error } = useHistorialParametros();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo leer el historial"}</p>;
  if (data.length === 0) return <EmptyState icon={History} title="Sin cambios todavía" description="Cada cambio de tarifa, criterio o lista va a quedar acá, con quién lo hizo y por qué." />;

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {data.map((c) => {
        const d = describir(c.clave, c.antes, c.despues, parametros);
        return (
          <li key={c.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
            <p className="w-32 shrink-0 text-[12px] text-muted-foreground tabular-nums">{fechaHora(c.created_at)}</p>
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">
                <span className="font-medium">{d.titulo}</span>: <span className="font-mono tabular-nums">{d.detalle}</span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                {c.motivo} · {c.autor ?? "sistema"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
