"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useClientes, type Cliente } from "@/hooks/use-clientes";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCuit } from "@/lib/utils/formatters";
import { Users } from "lucide-react";
import Link from "next/link";

// NOTA: Clientes es read-only — la fuente de verdad es Odoo (res.partner), se sincroniza
// vía /api/odoo/sync/clientes. No hay ABM en la app (alta/edición se hacen en Odoo).
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
      <PageHeader
        title="Clientes"
        description="Sincronizado desde Odoo · solo lectura"
      />

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
          description="Los clientes se sincronizan desde Odoo."
        />
      )}
    </div>
  );
}
