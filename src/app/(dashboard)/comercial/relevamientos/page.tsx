"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useRelevamientos, type Relevamiento } from "@/hooks/use-relevamientos";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, MapPin } from "lucide-react";
import Link from "next/link";

const columns: ColumnDef<Relevamiento>[] = [
  { accessorKey: "direccion", header: "Direccion", cell: ({ row }) => <Link href={`/comercial/relevamientos/${row.original.id}`} className="font-medium hover:text-primary transition-colors">{row.original.direccion}</Link> },
  { id: "oportunidad", header: "Oportunidad", cell: ({ row }) => row.original.oportunidades ? `${row.original.oportunidades.codigo} — ${row.original.oportunidades.titulo}` : "—" },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "sistema_recomendado", header: "Sistema", cell: ({ row }) => <span className="capitalize">{row.original.sistema_recomendado || "—"}</span> },
  { accessorKey: "altura_estimada", header: "Altura", cell: ({ row }) => row.original.altura_estimada ? `${row.original.altura_estimada}m` : "—" },
  { accessorKey: "fecha_programada", header: "Programado", cell: ({ row }) => formatDate(row.original.fecha_programada) },
];

export default function RelevamientosPage() {
  const { data: relevamientos, isLoading } = useRelevamientos();
  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Relevamientos" description="Visitas de relevamiento para cotizar">
        <Button render={<Link href="/comercial/relevamientos/nuevo" />}><Plus className="mr-2 h-4 w-4" />Nuevo relevamiento</Button>
      </PageHeader>
      {relevamientos && relevamientos.length > 0 ? (
        <DataTable columns={columns} data={relevamientos} searchKey="direccion" searchPlaceholder="Buscar por direccion..." />
      ) : (
        <EmptyState icon={MapPin} title="Sin relevamientos" description="Agenda un relevamiento para una oportunidad.">
          <Button render={<Link href="/comercial/relevamientos/nuevo" />}><Plus className="mr-2 h-4 w-4" />Nuevo relevamiento</Button>
        </EmptyState>
      )}
    </div>
  );
}
