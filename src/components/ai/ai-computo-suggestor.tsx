"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2, Plus } from "lucide-react";

interface SuggestedItem {
  codigo: string;
  descripcion: string;
  cantidad: number;
  motivo: string;
}

interface AIComputoSuggestorProps {
  onAddItems: (items: { codigo: string; cantidad: number }[]) => void;
  catalogoCodigos: string[];
}

function calculateSuggestions(
  sistema: string,
  altura: number,
  metrosLineales: number,
  pisos: number
): SuggestedItem[] {
  const items: SuggestedItem[] = [];

  if (sistema === "multidireccional") {
    // Marcos: 2 por nivel por modulo de 2.5m
    const modulos = Math.ceil(metrosLineales / 2.5);
    const niveles = pisos || Math.ceil(altura / 2);

    items.push({ codigo: "MF-200-MD", descripcion: "Marco 2.00m multidireccional", cantidad: modulos * niveles * 2, motivo: `${modulos} modulos x ${niveles} niveles x 2 marcos` });
    items.push({ codigo: "DG-200-MD", descripcion: "Diagonal 2.00m multidireccional", cantidad: modulos * niveles, motivo: `1 diagonal por modulo por nivel` });
    items.push({ codigo: "PL-073-MD", descripcion: "Plataforma 0.73m x 2.07m", cantidad: modulos * Math.ceil(niveles / 2), motivo: `Plataformas cada 2 niveles` });
    items.push({ codigo: "BS-060-MD", descripcion: "Base regulable 0.60m", cantidad: modulos * 2, motivo: `2 bases por modulo (planta baja)` });
    items.push({ codigo: "BR-200-MD", descripcion: "Barandilla 2.00m", cantidad: modulos * niveles, motivo: `Barandilla perimetral superior` });
    items.push({ codigo: "RP-073-MD", descripcion: "Rodapie 0.73m x 2.07m", cantidad: modulos * Math.ceil(niveles / 2), motivo: `Rodapie en plataformas` });
    items.push({ codigo: "AN-PAR-MD", descripcion: "Anclaje a pared", cantidad: modulos * Math.ceil(niveles / 3), motivo: `Anclaje cada 3 niveles` });
    items.push({ codigo: "ES-200-MD", descripcion: "Escalera interna 2.00m", cantidad: Math.ceil(niveles / 2), motivo: `Acceso cada 2 niveles` });
  } else if (sistema === "tubular") {
    const modulos = Math.ceil(metrosLineales / 2);
    const niveles = pisos || Math.ceil(altura / 2);

    items.push({ codigo: "TB-200-TB", descripcion: "Tubo 2.00m tubular", cantidad: modulos * niveles * 4, motivo: `4 tubos verticales por modulo por nivel` });
    items.push({ codigo: "TB-300-TB", descripcion: "Tubo 3.00m tubular", cantidad: modulos * niveles * 2, motivo: `Travesanos horizontales` });
    items.push({ codigo: "GR-048-TB", descripcion: "Grapa giratoria 48mm", cantidad: modulos * niveles * 6, motivo: `Conexiones de tubos` });
    items.push({ codigo: "GR-FIJ-TB", descripcion: "Grapa fija 48mm", cantidad: modulos * niveles * 4, motivo: `Conexiones fijas` });
    items.push({ codigo: "BS-060-TB", descripcion: "Base regulable tubular", cantidad: modulos * 2, motivo: `Bases en planta baja` });
    items.push({ codigo: "TB-PL-200", descripcion: "Tablon metalico 2.00m", cantidad: modulos * Math.ceil(niveles / 2), motivo: `Plataformas de trabajo` });
  }

  return items;
}

export function AIComputoSuggestor({ onAddItems, catalogoCodigos }: AIComputoSuggestorProps) {
  const [sistema, setSistema] = useState("multidireccional");
  const [altura, setAltura] = useState(10);
  const [metros, setMetros] = useState(20);
  const [pisos, setPisos] = useState(5);
  const [suggestions, setSuggestions] = useState<SuggestedItem[]>([]);
  const [loading, setLoading] = useState(false);

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => {
      const sugs = calculateSuggestions(sistema, altura, metros, pisos);
      setSuggestions(sugs);
      setLoading(false);
    }, 600);
  }

  function handleAddAll() {
    const items = suggestions
      .filter((s) => catalogoCodigos.includes(s.codigo))
      .map((s) => ({ codigo: s.codigo, cantidad: s.cantidad }));
    onAddItems(items);
    setSuggestions([]);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Computo asistido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        <Button onClick={handleGenerate} disabled={loading} variant="outline" className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Calcular piezas necesarias
        </Button>

        {suggestions.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead><TableHead>Descripcion</TableHead>
                  <TableHead>Cantidad</TableHead><TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{s.codigo}</TableCell>
                    <TableCell className="text-sm">{s.descripcion}</TableCell>
                    <TableCell className="font-semibold">{s.cantidad}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.motivo}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
