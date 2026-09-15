"use client";

import { useState } from "react";
import { FileCog, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGenerarDocumentos } from "@/hooks/use-permisos-via-publica";

// "Generar informe técnico y croquis": con las medidas de la venta de Odoo. Un trámite sin
// venta (el de prueba) las pide acá.

const TIPOS = [
  { valor: "pantalla", texto: "Pantalla de protección" },
  { valor: "estructura_pantalla", texto: "Estructura + pantalla" },
  { valor: "estructura", texto: "Estructura sin pantalla" },
  { valor: "torre", texto: "Torre" },
];

export function GenerarDocumentos({ tramiteId, conVenta }: { tramiteId: string; conVenta: boolean }) {
  const generar = useGenerarDocumentos(tramiteId);
  const [tipo, setTipo] = useState("pantalla");
  const [base, setBase] = useState("");
  const [alto, setAlto] = useState("");
  const esPantalla = tipo === "pantalla";

  function lanzar() {
    const medidas = conVenta ? null : { tipo, base: Number(base.replace(",", ".")), alto: esPantalla ? 3 : Number(alto.replace(",", ".")) };
    generar.mutate(medidas, {
      onSuccess: (r) =>
        r.plancheta
          ? toast.success(`Informe técnico y croquis generados (parcela ${r.smp})`)
          : toast.warning("Documentos generados, pero sin plancheta: no se encontró la manzana en el catastro"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudieron generar"),
    });
  }

  return (
    <section className="space-y-2 rounded-md border p-3 text-[13px]">
      <h3 className="font-semibold">Informe técnico y croquis</h3>
      <p className="text-muted-foreground">
        {conVenta
          ? "Se arman con lo que dice la venta en «Trabajo a ejecutar» (qué se arma y sus medidas) y la plancheta del catastro de la Ciudad."
          : "Este trámite no tiene venta: indicá qué se arma y sus medidas."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {!conVenta && (
          <>
            <label className="grid gap-1">
              <span className="text-[12px] text-muted-foreground">Qué se arma</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 rounded-md border bg-background px-2">
                {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] text-muted-foreground">{esPantalla ? "Metros lineales" : "Base (m)"}</span>
              <Input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className="h-8 w-24" />
            </label>
            {!esPantalla && (
              <label className="grid gap-1">
                <span className="text-[12px] text-muted-foreground">Altura (m)</span>
                <Input value={alto} onChange={(e) => setAlto(e.target.value)} inputMode="decimal" className="h-8 w-24" />
              </label>
            )}
          </>
        )}
        <Button size="sm" onClick={lanzar} disabled={generar.isPending || (!conVenta && (!base || (!esPantalla && !alto)))}>
          {generar.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileCog className="size-4" />}
          {generar.isPending ? "Generando… (puede tardar un minuto)" : "Generar informe técnico y croquis"}
        </Button>
      </div>
    </section>
  );
}
