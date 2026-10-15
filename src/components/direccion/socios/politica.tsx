"use client";

// Formulario de la política de retiros (§5.5): sólo socios con Dirección en "editar". Guarda
// una versión NUEVA en Supabase (direccion_politica_retiros: autor, fecha, versión; nunca se
// pisa la anterior) vía POST /api/direccion/politica. Sin la tabla, el servidor contesta 503
// con un mensaje amable y la pantalla sigue igual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PoliticaRetiros } from "@/lib/direccion/calculo/socios-reglas";

export function DialogoPolitica({ abierto, onCambio, actual }: { abierto: boolean; onCambio: (v: boolean) => void; actual: PoliticaRetiros | null }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [, empezar] = useTransition();
  const [jorge, setJorge] = useState(String(actual?.proporcionJorge ?? 50));
  const [tope, setTope] = useState(actual?.topeResultadoPct != null ? String(actual.topeResultadoPct) : "");
  const [topeCaja, setTopeCaja] = useState(actual?.topeCajaPct != null ? String(actual.topeCajaPct) : "");
  const [frecuencia, setFrecuencia] = useState(actual?.frecuencia ?? "");
  const j = Number(jorge);
  const valida = jorge.trim() !== "" && Number.isFinite(j) && j >= 0 && j <= 100;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valida) return;
    setGuardando(true);
    try {
      const contenido = {
        proporcionJorge: j,
        topeResultadoPct: tope.trim() ? Number(tope) : null,
        topeCajaPct: topeCaja.trim() ? Number(topeCaja) : null,
        frecuencia: frecuencia.trim() || null,
      };
      const r = await fetch("/api/direccion/politica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenido }) });
      const json = (await r.json().catch(() => ({}))) as { error?: string; version?: number };
      if (!r.ok) {
        toast(json.error ?? "No se pudo guardar. Probá de nuevo.");
        return;
      }
      toast("Política de retiros cargada", { description: `Versión ${json.version ?? ""} · queda registrado quién la cargó.` });
      onCambio(false);
      empezar(() => router.refresh());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={guardar} className="grid gap-3">
          <DialogHeader>
            <DialogTitle>Política de retiros</DialogTitle>
            <DialogDescription>Sólo socios. Se guarda con autor, fecha y versión. Con política cargada aparecen &quot;acordado&quot; y &quot;desvío&quot;.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="pol-j">Proporción de Jorge (%) — Gabriel es el resto</Label>
            <Input id="pol-j" type="number" inputMode="decimal" min={0} max={100} step="any" value={jorge} onChange={(e) => setJorge(e.target.value)} aria-invalid={!valida} className="max-md:h-11" />
            {valida && <span className="text-xs text-muted-foreground">Gabriel: {100 - j} %</span>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pol-t">Tope de retiros sobre el resultado (%) <span className="font-normal text-muted-foreground">opcional</span></Label>
            <Input id="pol-t" type="number" inputMode="decimal" min={0} max={100} step="any" placeholder="p. ej. 30" value={tope} onChange={(e) => setTope(e.target.value)} className="max-md:h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pol-c">Tope de retiros sobre la caja generada (%) <span className="font-normal text-muted-foreground">opcional</span></Label>
            <Input id="pol-c" type="number" inputMode="decimal" min={0} max={100} step="any" value={topeCaja} onChange={(e) => setTopeCaja(e.target.value)} className="max-md:h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pol-f">Frecuencia de compensación <span className="font-normal text-muted-foreground">opcional</span></Label>
            <Input id="pol-f" placeholder="p. ej. trimestral" maxLength={60} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className="max-md:h-11" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onCambio(false)} className="max-md:h-11">Cancelar</Button>
            <Button type="submit" disabled={!valida || guardando} className="max-md:h-11">{actual ? "Guardar nueva versión" : "Cargar política"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
