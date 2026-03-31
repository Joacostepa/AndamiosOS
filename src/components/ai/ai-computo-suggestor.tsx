"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCatalogo } from "@/hooks/use-catalogo";

interface SuggestedItem {
  codigo: string;
  cantidad: number;
  motivo: string;
}

interface AIComputoSuggestorProps {
  onAddItems: (items: { codigo: string; cantidad: number }[]) => void;
  catalogoCodigos: string[];
}

export function AIComputoSuggestor({ onAddItems, catalogoCodigos }: AIComputoSuggestorProps) {
  const { data: catalogo } = useCatalogo();
  const [sistema, setSistema] = useState("multidireccional");
  const [altura, setAltura] = useState(10);
  const [metros, setMetros] = useState(20);
  const [pisos, setPisos] = useState(5);
  const [tipoObra, setTipoObra] = useState("fachada");
  const [observaciones, setObservaciones] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/computo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sistema, altura, metros_lineales: metros, pisos,
          tipo_obra: tipoObra, observaciones: observaciones || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else if (data.items && data.items.length > 0) {
        setSuggestions(data.items);
        toast.success(`${data.items.length} piezas calculadas por IA`);
      } else {
        toast.error("No se pudieron calcular las piezas");
      }
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
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Computo asistido por IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Sistema</Label>
            <Select value={sistema} onValueChange={(v) => v && setSistema(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="multidireccional">Multidireccional</SelectItem>
                <SelectItem value="tubular">Tubular</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo obra</Label>
            <Select value={tipoObra} onValueChange={(v) => v && setTipoObra(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fachada">Fachada</SelectItem>
                <SelectItem value="construccion">Construccion</SelectItem>
                <SelectItem value="industria">Industrial</SelectItem>
                <SelectItem value="evento">Evento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Altura (m)</Label>
            <Input type="number" value={altura} onChange={(e) => setAltura(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metros lineales</Label>
            <Input type="number" value={metros} onChange={(e) => setMetros(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pisos</Label>
            <Input type="number" value={pisos} onChange={(e) => setPisos(Number(e.target.value))} />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Observaciones (opcional)</Label>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            placeholder="Ej: acceso dificil, terreno irregular, andamio perimetral completo..."
          />
        </div>

        <Button onClick={handleGenerate} disabled={loading} variant="outline" className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? "Calculando con IA..." : "Calcular piezas con IA"}
        </Button>

        {suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{suggestions.length} tipos de pieza, {totalPiezas} unidades totales</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Codigo</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
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
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSuggestions([])}>Descartar</Button>
              <Button size="sm" onClick={handleAddAll}>
                <Plus className="mr-2 h-4 w-4" />Agregar todas al computo
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
