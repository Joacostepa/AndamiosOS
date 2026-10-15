"use client";

// Cargar un aviso de calidad a mano (lo que no se detecta solo: un arqueo pendiente, un pago
// personal sin conciliar…). POST /api/direccion/datos → direccion_avisos_calidad (Supabase,
// nunca Odoo). Uno reservado sólo lo carga un socio.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDireccion } from "@/components/direccion";
import { DICC } from "@/lib/direccion/diccionario";
import type { NivelAviso } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";

const NIVELES: { id: NivelAviso; texto: string }[] = [
  { id: "ver", texto: "⚠ A verificar" },
  { id: "inc", texto: "◐ Incompleto" },
  { id: "inf", texto: "● Informativo" },
];

export function DialogoAviso({ abierto, onCambio }: { abierto: boolean; onCambio: (v: boolean) => void }) {
  const { conSocios } = useDireccion();
  const router = useRouter();
  const [, empezar] = useTransition();
  const [guardando, setGuardando] = useState(false);
  const [nivel, setNivel] = useState<NivelAviso>("ver");
  const [aviso, setAviso] = useState("");
  const [detalle, setDetalle] = useState("");
  const [que, setQue] = useState("");
  const [quien, setQuien] = useState("");
  const [afecta, setAfecta] = useState<string[]>([]);
  const [reservado, setReservado] = useState(false);
  const indicadores = DICC.filter((d) => !d.reservado || conSocios);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (aviso.trim().length < 3) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/direccion/datos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel, aviso, detalle: detalle || null, que: que || null, quien: quien || null, afecta, reservado }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast(j.error ?? "No se pudo guardar. Probá de nuevo.");
        return;
      }
      toast("Aviso cargado", { description: "Queda registrado quién lo cargó." });
      onCambio(false);
      setAviso(""); setDetalle(""); setQue(""); setQuien(""); setAfecta([]); setReservado(false);
      empezar(() => router.refresh());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={guardar} className="grid gap-3">
          <DialogHeader>
            <DialogTitle>Cargar un aviso de calidad</DialogTitle>
            <DialogDescription>Para lo que Dirección no detecta sola. Se cierra a mano cuando se resuelva en Odoo.</DialogDescription>
          </DialogHeader>
          <div role="group" aria-label="Nivel" className="inline-flex w-fit rounded-md border p-0.5 text-xs">
            {NIVELES.map((n) => (
              <button key={n.id} type="button" aria-pressed={nivel === n.id} onClick={() => setNivel(n.id)} className={cn("min-h-8 rounded px-2.5 font-semibold max-md:min-h-11", nivel === n.id ? "bg-foreground text-background" : "text-muted-foreground")}>
                {n.texto}
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="av-t">Aviso</Label>
            <Input id="av-t" value={aviso} onChange={(e) => setAviso(e.target.value)} maxLength={300} placeholder="p. ej. Caja en dólares sin arqueo de septiembre" className="max-md:h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="av-d">Detalle <span className="font-normal text-muted-foreground">opcional</span></Label>
            <Textarea id="av-d" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={1000} rows={2} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="av-q">Qué hay que hacer</Label>
              <Input id="av-q" value={que} onChange={(e) => setQue(e.target.value)} maxLength={500} className="max-md:h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="av-w">A quién le toca</Label>
              <Input id="av-w" value={quien} onChange={(e) => setQuien(e.target.value)} maxLength={120} placeholder="Administración" className="max-md:h-11" />
            </div>
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Afecta a <span className="font-normal text-muted-foreground">opcional</span></legend>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {indicadores.map((d) => {
                const on = afecta.includes(d.id);
                return (
                  <button key={d.id} type="button" aria-pressed={on} onClick={() => setAfecta((x) => (on ? x.filter((k) => k !== d.id) : [...x, d.id].slice(0, 10)))} className={cn("rounded-full border px-2.5 py-1 text-xs max-md:min-h-11", on ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
                    {d.nombre}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {conSocios && (
            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
              <input type="checkbox" checked={reservado} onChange={(e) => setReservado(e.target.checked)} className="size-4" /> 🔒 Sólo lo ven los socios
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onCambio(false)} className="max-md:h-11">Cancelar</Button>
            <Button type="submit" disabled={guardando || aviso.trim().length < 3} className="max-md:h-11">Cargar aviso</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
