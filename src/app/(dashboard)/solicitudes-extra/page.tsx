"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useSolicitudesExtra, useCreateSolicitudExtra, type SolicitudExtra } from "@/hooks/use-solicitudes-extra";
import { useObras } from "@/hooks/use-obras";
import { useCatalogo } from "@/hooks/use-catalogo";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { Plus, PackagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const MOTIVO_LABELS: Record<string, string> = {
  error_computo: "Error en computo", cambio_alcance: "Cambio de alcance",
  reemplazo_danado: "Reemplazo danado", otro: "Otro",
};

const URGENCIA_COLORS: Record<string, string> = {
  normal: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  urgente: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  critica: "bg-red-500/15 text-red-400 border-red-500/25",
};

const columns: ColumnDef<SolicitudExtra>[] = [
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) => (
      <Link href={`/solicitudes-extra/${row.original.id}`} className="hover:text-primary transition-colors">
        {row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—"}
      </Link>
    ),
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    cell: ({ row }) => MOTIVO_LABELS[row.original.motivo] || row.original.motivo,
  },
  {
    accessorKey: "urgencia",
    header: "Urgencia",
    cell: ({ row }) => (
      <Badge variant="outline" className={`capitalize ${URGENCIA_COLORS[row.original.urgencia]}`}>
        {row.original.urgencia}
      </Badge>
    ),
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
  {
    accessorKey: "created_at",
    header: "Creada",
    cell: ({ row }) => formatRelativeDate(row.original.created_at),
  },
];

type ItemRow = { pieza_id: string; codigo: string; descripcion: string; cantidad: number };

export default function SolicitudesExtraPage() {
  const { data: solicitudes, isLoading } = useSolicitudesExtra();
  const { data: obras } = useObras();
  const { data: catalogo } = useCatalogo();
  const createSolicitud = useCreateSolicitudExtra();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [obraId, setObraId] = useState("");
  const [motivo, setMotivo] = useState("otro");
  const [urgencia, setUrgencia] = useState("normal");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedPieza, setSelectedPieza] = useState("");
  const [cantidad, setCantidad] = useState(1);

  function addItem() {
    if (!selectedPieza || cantidad < 1) return;
    const pieza = catalogo?.find((p) => p.id === selectedPieza);
    if (!pieza) return;
    const existing = items.find((i) => i.pieza_id === selectedPieza);
    if (existing) {
      setItems(items.map((i) => i.pieza_id === selectedPieza ? { ...i, cantidad: i.cantidad + cantidad } : i));
    } else {
      setItems([...items, { pieza_id: pieza.id, codigo: pieza.codigo, descripcion: pieza.descripcion, cantidad }]);
    }
    setSelectedPieza("");
    setCantidad(1);
  }

  function handleSubmit() {
    if (!obraId) { toast.error("Selecciona una obra"); return; }
    if (items.length === 0) { toast.error("Agrega al menos una pieza"); return; }
    createSolicitud.mutate(
      { obra_id: obraId, motivo, urgencia, observaciones: observaciones || undefined, items: items.map((i) => ({ pieza_id: i.pieza_id, cantidad: i.cantidad })) },
      {
        onSuccess: () => {
          toast.success("Solicitud creada");
          setDrawerOpen(false);
          setItems([]);
          setObservaciones("");
        },
        onError: () => toast.error("Error al crear solicitud"),
      }
    );
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes Extra" description="Pedidos de material adicional desde obra">
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva solicitud</Button>
      </PageHeader>

      {solicitudes && solicitudes.length > 0 ? (
        <DataTable columns={columns} data={solicitudes} searchKey="motivo" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={PackagePlus} title="Sin solicitudes" description="Las solicitudes extra se crean desde obra cuando falta material.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva solicitud</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nueva solicitud extra</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={obraId} onValueChange={(val) => val && setObraId(val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (<SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select value={motivo} onValueChange={(val) => val && setMotivo(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOTIVO_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Urgencia</Label>
                <Select value={urgencia} onValueChange={(val) => val && setUrgencia(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="critica">Critica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pieza</Label>
              <Select value={selectedPieza} onValueChange={(val) => val && setSelectedPieza(val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar pieza..." /></SelectTrigger>
                <SelectContent>
                  {catalogo?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="w-24" />
              <Button type="button" variant="outline" onClick={addItem}><Plus className="mr-1 h-4 w-4" />Agregar</Button>
            </div>
            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Pieza</TableHead><TableHead>Cant.</TableHead><TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.pieza_id}>
                      <TableCell className="text-sm">{item.codigo} — {item.descripcion}</TableCell>
                      <TableCell className="font-semibold">{item.cantidad}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((i) => i.pieza_id !== item.pieza_id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleSubmit} disabled={createSolicitud.isPending}>
                {createSolicitud.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear solicitud
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
