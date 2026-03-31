"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { usePermisos, useCreatePermiso, useUpdatePermiso, type Permiso } from "@/hooks/use-permisos";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const columns: ColumnDef<Permiso>[] = [
  { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—" },
  { accessorKey: "tipo_permiso", header: "Tipo" },
  { accessorKey: "organismo", header: "Organismo" },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "fecha_solicitud", header: "Solicitud", cell: ({ row }) => formatDate(row.original.fecha_solicitud) },
  { accessorKey: "fecha_vencimiento", header: "Vencimiento", cell: ({ row }) => formatDate(row.original.fecha_vencimiento) },
  { accessorKey: "costo", header: "Costo", cell: ({ row }) => row.original.costo ? `$${Number(row.original.costo).toLocaleString()}` : "—" },
];

export default function PermisosPage() {
  const { data: permisos, isLoading } = usePermisos();
  const { data: obras } = useObras();
  const createPermiso = useCreatePermiso();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<{ obra_id: string; tipo_permiso: string; organismo: string; fecha_vencimiento?: string; costo?: number }>();

  function onSubmit(data: { obra_id: string; tipo_permiso: string; organismo: string; fecha_vencimiento?: string; costo?: number }) {
    createPermiso.mutate(data, {
      onSuccess: () => { toast.success("Permiso creado"); setDrawerOpen(false); reset(); },
      onError: () => toast.error("Error al crear permiso"),
    });
  }

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Permisos Municipales" description="Gestoria y tramites">
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo permiso</Button>
      </PageHeader>

      {permisos && permisos.length > 0 ? (
        <DataTable columns={columns} data={permisos} searchKey="tipo_permiso" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={Shield} title="Sin permisos" description="No hay permisos registrados.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo permiso</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Nuevo permiso</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>{obras?.map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Tipo de permiso *</Label><Input {...register("tipo_permiso", { required: true })} placeholder="Ej: Ocupacion via publica" /></div>
            <div className="space-y-2"><Label>Organismo *</Label><Input {...register("organismo", { required: true })} placeholder="Ej: GCBA, Municipalidad..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Vencimiento</Label><Input type="date" {...register("fecha_vencimiento")} /></div>
              <div className="space-y-2"><Label>Costo ($)</Label><Input type="number" step="0.01" {...register("costo", { valueAsNumber: true })} /></div>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createPermiso.isPending}>{createPermiso.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear permiso</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
