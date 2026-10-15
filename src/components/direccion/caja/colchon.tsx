"use client";

// Editar el colchón mínimo de caja (✎). Lo fija alguien con Dirección "editar"; se guarda en
// Supabase (POST /api/direccion/minimo → direccion_config), nunca en Odoo. "Volver al
// sugerido" borra el valor propio (guarda 0) y la pantalla vuelve a 1 mes de sueldos.
// Si la migración todavía no está aplicada, la API contesta 503 con un mensaje amable y se
// muestra acá, sin romper nada.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormato } from "../contexto";

type Props = {
  colchonArs: number;
  sugeridoArs: number;
  supuestos: { sueldosMes: number; cargasMes: number; noRegistradosMes: number };
};

export function EditarColchon({ colchonArs, sugeridoArs, supuestos }: Props) {
  const f = useFormato();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [, empezar] = useTransition();
  const enUsd = f.moneda === "USD" && !!f.tc;

  const abrir = () => {
    setError(null);
    setTexto(enUsd ? String(Math.round(colchonArs / f.tc!.valor)) : String(Math.round(colchonArs / 1e5) / 10));
    setAbierto(true);
  };

  async function guardar(ars: number) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/direccion/minimo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colchonMinimoArs: ars }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(j.error ?? "No se pudo guardar. Probá de nuevo.");
        return;
      }
      setAbierto(false);
      empezar(() => router.refresh());
    } catch {
      setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(texto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Escribí un número mayor que cero.");
      return;
    }
    void guardar(enUsd ? Math.round(n * f.tc!.valor) : Math.round(n * 1e6));
  };

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={abrir} aria-label="Cambiar el colchón mínimo" className="max-md:size-11">
        <Pencil />
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={enviar} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Colchón mínimo de caja en pesos</DialogTitle>
              <DialogDescription>
                El colchón lo fija un socio. Sugerido: un mes de sueldos (registrados {f.mon({ ars: supuestos.sueldosMes })} + cargas {f.mon({ ars: supuestos.cargasMes })} + no registrados y contratistas{" "}
                {f.mon({ ars: supuestos.noRegistradosMes })}) = {f.mon({ ars: sugeridoArs })}. Queda registrado quién lo cambió.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="colchon-v">Colchón mínimo ({enUsd ? "en USD" : "en millones de pesos"})</Label>
              <Input id="colchon-v" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus className="max-md:h-11" />
            </div>
            {error && <p role="alert" className="text-[13px] text-(--dir-aten)">{error}</p>}
            <DialogFooter className="gap-2">
              {sugeridoArs > 0 && (
                <Button type="button" variant="outline" disabled={guardando} onClick={() => void guardar(0)} className="max-md:h-11">
                  Volver al sugerido
                </Button>
              )}
              <Button type="button" variant="outline" disabled={guardando} onClick={() => setAbierto(false)} className="max-md:h-11">
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} className="max-md:h-11">
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
