"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useVehiculos, useMantenimientos, useCreateVehiculo, useCreateMantenimiento, type Vehiculo, type Mantenimiento } from "@/hooks/use-vehiculos";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, Car, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const TIPO_LABELS: Record<string, string> = { camion: "Camion", camioneta: "Camioneta", hidrogrua: "Hidrogrua", utilitario: "Utilitario", otro: "Otro" };

const vehColumns: ColumnDef<Vehiculo>[] = [
  { accessorKey: "patente", header: "Patente", cell: ({ row }) => <span className="font-mono font-medium">{row.original.patente}</span> },
  { id: "vehiculo", header: "Vehiculo", cell: ({ row }) => `${row.original.marca || ""} ${row.original.modelo || ""}`.trim() || "—" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => TIPO_LABELS[row.original.tipo] || row.original.tipo },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "km_actual", header: "Km", cell: ({ row }) => `${row.original.km_actual?.toLocaleString()} km` },
  { id: "chofer", header: "Chofer habitual", cell: ({ row }) => row.original.personal ? `${row.original.personal.nombre} ${row.original.personal.apellido}` : "—" },
];

const mantColumns: ColumnDef<Mantenimiento>[] = [
  { accessorKey: "descripcion", header: "Descripcion" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.original.tipo}</Badge> },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "fecha_programada", header: "Programado", cell: ({ row }) => formatDate(row.original.fecha_programada) },
  { accessorKey: "fecha_realizada", header: "Realizado", cell: ({ row }) => formatDate(row.original.fecha_realizada) },
  { accessorKey: "costo", header: "Costo", cell: ({ row }) => row.original.costo ? `$${Number(row.original.costo).toLocaleString()}` : "—" },
  { accessorKey: "proveedor", header: "Proveedor", cell: ({ row }) => row.original.proveedor || "—" },
];

export default function VehiculosPage() {
  const { data: vehiculos, isLoading } = useVehiculos();
  const { data: mantenimientos } = useMantenimientos();
  const createVehiculo = useCreateVehiculo();
  const createMantenimiento = useCreateMantenimiento();
  const [vehDrawer, setVehDrawer] = useState(false);
  const [mantDrawer, setMantDrawer] = useState(false);

  const vehForm = useForm<{ patente: string; marca?: string; modelo?: string; anio?: number; tipo: string; capacidad_carga_kg?: number }>({ defaultValues: { tipo: "camion" } });
  const mantForm = useForm<{ entidad_id: string; tipo: string; descripcion: string; fecha_programada?: string; costo?: number; proveedor?: string }>({ defaultValues: { tipo: "preventivo" } });

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Vehiculos y Mantenimiento" description="Flota y plan de mantenimiento" />

      <Tabs defaultValue="flota">
        <TabsList>
          <TabsTrigger value="flota">Flota ({vehiculos?.length || 0})</TabsTrigger>
          <TabsTrigger value="mantenimiento">Mantenimiento ({mantenimientos?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="flota" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setVehDrawer(true)}><Plus className="mr-2 h-4 w-4" />Nuevo vehiculo</Button>
          </div>
          {vehiculos && vehiculos.length > 0 ? (
            <DataTable columns={vehColumns} data={vehiculos} searchKey="patente" searchPlaceholder="Buscar por patente..." />
          ) : (
            <EmptyState icon={Car} title="Sin vehiculos" description="Agrega vehiculos a la flota." />
          )}
        </TabsContent>

        <TabsContent value="mantenimiento" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setMantDrawer(true)}><Plus className="mr-2 h-4 w-4" />Nuevo mantenimiento</Button>
          </div>
          {mantenimientos && mantenimientos.length > 0 ? (
            <DataTable columns={mantColumns} data={mantenimientos} searchKey="descripcion" searchPlaceholder="Buscar..." />
          ) : (
            <EmptyState icon={Wrench} title="Sin mantenimientos" description="Programa mantenimientos para la flota." />
          )}
        </TabsContent>
      </Tabs>

      {/* Nuevo vehiculo */}
      <Sheet open={vehDrawer} onOpenChange={setVehDrawer}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Nuevo vehiculo</SheetTitle></SheetHeader>
          <form onSubmit={vehForm.handleSubmit((data) => createVehiculo.mutate(data, { onSuccess: () => { toast.success("Vehiculo creado"); setVehDrawer(false); vehForm.reset(); }, onError: () => toast.error("Error") }))} className="mt-6 space-y-4">
            <div className="space-y-2"><Label>Patente *</Label><Input {...vehForm.register("patente", { required: true })} placeholder="AB 123 CD" className="font-mono" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Marca</Label><Input {...vehForm.register("marca")} /></div>
              <div className="space-y-2"><Label>Modelo</Label><Input {...vehForm.register("modelo")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Ano</Label><Input type="number" {...vehForm.register("anio", { valueAsNumber: true })} /></div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={vehForm.watch("tipo")} onValueChange={(val) => val && vehForm.setValue("tipo", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Capacidad carga (kg)</Label><Input type="number" {...vehForm.register("capacidad_carga_kg", { valueAsNumber: true })} /></div>
            <div className="flex justify-end pt-4"><Button type="submit" disabled={createVehiculo.isPending}>{createVehiculo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear</Button></div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Nuevo mantenimiento */}
      <Sheet open={mantDrawer} onOpenChange={setMantDrawer}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Nuevo mantenimiento</SheetTitle></SheetHeader>
          <form onSubmit={mantForm.handleSubmit((data) => createMantenimiento.mutate(data, { onSuccess: () => { toast.success("Mantenimiento creado"); setMantDrawer(false); mantForm.reset(); }, onError: () => toast.error("Error") }))} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Vehiculo *</Label>
              <Select value={mantForm.watch("entidad_id") || ""} onValueChange={(val) => val && mantForm.setValue("entidad_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vehiculo..." /></SelectTrigger>
                <SelectContent>{vehiculos?.map((v) => <SelectItem key={v.id} value={v.id}>{v.patente} — {v.marca} {v.modelo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={mantForm.watch("tipo")} onValueChange={(val) => val && mantForm.setValue("tipo", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="preventivo">Preventivo</SelectItem><SelectItem value="correctivo">Correctivo</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descripcion *</Label><Input {...mantForm.register("descripcion", { required: true })} placeholder="Ej: Cambio de aceite y filtros" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Fecha programada</Label><Input type="date" {...mantForm.register("fecha_programada")} /></div>
              <div className="space-y-2"><Label>Costo ($)</Label><Input type="number" step="0.01" {...mantForm.register("costo", { valueAsNumber: true })} /></div>
            </div>
            <div className="space-y-2"><Label>Proveedor</Label><Input {...mantForm.register("proveedor")} /></div>
            <div className="flex justify-end pt-4"><Button type="submit" disabled={createMantenimiento.isPending}>{createMantenimiento.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear</Button></div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
