"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useClientes, useCreateCliente, type Cliente } from "@/hooks/use-clientes";
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
import { ClienteForm } from "./cliente-form";
import { formatCuit } from "@/lib/utils/formatters";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const columns: ColumnDef<Cliente>[] = [
  {
    accessorKey: "razon_social",
    header: "Razon Social",
    cell: ({ row }) => (
      <Link
        href={`/clientes/${row.original.id}`}
        className="font-medium hover:text-primary transition-colors"
      >
        {row.original.razon_social}
      </Link>
    ),
  },
  {
    accessorKey: "cuit",
    header: "CUIT",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{formatCuit(row.original.cuit)}</span>
    ),
  },
  {
    accessorKey: "telefono",
    header: "Telefono",
    cell: ({ row }) => row.original.telefono || "—",
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email || "—",
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
];

export default function ClientesPage() {
  const { data: clientes, isLoading } = useClientes();
  const createCliente = useCreateCliente();
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
      <PageHeader title="Clientes" description="Base de datos de clientes">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo cliente
        </Button>
      </PageHeader>

      {clientes && clientes.length > 0 ? (
        <DataTable
          columns={columns}
          data={clientes}
          searchKey="razon_social"
          searchPlaceholder="Buscar por razon social..."
        />
      ) : (
        <EmptyState
          icon={Users}
          title="Sin clientes"
          description="Crea tu primer cliente para empezar."
        >
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cliente
          </Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo cliente</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <ClienteForm
              onSubmit={(data) => {
                createCliente.mutate(data, {
                  onSuccess: () => {
                    toast.success("Cliente creado correctamente");
                    setDrawerOpen(false);
                  },
                  onError: () => {
                    toast.error("Error al crear el cliente");
                  },
                });
              }}
              loading={createCliente.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
