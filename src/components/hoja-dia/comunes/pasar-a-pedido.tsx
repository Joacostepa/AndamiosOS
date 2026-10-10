"use client";

// "Pasar a pedido" en el cajón del tablero (§7 "De dónde entran"): un pendiente como
// "RETIRAR 100 TABLONES EN GALVANIZADOS SANZ" se vuelve un pedido de la Hoja del día y el
// pendiente queda tildado. El qué y el dónde se deducen del texto (pedidoDesdeCajon); se
// pueden corregir antes de guardar. El pedido aparece en la cola de Camiones de hoy (o de
// mañana, después de las 15: la fecha la decide el servidor).
//
// Se muestra sólo a quien puede guardarlo (Planificación en editar; el servidor además
// acepta Hoja del día o Pañol). Los lugares salen del día de la hoja: quien no tiene
// "Hoja del día" no lo pide (sería un 403) y escribe el dónde (queda como dirección).

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccionPedido, useHojaDia } from "@/hooks/use-hoja-dia";
import { useAcceso, usePuedeEditar } from "@/components/providers/acceso-provider";
import { nivelEn } from "@/lib/auth/acceso";
import { pedidoDesdeCajon } from "@/lib/hoja-dia/camiones";
import { hoyBA } from "@/lib/panol/estado";
import type { Punto } from "@/lib/hoja-dia/tipos";

export function PasarAPedido({ id, texto }: { id: string; texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const puedePlan = usePuedeEditar("planificacion");
  const puedeHoja = usePuedeEditar("hoja-dia");
  const puede = puedePlan || puedeHoja;
  if (!puede) return null;
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100"
            title="Pasar a pedido (Hoja del día)"
            aria-label={`Pasar a pedido: "${texto}"`}
          />
        }
      >
        <Truck className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {abierto && <Formulario id={id} texto={texto} cerrar={() => setAbierto(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function Formulario({ id, texto, cerrar }: { id: string; texto: string; cerrar: () => void }) {
  const qc = useQueryClient();
  const veHoja = nivelEn(useAcceso(), "hoja-dia") != null;
  const dia = useHojaDia(veHoja ? hoyBA() : null);
  const lugares = useMemo(() => (dia.data?.lugares ?? []).filter((l) => l.activo), [dia.data]);
  const ded = useMemo(() => pedidoDesdeCajon(texto, lugares), [texto, lugares]);
  const [que, setQue] = useState<string | null>(null);
  const [lugarId, setLugarId] = useState<string | null>(null);
  const [dire, setDire] = useState("");
  const pedido = useAccionPedido(null);
  const queEf = que ?? ded.que;
  const lugarEf = lugarId ?? ded.hacia?.lugarId ?? "";
  const hacia: Punto | null = lugarEf ? { otId: null, lugarId: lugarEf, texto: null } : dire.trim() ? { otId: null, lugarId: null, texto: dire.trim() } : null;

  const guardar = () => {
    if (!queEf.trim() || !hacia) return;
    pedido.mutate(
      { accion: "crear", que: queEf.trim(), hacia, cajonPendienteId: id, canal: "cajon", urgencia: "hoy", necesita: "cualquiera" },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ["cajon-planificacion"] });
          cerrar();
        },
      },
    );
  };

  return (
    <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <div className="text-sm font-medium">Pasar a pedido</div>
      <p className="font-mono text-xs break-words text-muted-foreground">{texto}</p>
      <div className="grid gap-1">
        <Label htmlFor={`pp-que-${id}`}>Qué</Label>
        <Input id={`pp-que-${id}`} autoFocus value={queEf} onChange={(e) => setQue(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`pp-donde-${id}`}>Dónde</Label>
        {lugares.length > 0 && (
          <select
            id={`pp-donde-${id}`}
            value={lugarEf}
            onChange={(e) => setLugarId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Otra dirección…</option>
            {lugares.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        )}
        {!lugarEf && (
          <Input
            id={lugares.length ? undefined : `pp-donde-${id}`}
            aria-label={lugares.length ? "Dirección" : undefined}
            placeholder="Dirección"
            value={dire}
            onChange={(e) => setDire(e.target.value)}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">Queda en la cola de Pedidos (Hoja del día · Camiones) y el pendiente se tilda.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cerrar}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={pedido.isPending || !queEf.trim() || !hacia}>Pasar a pedido</Button>
      </div>
    </form>
  );
}
