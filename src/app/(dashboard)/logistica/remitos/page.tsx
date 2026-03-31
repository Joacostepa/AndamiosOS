"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useRemitos, type Remito } from "@/hooks/use-remitos";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";

const TIPO_LABELS: Record<string, string> = {
  entrega: "Entrega",
  devolucion: "Devolucion",
  transferencia: "Transferencia",
};

const columns: ColumnDef<Remito>[] = [
  {
    accessorKey: "numero",
    header: "Numero",
    cell: ({ row }) => (
      <Link
        href={`/logistica/remitos/${row.original.id}`}
        className="font-mono text-sm font-medium hover:text-primary transition-colors"
      >
        {row.original.numero}
      </Link>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {TIPO_LABELS[row.original.tipo] || row.original.tipo}
      </Badge>
    ),
  },
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) =>
      row.original.obras
        ? `${row.original.obras.codigo} — ${row.original.obras.nombre}`
        : "—",
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
  {
    accessorKey: "fecha_emision",
    header: "Emision",
    cell: ({ row }) => formatDate(row.original.fecha_emision),
  },
  {
    accessorKey: "tiene_diferencia",
    header: "Diferencia",
    cell: ({ row }) =>
      row.original.tiene_diferencia ? (
        <Badge
          variant="outline"
          className="bg-red-500/15 text-red-400 border-red-500/25"
        >
          Si
        </Badge>
      ) : null,
  },
];

export default function RemitosPage() {
  const { data: remitos, isLoading } = useRemitos();

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
      <PageHeader title="Remitos" description="Gestion de remitos de material">
        <Button render={<Link href="/logistica/remitos/nuevo" />}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo remito
        </Button>
      </PageHeader>

      {remitos && remitos.length > 0 ? (
        <DataTable
          columns={columns}
          data={remitos}
          searchKey="numero"
          searchPlaceholder="Buscar por numero..."
        />
      ) : (
        <EmptyState
          icon={FileText}
          title="Sin remitos"
          description="Crea tu primer remito para empezar a registrar entregas."
        >
          <Button render={<Link href="/logistica/remitos/nuevo" />}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo remito
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
