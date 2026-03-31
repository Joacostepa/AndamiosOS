"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  usePersonal,
  useCreatePersonal,
  type Personal,
  type PersonalFormData,
} from "@/hooks/use-personal";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import Link from "next/link";

const PUESTO_LABELS: Record<string, string> = {
  operario: "Operario",
  capataz: "Capataz",
  chofer: "Chofer",
  tecnico: "Tecnico",
  administrativo: "Administrativo",
  supervisor: "Supervisor",
  jefe_deposito: "Jefe deposito",
  jefe_tecnico: "Jefe tecnico",
  gerente: "Gerente",
};

const columns: ColumnDef<Personal>[] = [
  {
    id: "nombre_completo",
    header: "Nombre",
    cell: ({ row }) => (
      <Link
        href={`/personal/${row.original.id}`}
        className="font-medium hover:text-primary transition-colors"
      >
        {row.original.apellido}, {row.original.nombre}
      </Link>
    ),
  },
  {
    accessorKey: "dni",
    header: "DNI",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.dni}</span>
    ),
  },
  {
    accessorKey: "puesto",
    header: "Puesto",
    cell: ({ row }) =>
      PUESTO_LABELS[row.original.puesto] || row.original.puesto,
  },
  {
    accessorKey: "telefono",
    header: "Telefono",
    cell: ({ row }) => row.original.telefono || "—",
  },
  {
    accessorKey: "estado_habilitacion",
    header: "Habilitacion",
    cell: ({ row }) => (
      <StatusBadge status={row.original.estado_habilitacion} />
    ),
  },
];

export default function PersonalPage() {
  const { data: personal, isLoading } = usePersonal();
  const createPersonal = useCreatePersonal();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<PersonalFormData>({
      defaultValues: { puesto: "operario" },
    });

  function onSubmit(data: PersonalFormData) {
    createPersonal.mutate(data, {
      onSuccess: () => {
        toast.success("Personal creado correctamente");
        setDrawerOpen(false);
        reset();
      },
      onError: () => {
        toast.error("Error al crear");
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Personal" description="Legajos y habilitaciones">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva persona
        </Button>
      </PageHeader>

      {personal && personal.length > 0 ? (
        <DataTable
          columns={columns}
          data={personal}
          searchKey="dni"
          searchPlaceholder="Buscar por DNI..."
        />
      ) : (
        <EmptyState
          icon={UserCheck}
          title="Sin personal"
          description="Agrega personal para gestionar legajos."
        >
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva persona
          </Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Nueva persona</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input {...register("nombre", { required: true })} />
              </div>
              <div className="space-y-2">
                <Label>Apellido *</Label>
                <Input {...register("apellido", { required: true })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>DNI *</Label>
                <Input
                  {...register("dni", { required: true })}
                  placeholder="12345678"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>CUIL</Label>
                <Input
                  {...register("cuil")}
                  placeholder="XX-XXXXXXXX-X"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Puesto *</Label>
              <Select
                value={watch("puesto")}
                onValueChange={(val) => val && setValue("puesto", val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PUESTO_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input {...register("telefono")} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...register("email")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Domicilio</Label>
              <Input {...register("domicilio")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha nacimiento</Label>
                <Input type="date" {...register("fecha_nacimiento")} />
              </div>
              <div className="space-y-2">
                <Label>Fecha ingreso</Label>
                <Input type="date" {...register("fecha_ingreso")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contacto emergencia</Label>
                <Input
                  {...register("contacto_emergencia_nombre")}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label>Tel. emergencia</Label>
                <Input
                  {...register("contacto_emergencia_telefono")}
                  placeholder="Telefono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createPersonal.isPending}>
                {createPersonal.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Crear persona
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
