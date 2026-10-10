"use client";

// El historial de una hoja (o de un viaje o un pedido): qué se cambió, quién y cuándo, con
// "Deshacer" en lo que todavía se puede deshacer.

import { useHistorialHoja, useDeshacer } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { HojaLateral } from "./hoja-lateral";

const hora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function Historial({
  abierta,
  onCerrar,
  titulo,
  fecha,
  filtro,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  fecha: string;
  filtro: { hojaId?: string; viajeId?: string; pedidoId?: string } | null;
}) {
  const h = useHistorialHoja(abierta && filtro ? { fecha, ...filtro } : null);
  const deshacer = useDeshacer(fecha);
  const filas = h.data?.historial ?? [];
  return (
    <HojaLateral abierta={abierta} onCerrar={onCerrar} titulo={titulo} sub="Lo que se cambió, de lo último a lo primero. Lo que cambió alguien después no se puede deshacer.">
      {h.isLoading && <p className="text-[13px] text-muted-foreground">Cargando…</p>}
      {h.isError && <p className="text-[13px] text-hd-rojo">No se pudo leer el historial: {(h.error as Error).message}</p>}
      {!h.isLoading && !filas.length && !h.isError && <p className="text-[13px] text-muted-foreground">Todavía no hay cambios.</p>}
      <ol className="grid gap-1">
        {filas.map((x) => (
          <li key={x.id} className="flex flex-wrap items-baseline gap-2 border-b py-1.5 text-[13px] last:border-b-0">
            <span className="w-[84px] shrink-0 text-xs text-muted-foreground tabular-nums">{hora(x.at)}</span>
            <span className={x.deshecho_at ? "min-w-0 flex-1 text-muted-foreground line-through" : "min-w-0 flex-1"}>
              {x.texto}
              {x.por_texto && <span className="text-muted-foreground"> · {x.por_texto}</span>}
            </span>
            {!x.deshecho_at && (
              <Button size="xs" variant="ghost" onClick={() => deshacer.mutate(x.id)}>
                Deshacer
              </Button>
            )}
          </li>
        ))}
      </ol>
    </HojaLateral>
  );
}
