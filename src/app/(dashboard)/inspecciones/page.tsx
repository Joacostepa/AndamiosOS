"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useInspecciones, useCreateInspeccion, type Inspeccion } from "@/hooks/use-inspecciones";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const RESULTADO_COLORS: Record<string, string> = {
  aprobado: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  observado: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  rechazado: "bg-red-500/15 text-red-400 border-red-500/25",
};

const columns: ColumnDef<Inspeccion>[] = [
  { accessorKey: "fecha", header: "Fecha", cell: ({ row }) => formatDate(row.original.fecha) },
  { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => <span className="capitalize">{row.original.tipo}</span> },
  { accessorKey: "inspector_nombre", header: "Inspector" },
  { accessorKey: "resultado", header: "Resultado", cell: ({ row }) => <Badge variant="outline" className={`capitalize ${RESULTADO_COLORS[row.original.resultado]}`}>{row.original.resultado}</Badge> },
  { accessorKey: "proxima_inspeccion", header: "Proxima", cell: ({ row }) => formatDate(row.original.proxima_inspeccion) },
];

export default function InspeccionesPage() {
  const { data: inspecciones, isLoading } = useInspecciones();
  const { data: obras } = useObras();
  const createInspeccion = useCreateInspeccion();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<{ obra_id: string; tipo: string; inspector_nombre: string; resultado: string; observaciones?: string; proxima_inspeccion?: string; acciones_correctivas?: string }>();

  function onSubmit(data: { obra_id: string; tipo: string; inspector_nombre: string; resultado: string; observaciones?: string; proxima_inspeccion?: string; acciones_correctivas?: string }) {
    createInspeccion.mutate(data, {
      onSuccess: () => { toast.success("Inspeccion registrada"); setDrawerOpen(false); reset(); },
      onError: () => toast.error("Error al registrar"),
    });
  }

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Inspecciones" description="Inspecciones periodicas de andamios">
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva inspeccion</Button>
      </PageHeader>

      {inspecciones && inspecciones.length > 0 ? (
        <DataTable columns={columns} data={inspecciones} searchKey="inspector_nombre" searchPlaceholder="Buscar por inspector..." />
      ) : (
        <EmptyState icon={Search} title="Sin inspecciones" description="Registra inspecciones de andamios montados.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva inspeccion</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nueva inspeccion</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>{obras?.map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={watch("tipo") || ""} onValueChange={(val) => val && setValue("tipo", val)}>
                  <SelectTrigger><SelectValue placeholder="Tipo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="propia">Propia</SelectItem><SelectItem value="tercero">Tercero</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem><SelectItem value="organismo">Organismo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resultado *</Label>
                <Select value={watch("resultado") || ""} onValueChange={(val) => val && setValue("resultado", val)}>
                  <SelectTrigger><SelectValue placeholder="Resultado..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aprobado">Aprobado</SelectItem><SelectItem value="observado">Observado</SelectItem><SelectItem value="rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Inspector *</Label><Input {...register("inspector_nombre", { required: true })} placeholder="Nombre del inspector" /></div>
            <div className="space-y-2"><Label>Proxima inspeccion</Label><Input type="date" {...register("proxima_inspeccion")} /></div>
            <div className="space-y-2"><Label>Observaciones</Label><Textarea {...register("observaciones")} rows={3} /></div>
            <div className="space-y-2"><Label>Acciones correctivas</Label><Textarea {...register("acciones_correctivas")} rows={2} /></div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createInspeccion.isPending}>{createInspeccion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
