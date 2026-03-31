"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useProyectos, useCreateProyecto, type ProyectoTecnico, type ProyectoFormData } from "@/hooks/use-proyectos";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, Ruler, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import Link from "next/link";

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  en_revision: "En revision",
  aprobado: "Aprobado",
  requiere_cambios: "Requiere cambios",
  cancelado: "Cancelado",
};

const columns: ColumnDef<ProyectoTecnico>[] = [
  {
    accessorKey: "codigo",
    header: "Codigo",
    cell: ({ row }) => (
      <Link href={`/oficina-tecnica/proyectos/${row.original.id}`} className="font-mono text-sm font-medium hover:text-primary transition-colors">
        {row.original.codigo}
      </Link>
    ),
  },
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) => row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—",
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
  {
    id: "tecnico",
    header: "Tecnico",
    cell: ({ row }) => row.original.user_profiles ? `${row.original.user_profiles.nombre} ${row.original.user_profiles.apellido}` : "Sin asignar",
  },
  {
    accessorKey: "fecha_solicitud",
    header: "Solicitud",
    cell: ({ row }) => formatDate(row.original.fecha_solicitud),
  },
  {
    accessorKey: "fecha_entrega_estimada",
    header: "Entrega est.",
    cell: ({ row }) => formatDate(row.original.fecha_entrega_estimada),
  },
];

export default function ProyectosPage() {
  const { data: proyectos, isLoading } = useProyectos();
  const { data: obras } = useObras();
  const createProyecto = useCreateProyecto();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<ProyectoFormData>();

  function onSubmit(data: ProyectoFormData) {
    createProyecto.mutate(data, {
      onSuccess: () => {
        toast.success("Proyecto creado");
        setDrawerOpen(false);
        reset();
      },
      onError: () => toast.error("Error al crear proyecto"),
    });
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Proyectos Tecnicos" description="Gestion de proyectos de oficina tecnica">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo proyecto
        </Button>
      </PageHeader>

      {proyectos && proyectos.length > 0 ? (
        <DataTable columns={columns} data={proyectos} searchKey="codigo" searchPlaceholder="Buscar por codigo..." />
      ) : (
        <EmptyState icon={Ruler} title="Sin proyectos" description="Crea un proyecto tecnico para una obra.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo proyecto</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nuevo proyecto tecnico</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sistema de andamio</Label>
              <Select value={watch("tipo_sistema_andamio") || ""} onValueChange={(val) => val && setValue("tipo_sistema_andamio", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multidireccional">Multidireccional</SelectItem>
                  <SelectItem value="tubular">Tubular</SelectItem>
                  <SelectItem value="colgante">Colgante</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Altura max (m)</Label>
                <Input type="number" step="0.01" {...register("altura_maxima", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Metros lineales</Label>
                <Input type="number" step="0.01" {...register("metros_lineales", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>Superficie (m2)</Label>
                <Input type="number" step="0.01" {...register("superficie", { valueAsNumber: true })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha entrega estimada</Label>
              <Input type="date" {...register("fecha_entrega_estimada")} />
            </div>
            <div className="space-y-2">
              <Label>Observaciones tecnicas</Label>
              <Textarea {...register("observaciones_tecnicas")} rows={3} />
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createProyecto.isPending}>
                {createProyecto.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear proyecto
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
