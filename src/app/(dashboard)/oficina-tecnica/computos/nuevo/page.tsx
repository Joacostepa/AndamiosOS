"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProyectos } from "@/hooks/use-proyectos";
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
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

type ItemRow = {
  pieza_id: string;
  codigo: string;
  descripcion: string;
  categoria: string;
  cantidad_requerida: number;
  stock_disponible: number;
  stock_minimo: number;
};

export default function NuevoComputoPage() {
  const router = useRouter();
  const { data: proyectos } = useProyectos();
  const { data: catalogo } = useCatalogo();
  const { data: stock } = useStock();
  const createComputo = useCreateComputo();

  const [proyectoId, setProyectoId] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedPieza, setSelectedPieza] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const proyectosAptos = proyectos?.filter((p) =>
    ["aprobado", "en_curso", "en_revision"].includes(p.estado)
  );

  function getStockDisponible(piezaId: string) {
    const s = stock?.find((s) => s.pieza_id === piezaId);
    return s ? s.en_deposito : 0;
  }

  function getStockMinimo(piezaId: string) {
    const s = stock?.find((s) => s.pieza_id === piezaId);
    return s ? s.catalogo_piezas.stock_minimo : 0;
  }

  function addItem() {
    if (!selectedPieza || cantidad < 1) return;
    const pieza = catalogo?.find((p) => p.id === selectedPieza);
    if (!pieza) return;

    const existing = items.find((i) => i.pieza_id === selectedPieza);
    if (existing) {
      setItems(items.map((i) =>
        i.pieza_id === selectedPieza ? { ...i, cantidad_requerida: i.cantidad_requerida + cantidad } : i
      ));
    } else {
      setItems([...items, {
        pieza_id: pieza.id,
        codigo: pieza.codigo,
        descripcion: pieza.descripcion,
        categoria: pieza.categoria,
        cantidad_requerida: cantidad,
        stock_disponible: getStockDisponible(pieza.id),
        stock_minimo: getStockMinimo(pieza.id),
      }]);
    }
    setSelectedPieza("");
    setCantidad(1);
  }

  function removeItem(piezaId: string) {
    setItems(items.filter((i) => i.pieza_id !== piezaId));
  }

  function handleSubmit() {
    if (!proyectoId) { toast.error("Selecciona un proyecto"); return; }
    if (items.length === 0) { toast.error("Agrega al menos una pieza"); return; }

    createComputo.mutate(
      {
        proyecto_tecnico_id: proyectoId,
        notas: notas || undefined,
        items: items.map((i) => ({ pieza_id: i.pieza_id, cantidad_requerida: i.cantidad_requerida })),
      },
      {
        onSuccess: () => {
          toast.success("Computo creado correctamente");
          router.push("/oficina-tecnica/computos");
        },
        onError: () => toast.error("Error al crear el computo"),
      }
    );
  }

  const totalPiezas = items.reduce((sum, i) => sum + i.cantidad_requerida, 0);
  const itemsConFaltante = items.filter((i) => i.cantidad_requerida > i.stock_disponible);

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo Computo de Materiales" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del computo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Proyecto tecnico *</Label>
              <Select value={proyectoId} onValueChange={(val) => val && setProyectoId(val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proyecto..." /></SelectTrigger>
                <SelectContent>
                  {proyectosAptos?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} — {p.obras?.nombre || "Sin obra"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Observaciones sobre el computo..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Agregar piezas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pieza</Label>
              <Select value={selectedPieza} onValueChange={(val) => val && setSelectedPieza(val)}>
                <SelectTrigger><SelectValue placeholder="Buscar pieza..." /></SelectTrigger>
                <SelectContent>
                  {catalogo?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.codigo}</span> — {p.descripcion}
                      <span className="text-muted-foreground ml-2">(disp: {getStockDisponible(p.id)})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label>Cantidad</Label>
                <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={addItem} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />Agregar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Piezas unicas</p>
            <p className="text-2xl font-bold">{items.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total unidades</p>
            <p className="text-2xl font-bold">{totalPiezas}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Con faltante</p>
            <p className={`text-2xl font-bold ${itemsConFaltante.length > 0 ? "text-red-400" : "text-green-400"}`}>
              {itemsConFaltante.length}
            </p>
          </div>
        </div>
      )}

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items del computo ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Requerido</TableHead>
                  <TableHead>Disponible</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const faltante = item.cantidad_requerida > item.stock_disponible;
                  return (
                    <TableRow key={item.pieza_id}>
                      <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                      <TableCell>{item.descripcion}</TableCell>
                      <TableCell className="capitalize">{item.categoria}</TableCell>
                      <TableCell className="font-semibold">{item.cantidad_requerida}</TableCell>
                      <TableCell className={faltante ? "text-red-400" : ""}>{item.stock_disponible}</TableCell>
                      <TableCell>
                        {faltante ? (
                          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/25">
                            <AlertTriangle className="mr-1 h-3 w-3" />Faltante: {item.cantidad_requerida - item.stock_disponible}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                            <CheckCircle className="mr-1 h-3 w-3" />OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.pieza_id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">Agrega piezas al computo</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createComputo.isPending} size="lg">
          {createComputo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear computo
        </Button>
      </div>
    </div>
  );
}
