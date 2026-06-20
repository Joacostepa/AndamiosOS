"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useObras } from "@/hooks/use-obras";
import { useCatalogo } from "@/hooks/use-catalogo";
import { useStock } from "@/hooks/use-stock";
import { useCreateComputo } from "@/hooks/use-computos";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AIComputoSuggestor } from "@/components/ai/ai-computo-suggestor";

type ItemRow = {
  pieza_id: string; codigo: string; descripcion: string; categoria: string;
  cantidad_requerida: number; stock_disponible: number;
};

function NuevoComputoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: obras } = useObras();
  const { data: catalogo } = useCatalogo();
  const { data: stock } = useStock();
  const createComputo = useCreateComputo();

  const preObra = searchParams.get("obra") ?? "";
  const [obraId, setObraId] = useState(preObra);
  // Parámetros de obra — un solo lugar; alimentan la carga manual Y la IA.
  const [sistema, setSistema] = useState("multidireccional");
  const [tipoObra, setTipoObra] = useState("fachada");
  const [altura, setAltura] = useState("");
  const [metros, setMetros] = useState("");
  const [superficie, setSuperficie] = useState("");
  const [pisos, setPisos] = useState("");
  const [obsTecnicas, setObsTecnicas] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedPieza, setSelectedPieza] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const obraSel = obras?.find((o) => o.id === obraId);
  const obraFijada = !!preObra;

  const stockDe = (id: string) => stock?.find((s) => s.pieza_id === id)?.en_deposito ?? 0;

  function upsertItem(pieza: { id: string; codigo: string; descripcion: string; categoria: string }, qty: number, sumar: boolean) {
    setItems((prev) => {
      const ex = prev.find((i) => i.pieza_id === pieza.id);
      if (ex) return prev.map((i) => i.pieza_id === pieza.id ? { ...i, cantidad_requerida: sumar ? i.cantidad_requerida + qty : qty } : i);
      return [...prev, { pieza_id: pieza.id, codigo: pieza.codigo, descripcion: pieza.descripcion, categoria: pieza.categoria, cantidad_requerida: qty, stock_disponible: stockDe(pieza.id) }];
    });
  }

  function addManual() {
    const pieza = catalogo?.find((p) => p.id === selectedPieza);
    if (!pieza || cantidad < 1) return;
    upsertItem(pieza, cantidad, true);
    setSelectedPieza(""); setCantidad(1);
  }

  function addFromAI(suggested: { codigo: string; cantidad: number }[]) {
    suggested.forEach((s) => {
      const pieza = catalogo?.find((p) => p.codigo === s.codigo);
      if (pieza) upsertItem(pieza, s.cantidad, false);
    });
    toast.success(`${suggested.length} piezas agregadas`);
  }

  function handleSubmit() {
    if (!obraId) { toast.error("Seleccioná una obra"); return; }
    if (items.length === 0) { toast.error("Agregá al menos una pieza"); return; }
    createComputo.mutate({
      obra_id: obraId,
      tipo_sistema_andamio: sistema || undefined,
      altura_maxima: altura ? Number(altura) : undefined,
      metros_lineales: metros ? Number(metros) : undefined,
      superficie: superficie ? Number(superficie) : undefined,
      observaciones_tecnicas: obsTecnicas || undefined,
      items: items.map((i) => ({ pieza_id: i.pieza_id, cantidad_requerida: i.cantidad_requerida })),
    }, {
      onSuccess: () => { toast.success("Cómputo creado"); router.push("/oficina-tecnica/computos"); },
      onError: () => toast.error("Error al crear el cómputo"),
    });
  }

  const totalUnidades = items.reduce((s, i) => s + i.cantidad_requerida, 0);
  const conFaltante = items.filter((i) => i.cantidad_requerida > i.stock_disponible).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo cómputo de materiales" description={obraSel ? `${obraSel.codigo} · ${obraSel.nombre}` : "Cómputo madre de la obra"} />

      {/* Paso 1 — Obra y parámetros */}
      <Card>
        <CardHeader><CardTitle className="text-base">1 · Obra y parámetros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {obraFijada && obraSel ? (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Obra</p>
                <p className="font-medium">{obraSel.codigo} — {obraSel.nombre}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-w-md">
              <Label>Obra *</Label>
              <Select value={obraId} onValueChange={(v) => v && setObraId(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.filter((o) => o.estado !== "cancelada").map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Sistema</Label>
              <Select value={sistema} onValueChange={(v) => v && setSistema(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multidireccional">Multidireccional</SelectItem>
                  <SelectItem value="tubular">Tubular</SelectItem>
                  <SelectItem value="colgante">Colgante</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de obra</Label>
              <Select value={tipoObra} onValueChange={(v) => v && setTipoObra(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fachada">Fachada</SelectItem>
                  <SelectItem value="construccion">Construcción</SelectItem>
                  <SelectItem value="industria">Industrial</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Altura máx (m)</Label><Input type="number" step="0.01" value={altura} onChange={(e) => setAltura(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Metros lineales</Label><Input type="number" step="0.01" value={metros} onChange={(e) => setMetros(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Superficie (m²)</Label><Input type="number" step="0.01" value={superficie} onChange={(e) => setSuperficie(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Pisos</Label><Input type="number" value={pisos} onChange={(e) => setPisos(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observaciones técnicas</Label>
            <Textarea value={obsTecnicas} onChange={(e) => setObsTecnicas(e.target.value)} rows={2} placeholder="Acceso difícil, terreno irregular, andamio perimetral completo…" />
          </div>
        </CardContent>
      </Card>

      {/* Paso 2 — Generar la lista de materiales */}
      <Card>
        <CardHeader><CardTitle className="text-base">2 · Generar la lista de materiales</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <AIComputoSuggestor
            params={{ sistema, tipoObra, altura: Number(altura) || 0, metros: Number(metros) || 0, pisos: Number(pisos) || 0, observaciones: obsTecnicas }}
            catalogoCodigos={catalogo?.map((p) => p.codigo) || []}
            onAddItems={addFromAI}
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <Label className="text-xs">Agregar pieza manual</Label>
              <Select value={selectedPieza} onValueChange={(v) => v && setSelectedPieza(v)}>
                <SelectTrigger><SelectValue placeholder="Buscar pieza..." /></SelectTrigger>
                <SelectContent>
                  {catalogo?.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-mono text-xs">{p.codigo}</span> — {p.descripcion} <span className="text-muted-foreground">(disp: {stockDe(p.id)})</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1.5"><Label className="text-xs">Cantidad</Label><Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} /></div>
            <Button type="button" variant="outline" onClick={addManual}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Paso 3 — Ítems */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            3 · Ítems del cómputo
            {items.length > 0 && <>
              <Badge variant="outline">{items.length} piezas</Badge>
              <Badge variant="outline">{totalUnidades} unidades</Badge>
              {conFaltante > 0 && <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/25">{conFaltante} con faltante</Badge>}
            </>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Requerido</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const falta = item.cantidad_requerida > item.stock_disponible;
                  return (
                    <TableRow key={item.pieza_id}>
                      <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell>{item.descripcion}</TableCell>
                      <TableCell className="capitalize">{item.categoria}</TableCell>
                      <TableCell className="text-right font-semibold">{item.cantidad_requerida}</TableCell>
                      <TableCell className={`text-right ${falta ? "text-red-400" : ""}`}>{item.stock_disponible}</TableCell>
                      <TableCell>
                        {falta
                          ? <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/25 gap-1"><AlertTriangle className="h-3 w-3" />Falta {item.cantidad_requerida - item.stock_disponible}</Badge>
                          : <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 gap-1"><CheckCircle className="h-3 w-3" />OK</Badge>}
                      </TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((i) => i.pieza_id !== item.pieza_id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Generá la lista con IA o agregá piezas a mano.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createComputo.isPending} size="lg">
          {createComputo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear cómputo
        </Button>
      </div>
    </div>
  );
}

export default function NuevoComputoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Cargando…</div>}>
      <NuevoComputoForm />
    </Suspense>
  );
}
