"use client";

// "¿Quién es del Estado?" (§5.3): la regla por nombre (Ministerio, Garrahan, ANMAT…) marca a
// los organismos públicos; acá se corrige a mano cliente por cliente. Se guarda en Supabase
// (POST /api/direccion/cobranzas/sector), nunca en Odoo. Sin la migración, el servidor
// contesta el mensaje amable y no se rompe nada.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { nombreLindo } from "@/lib/direccion/formato";
import type { ClienteCob } from "@/lib/direccion/calculo/cobranzas";
import type { CambioSector } from "@/lib/direccion/calculo/cobranzas-reglas";
import { cn } from "@/lib/utils";
import { useFormato } from "../contexto";

type Sector = CambioSector["sector"];

export function EditorSector({ clientes, abierto, onCerrar }: { clientes: ClienteCob[]; abierto: boolean; onCerrar: () => void }) {
  const f = useFormato();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cambios, setCambios] = useState<Record<number, Sector>>({});
  const [guardando, setGuardando] = useState(false);
  const [, empezar] = useTransition();

  const lista = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return clientes.filter((c) => c.saldo >= 1 || c.sectorManual).filter((c) => !qn || c.nombre.toLowerCase().includes(qn));
  }, [clientes, q]);

  const actual = (c: ClienteCob): Sector => cambios[c.partnerId] ?? (c.sectorManual ? (c.publico ? "publico" : "privado") : "regla");

  async function guardar() {
    const lista = Object.entries(cambios).map(([id, sector]) => ({ partnerId: Number(id), sector }));
    if (!lista.length) return onCerrar();
    setGuardando(true);
    try {
      const r = await fetch("/api/direccion/cobranzas/sector", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cambios: lista }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast(j.error ?? "No se pudo guardar. Probá de nuevo.");
        return;
      }
      toast("Guardado. Cobranzas se recalcula con la clasificación nueva.");
      onCerrar();
      empezar(() => router.refresh());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>¿Quién es del Estado?</DialogTitle>
          <DialogDescription>
            Por defecto se usa el nombre (Ministerio, Gobierno, Municipalidad, Hospital, ANMAT…). Marcá a mano los que la regla clasifica mal. Se guarda en AndamiosOS, no en Odoo.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Buscar cliente" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="max-md:h-11" />
        <div className="-mx-1 max-h-[50vh] overflow-y-auto px-1">
          {lista.map((c) => {
            const s = actual(c);
            const estado =
              s !== "regla" ? "marcado a mano"
              : c.sectorManual ? "vuelve a la regla por nombre"
              : `por el nombre: ${c.publico ? "Estado" : "privado"}`;
            return (
              <div key={c.partnerId} className="flex items-center gap-2 border-t py-2 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{nombreLindo(c.nombre)}</span>
                  <small className="text-xs text-muted-foreground">
                    {f.mon({ ars: c.saldo })} · {estado}
                  </small>
                </span>
                <span role="group" aria-label={`Sector de ${nombreLindo(c.nombre)}`} className="inline-flex shrink-0 rounded-md border p-0.5 text-xs">
                  {(
                    [
                      ["publico", "Estado"],
                      ["privado", "Privado"],
                      ["regla", "Por nombre"],
                    ] as const
                  ).map(([k, t]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={s === k}
                      onClick={() => setCambios((x) => ({ ...x, [c.partnerId]: k }))}
                      className={cn("min-h-7 rounded px-2 font-semibold max-md:min-h-11", s === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {t}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} className="max-md:h-11">
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || Object.keys(cambios).length === 0} className="max-md:h-11">
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
