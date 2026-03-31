"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useIncidentes, useCreateIncidente, useUpdateIncidente, type Incidente } from "@/hooks/use-incidentes";
import { useObras } from "@/hooks/use-obras";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { Plus, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const SEV_COLORS: Record<string, string> = {
  baja: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  media: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  alta: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  critica: "bg-red-500/15 text-red-400 border-red-500/25",
};

const TIPO_LABELS: Record<string, string> = {
  accidente: "Accidente", cuasi_accidente: "Cuasi accidente", dano_material: "Dano material",
  robo: "Robo", reclamo_cliente: "Reclamo cliente", desvio_operativo: "Desvio operativo",
  observacion_seguridad: "Obs. seguridad",
};

const columns: ColumnDef<Incidente>[] = [
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => TIPO_LABELS[row.original.tipo] || row.original.tipo },
  { accessorKey: "severidad", header: "Severidad", cell: ({ row }) => <Badge variant="outline" className={`capitalize ${SEV_COLORS[row.original.severidad]}`}>{row.original.severidad}</Badge> },
  { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras ? `${row.original.obras.codigo}` : "General" },
  { accessorKey: "descripcion", header: "Descripcion", cell: ({ row }) => <span className="truncate max-w-[300px] block">{row.original.descripcion}</span> },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "created_at", header: "Fecha", cell: ({ row }) => formatRelativeDate(row.original.created_at) },
];

export default function IncidentesPage() {
  const { data: incidentes, isLoading } = useIncidentes();
  const { data: obras } = useObras();
  const createIncidente = useCreateIncidente();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<{ obra_id?: string; tipo: string; severidad: string; descripcion: string; acciones_tomadas?: string }>();

  function onSubmit(data: { obra_id?: string; tipo: string; severidad: string; descripcion: string; acciones_tomadas?: string }) {
    createIncidente.mutate(data, {
      onSuccess: () => { toast.success("Incidente registrado"); setDrawerOpen(false); reset(); },
      onError: () => toast.error("Error al registrar"),
    });
  }

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  const abiertos = incidentes?.filter((i) => i.estado !== "cerrado").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Incidentes" description={`${abiertos} abiertos`}>
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Reportar incidente</Button>
      </PageHeader>

      {incidentes && incidentes.length > 0 ? (
        <DataTable columns={columns} data={incidentes} searchKey="tipo" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={AlertTriangle} title="Sin incidentes" description="No hay incidentes registrados.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Reportar incidente</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Reportar incidente</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra (opcional)..." /></SelectTrigger>
                <SelectContent>{obras?.map((o) => <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={watch("tipo") || ""} onValueChange={(val) => val && setValue("tipo", val)}>
                  <SelectTrigger><SelectValue placeholder="Tipo..." /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severidad *</Label>
                <Select value={watch("severidad") || ""} onValueChange={(val) => val && setValue("severidad", val)}>
                  <SelectTrigger><SelectValue placeholder="Severidad..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem><SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Critica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Descripcion *</Label><Textarea {...register("descripcion", { required: true })} rows={4} placeholder="Describi que paso..." /></div>
            <div className="space-y-2"><Label>Acciones tomadas</Label><Textarea {...register("acciones_tomadas")} rows={2} placeholder="Que se hizo al respecto..." /></div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createIncidente.isPending}>{createIncidente.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
