"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useObras, useCreateObra, type Obra } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ObraForm } from "./obra-form";
import { formatDate } from "@/lib/utils/formatters";
import { ESTADO_OBRA_LABELS } from "@/lib/validators/obra";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const columns: ColumnDef<Obra>[] = [
  {
    accessorKey: "codigo",
    header: "Codigo",
    cell: ({ row }) => (
      <Link
        href={`/obras/${row.original.id}`}
        className="font-mono text-sm font-medium hover:text-primary transition-colors"
      >
        {row.original.codigo}
      </Link>
    ),
  },
  {
    accessorKey: "nombre",
    header: "Nombre",
    cell: ({ row }) => (
      <Link
        href={`/obras/${row.original.id}`}
        className="hover:text-primary transition-colors"
      >
        {row.original.nombre}
      </Link>
    ),
  },
  {
    id: "cliente",
    header: "Cliente",
    cell: ({ row }) => row.original.clientes?.razon_social || "—",
  },
  {
    accessorKey: "tipo_obra",
    header: "Tipo",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.tipo_obra}</span>
    ),
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
  {
    accessorKey: "fecha_inicio_estimada",
    header: "Inicio est.",
    cell: ({ row }) => formatDate(row.original.fecha_inicio_estimada),
  },
];

export default function ObrasPage() {
  const { data: obras, isLoading } = useObras();
  const createObra = useCreateObra();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      <PageHeader title="Obras" description="Gestion de obras y proyectos">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva obra
        </Button>
      </PageHeader>

      {obras && obras.length > 0 ? (
        <DataTable
          columns={columns}
          data={obras}
          searchKey="nombre"
          searchPlaceholder="Buscar por nombre..."
        />
      ) : (
        <EmptyState
          icon={Building2}
          title="Sin obras"
          description="Crea tu primera obra para empezar."
        >
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva obra
          </Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Nueva obra</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <ObraForm
              onSubmit={(data) => {
                createObra.mutate(data, {
                  onSuccess: () => {
                    toast.success("Obra creada correctamente");
                    setDrawerOpen(false);
                  },
                  onError: () => {
                    toast.error("Error al crear la obra");
                  },
                });
              }}
              loading={createObra.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
