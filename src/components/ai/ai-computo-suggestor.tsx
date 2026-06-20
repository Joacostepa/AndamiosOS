"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCatalogo } from "@/hooks/use-catalogo";

interface SuggestedItem {
  codigo: string;
  cantidad: number;
  motivo: string;
}

// Los parámetros vienen de la página (un solo lugar) — no se vuelven a pedir acá.
export interface ComputoParams {
  sistema: string;
  tipoObra: string;
  altura: number;
  metros: number;
  pisos: number;
  observaciones?: string;
}

interface AIComputoSuggestorProps {
  onAddItems: (items: { codigo: string; cantidad: number }[]) => void;
  catalogoCodigos: string[];
  params: ComputoParams;
}

export function AIComputoSuggestor({ onAddItems, catalogoCodigos, params }: AIComputoSuggestorProps) {
  const { data: catalogo } = useCatalogo();
  const [suggestions, setSuggestions] = useState<SuggestedItem[]>([]);
  const [loading, setLoading] = useState(false);

  const faltanDatos = !params.altura || !params.metros;

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/computo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sistema: params.sistema, altura: params.altura, metros_lineales: params.metros,
          pisos: params.pisos, tipo_obra: params.tipoObra,
          observaciones: params.observaciones || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else if (data.items?.length > 0) {
        setSuggestions(data.items);
        toast.success(`${data.items.length} piezas calculadas por IA`);
      } else toast.error("No se pudieron calcular las piezas");
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  function handleAddAll() {
    const items = suggestions
      .filter((s) => catalogoCodigos.includes(s.codigo))
      .map((s) => ({ codigo: s.codigo, cantidad: s.cantidad }));
    if (items.length < suggestions.length) {
      toast.warning(`${suggestions.length - items.length} piezas no encontradas en el catalogo`);
    }
    onAddItems(items);
    setSuggestions([]);
  }

  const totalPiezas = suggestions.reduce((s, i) => s + i.cantidad, 0);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-medium">Calcular con IA</span>
        <span className="text-xs text-muted-foreground">usa los parámetros de arriba</span>
      </div>

      <Button onClick={handleGenerate} disabled={loading || faltanDatos} variant="outline" className="w-full">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {loading ? "Calculando…" : faltanDatos ? "Cargá altura y metros lineales para calcular" : "Calcular piezas con IA"}
      </Button>

      {suggestions.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{suggestions.length} tipos de pieza · {totalPiezas} unidades</p>
          <div className="max-h-[300px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Cant.</TableHead><TableHead>Motivo</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s, i) => {
                  const pieza = catalogo?.find((p) => p.codigo === s.codigo);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{s.codigo}</TableCell>
                      <TableCell className="text-sm">{pieza?.descripcion || "—"}</TableCell>
                      <TableCell className="font-semibold">{s.cantidad}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.motivo}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSuggestions([])}>Descartar</Button>
            <Button size="sm" onClick={handleAddAll}><Plus className="mr-2 h-4 w-4" />Agregar todas</Button>
          </div>
        </>
      )}
    </div>
  );
}
