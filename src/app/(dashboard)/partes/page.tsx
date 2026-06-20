"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { usePartes, useCreateParte, type ParteObra, type ParteFormData } from "@/hooks/use-partes";
import { useObras } from "@/hooks/use-obras";
import { useOrdenesTrabajoByObra } from "@/hooks/use-ordenes-trabajo";
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
import { formatDate } from "@/lib/utils/formatters";
import { Plus, HardHat, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";

const TIPO_LABELS: Record<string, string> = {
  montaje: "Montaje", desarme: "Desarme", modificacion: "Modificacion",
  reparacion: "Reparacion", inspeccion: "Inspeccion", otro: "Otro",
};

const columns: ColumnDef<ParteObra>[] = [
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => formatDate(row.original.fecha),
  },
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) => row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—",
  },
  {
    id: "ot",
    header: "OT",
    cell: ({ row }) => row.original.ordenes_trabajo ? <span className="font-mono text-sm">{row.original.ordenes_trabajo.codigo}</span> : <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "tipo_tarea",
    header: "Tarea",
    cell: ({ row }) => TIPO_LABELS[row.original.tipo_tarea] || row.original.tipo_tarea,
  },
  {
    accessorKey: "metros_montados",
    header: "Metros",
    cell: ({ row }) => row.original.metros_montados ? `${row.original.metros_montados}m` : "—",
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
];

export default function PartesPage() {
  const { data: partes, isLoading } = usePartes();
  const { data: obras } = useObras();
  const createParte = useCreateParte();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch, control } = useForm<ParteFormData>({
    defaultValues: { tipo_tarea: "montaje" },
  });

  // useWatch (memo-safe) porque el valor alimenta un hook; watch() no es seguro para eso.
  const selectedObra = useWatch({ control, name: "obra_id" });
  const { data: otsObra } = useOrdenesTrabajoByObra(selectedObra || "");

  function onSubmit(data: ParteFormData) {
    createParte.mutate(data, {
      onSuccess: () => {
        toast.success("Parte de obra creado");
        setDrawerOpen(false);
        reset();
      },
      onError: () => toast.error("Error al crear parte"),
    });
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Partes de Obra" description="Registro diario de actividad en obra">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Nuevo parte
        </Button>
      </PageHeader>

      {partes && partes.length > 0 ? (
        <DataTable columns={columns} data={partes} searchKey="fecha" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={HardHat} title="Sin partes" description="Crea un parte de obra diario.">
          <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nuevo parte</Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nuevo parte de obra</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => { if (val) { setValue("obra_id", val); setValue("ot_id", undefined); } }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Orden de trabajo</Label>
              <Select value={watch("ot_id") || ""} onValueChange={(val) => val && setValue("ot_id", val)} disabled={!selectedObra || !otsObra?.length}>
                <SelectTrigger><SelectValue placeholder={!selectedObra ? "Elegí una obra primero..." : otsObra?.length ? "Vincular a una OT (opcional)..." : "Esta obra no tiene OTs"} /></SelectTrigger>
                <SelectContent>
                  {otsObra?.map((ot) => (
                    <SelectItem key={ot.id} value={ot.id}>{ot.codigo} — {ot.tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" {...register("fecha")} defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de tarea *</Label>
                <Select value={watch("tipo_tarea")} onValueChange={(val) => val && setValue("tipo_tarea", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Metros montados/desmontados</Label>
              <Input type="number" step="0.01" {...register("metros_montados", { valueAsNumber: true })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Avance / Descripcion</Label>
              <Textarea {...register("avance_descripcion")} placeholder="Descripcion del trabajo realizado..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Clima</Label>
              <Select value={watch("clima") || ""} onValueChange={(val) => val && setValue("clima", val)}>
                <SelectTrigger><SelectValue placeholder="Condiciones climaticas..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bueno">Bueno</SelectItem>
                  <SelectItem value="nublado">Nublado</SelectItem>
                  <SelectItem value="lluvia">Lluvia</SelectItem>
                  <SelectItem value="viento">Viento fuerte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea {...register("observaciones")} rows={2} />
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createParte.isPending}>
                {createParte.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear parte
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
