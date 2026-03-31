"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClientes } from "@/hooks/use-clientes";
import { useOportunidades } from "@/hooks/use-oportunidades";
import { useCreateCotizacion } from "@/hooks/use-cotizaciones";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TIPO_ITEM_LABELS: Record<string, string> = {
  alquiler_mensual: "Alquiler mensual", montaje: "Montaje", desarme: "Desarme",
  transporte: "Transporte", permiso: "Permiso", ingenieria: "Ingenieria",
  extra: "Extra", descuento: "Descuento",
};

type ItemRow = { tipo: string; concepto: string; detalle: string; cantidad: number; unidad: string; precio_unitario: number };

export default function NuevaCotizacionPage() {
  return <Suspense><NuevaCotizacionContent /></Suspense>;
}

function NuevaCotizacionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: clientes } = useClientes();
  const { data: oportunidades } = useOportunidades();
  const createCotizacion = useCreateCotizacion();

  const [clienteId, setClienteId] = useState("");
  const [oportunidadId, setOportunidadId] = useState(searchParams.get("oportunidad") || "");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [condiciones, setCondiciones] = useState("- Precios expresados en pesos argentinos + IVA\n- Plazo de validez: 30 dias\n- No incluye permisos municipales salvo indicacion expresa");
  const [condicionPago, setCondicionPago] = useState("");
  const [plazoMeses, setPlazoMeses] = useState(1);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [newItem, setNewItem] = useState<ItemRow>({ tipo: "alquiler_mensual", concepto: "", detalle: "", cantidad: 1, unidad: "mes", precio_unitario: 0 });

  function addItem() {
    if (!newItem.concepto || newItem.precio_unitario <= 0) { toast.error("Completa concepto y precio"); return; }
    setItems([...items, { ...newItem }]);
    setNewItem({ tipo: "alquiler_mensual", concepto: "", detalle: "", cantidad: 1, unidad: "mes", precio_unitario: 0 });
  }

  const subtotal = items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  function handleSubmit() {
    if (!titulo) { toast.error("El titulo es obligatorio"); return; }
    if (items.length === 0) { toast.error("Agrega al menos un item"); return; }

    createCotizacion.mutate({
      titulo,
      cliente_id: clienteId || undefined,
      oportunidad_id: oportunidadId || undefined,
      descripcion_servicio: descripcion || undefined,
      condiciones: condiciones || undefined,
      condicion_pago: condicionPago || undefined,
      plazo_alquiler_meses: plazoMeses,
      items: items.map((i) => ({ tipo: i.tipo, concepto: i.concepto, detalle: i.detalle || undefined, cantidad: i.cantidad, unidad: i.unidad, precio_unitario: i.precio_unitario })),
    }, {
      onSuccess: (cot) => { toast.success(`Cotizacion ${cot.codigo} creada`); router.push(`/comercial/cotizaciones/${cot.id}`); },
      onError: () => toast.error("Error al crear cotizacion"),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nueva Cotizacion" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos generales</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Titulo *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Cotizacion andamio fachada Av. Corrientes" /></div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => v && setClienteId(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                <SelectContent>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Oportunidad</Label>
              <Select value={oportunidadId} onValueChange={(v) => v && setOportunidadId(v)}>
                <SelectTrigger><SelectValue placeholder="Vincular a oportunidad..." /></SelectTrigger>
                <SelectContent>{oportunidades?.map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.titulo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Condicion de pago</Label><Input value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)} placeholder="Ej: 50% anticipo, 50% contra entrega" /></div>
              <div className="space-y-2"><Label>Plazo alquiler (meses)</Label><Input type="number" min={1} value={plazoMeses} onChange={(e) => setPlazoMeses(Number(e.target.value))} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Descripcion y condiciones</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Descripcion del servicio</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} placeholder="Descripcion tecnica del servicio a cotizar..." /></div>
            <div className="space-y-2"><Label>Condiciones</Label><Textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows={4} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agregar items</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-6 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={newItem.tipo} onValueChange={(v) => v && setNewItem({ ...newItem, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPO_ITEM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Concepto</Label>
              <Input value={newItem.concepto} onChange={(e) => setNewItem({ ...newItem, concepto: e.target.value })} placeholder="Ej: Alquiler andamio multidireccional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cantidad</Label>
              <Input type="number" min={0.01} step="0.01" value={newItem.cantidad} onChange={(e) => setNewItem({ ...newItem, cantidad: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Precio unit. ($)</Label>
              <Input type="number" min={0} step="0.01" value={newItem.precio_unitario || ""} onChange={(e) => setNewItem({ ...newItem, precio_unitario: Number(e.target.value) })} />
            </div>
            <Button onClick={addItem} variant="outline"><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Items ({items.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Concepto</TableHead>
                  <TableHead>Cant.</TableHead><TableHead>P. Unit.</TableHead><TableHead>Subtotal</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{TIPO_ITEM_LABELS[item.tipo]}</TableCell>
                    <TableCell>{item.concepto}</TableCell>
                    <TableCell>{item.cantidad} {item.unidad}</TableCell>
                    <TableCell>${item.precio_unitario.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">${(item.cantidad * item.precio_unitario).toLocaleString()}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 space-y-1 text-right">
              <p className="text-sm text-muted-foreground">Subtotal: <span className="font-semibold text-foreground">${subtotal.toLocaleString()}</span></p>
              <p className="text-sm text-muted-foreground">IVA (21%): <span className="font-semibold text-foreground">${iva.toLocaleString()}</span></p>
              <p className="text-lg font-bold text-primary">Total: ${total.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={createCotizacion.isPending} size="lg">
          {createCotizacion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear cotizacion
        </Button>
      </div>
    </div>
  );
}
