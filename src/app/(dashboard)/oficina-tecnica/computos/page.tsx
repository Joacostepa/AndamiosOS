"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useComputos, type Computo } from "@/hooks/use-computos";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Calculator, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const columns: ColumnDef<Computo>[] = [
  {
    id: "proyecto",
    header: "Proyecto",
    cell: ({ row }) => (
      <Link href={`/oficina-tecnica/computos/${row.original.id}`} className="font-mono text-sm font-medium hover:text-primary transition-colors">
        {row.original.proyectos_tecnicos?.codigo || "—"}
      </Link>
    ),
  },
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) => {
      const obra = row.original.proyectos_tecnicos?.obras;
      return obra ? `${obra.codigo} — ${obra.nombre}` : "—";
    },
  },
  {
    accessorKey: "version",
    header: "Version",
    cell: ({ row }) => `v${row.original.version}`,
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.estado} />,
  },
  {
    accessorKey: "created_at",
    header: "Creado",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
];

export default function ComputosPage() {
  const { data: computos, isLoading } = useComputos();

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Computos de Materiales" description="Lista de piezas necesarias por proyecto">
        <Button render={<Link href="/oficina-tecnica/computos/nuevo" />}>
          <Plus className="mr-2 h-4 w-4" />Nuevo computo
        </Button>
      </PageHeader>

      {computos && computos.length > 0 ? (
        <DataTable columns={columns} data={computos} searchKey="proyecto" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={Calculator} title="Sin computos" description="Los computos se crean desde el detalle de un proyecto tecnico aprobado." />
      )}
    </div>
  );
}
