"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useOrdenesTrabajo, useCreateAdicional, useRetryPushOT, type OrdenTrabajo } from "@/hooks/use-ordenes-trabajo";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ListOrdered, Shield, CheckCircle, Clock, Plus, Loader2, RefreshCw, CloudOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const TIPO_OT_LABELS: Record<string, string> = {
  armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro",
};

function SyncBadge({ ot }: { ot: OrdenTrabajo }) {
  const retry = useRetryPushOT();
  if (!ot.es_adicional) return <span className="text-muted-foreground text-xs">—</span>;
  if (ot.odoo_sync_estado === "sincronizado") return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 gap-1"><CheckCircle className="h-3 w-3" />Odoo</Badge>;
  if (ot.odoo_sync_estado === "error") return (
    <Button size="sm" variant="outline" className="h-7 text-red-400 border-red-500/25" disabled={retry.isPending}
      onClick={() => retry.mutate(ot.id, { onSuccess: () => toast.success("Sincronizada con Odoo"), onError: (e) => toast.error(e.message) })}>
      {retry.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}Reintentar
    </Button>
  );
  return <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/25 gap-1"><CloudOff className="h-3 w-3" />Pendiente</Badge>;
}

const columns: ColumnDef<OrdenTrabajo>[] = [
  { accessorKey: "codigo", header: "OT", cell: ({ row }) => (
    <span className="flex items-center gap-2">
      <span className="font-mono text-sm">{row.original.codigo}</span>
      {row.original.es_adicional && <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/25">Adicional</Badge>}
    </span>
  ) },
  { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras
    ? <Link href={`/obras/${row.original.obra_id}`} className="text-primary hover:underline">{row.original.obras.codigo} — {row.original.obras.nombre}</Link>
    : "—" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => TIPO_OT_LABELS[row.original.tipo] || row.original.tipo },
  { accessorKey: "fecha_programada", header: "Programada", cell: ({ row }) => formatDate(row.original.fecha_programada) },
  { id: "estado", header: "Estado", cell: ({ row }) => {
    const ot = row.original;
    if (ot.es_adicional && !ot.aprobada_comercial) return <Badge variant="outline" className="gap-1 bg-orange-500/15 text-orange-400 border-orange-500/25"><Clock className="h-3 w-3" />Pend. aprob. comercial</Badge>;
    if (ot.requiere_habilitacion && !ot.habilitacion_aprobada && ot.estado === "pendiente") return <Badge variant="outline" className="gap-1 bg-red-500/15 text-red-400 border-red-500/25"><Shield className="h-3 w-3" />Pend. habilitación</Badge>;
    return <StatusBadge status={ot.estado} />;
  } },
  { id: "sync", header: "Odoo", cell: ({ row }) => <SyncBadge ot={row.original} /> },
];

export default function OrdenesTrabajoPage() {
  const { data: ots, isLoading } = useOrdenesTrabajo();
  const { data: obras } = useObras();
  const createAdicional = useCreateAdicional();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<{ obra_id: string; tipo: string; motivo_adicional: string; descripcion?: string; fecha_programada?: string }>({ defaultValues: { tipo: "ampliacion" } });

  function onSubmit(data: { obra_id: string; tipo: string; motivo_adicional: string; descripcion?: string; fecha_programada?: string }) {
    if (!data.obra_id) { toast.error("Seleccioná la obra"); return; }
    if (!data.motivo_adicional) { toast.error("Indicá el motivo del adicional"); return; }
    createAdicional.mutate(data, {
      onSuccess: () => { toast.success("OT adicional creada — pendiente de aprobación comercial"); setOpen(false); reset(); },
      onError: () => toast.error("Error al crear la OT adicional"),
    });
  }

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  const total = ots?.length || 0;
  const bloqueadas = ots?.filter((o) => (o.es_adicional && !o.aprobada_comercial) || (o.requiere_habilitacion && !o.habilitacion_aprobada && o.estado === "pendiente")).length || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Órdenes de Trabajo" description={`${total} en total · ${bloqueadas} bloqueadas`}>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva OT adicional</Button>
      </PageHeader>

      {ots && ots.length > 0 ? (
        <DataTable columns={columns} data={ots} searchKey="codigo" searchPlaceholder="Buscar OT..." />
      ) : (
        <EmptyState icon={ListOrdered} title="Sin órdenes de trabajo" description="Las OTs bajan de Odoo (Comercial). Operaciones puede crear OTs adicionales acá." />
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nueva OT adicional</SheetTitle></SheetHeader>
          <p className="mt-2 text-sm text-muted-foreground">Trabajo extra detectado en obra. Queda pendiente hasta que Comercial lo apruebe en Odoo.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>{obras?.filter((o) => o.estado !== "cancelada").map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={watch("tipo")} onValueChange={(val) => val && setValue("tipo", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPO_OT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Motivo del adicional *</Label><Textarea {...register("motivo_adicional", { required: true })} rows={2} placeholder="Por qué surge este trabajo extra..." /></div>
            <div className="space-y-2"><Label>Descripción</Label><Textarea {...register("descripcion")} rows={2} placeholder="Qué hay que hacer..." /></div>
            <div className="space-y-2"><Label>Fecha programada</Label><Input type="date" {...register("fecha_programada")} /></div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={createAdicional.isPending}>{createAdicional.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear adicional</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
