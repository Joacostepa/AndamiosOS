"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useCotizaciones, type Cotizacion } from "@/hooks/use-cotizaciones";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Plus, FileText } from "lucide-react";
import { UNIDAD_LABELS } from "@/types/cotizacion-form";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const columns: ColumnDef<Cotizacion>[] = [
  { accessorKey: "codigo", header: "Codigo", cell: ({ row }) => <Link href={`/comercial/cotizaciones/${row.original.id}`} className="font-mono text-sm font-medium hover:text-primary transition-colors">{row.original.codigo}</Link> },
  { accessorKey: "titulo", header: "Titulo" },
  { id: "unidad", header: "Unidad", cell: ({ row }) => {
    const u = row.original.unidad_cotizacion as keyof typeof UNIDAD_LABELS | null;
    return u ? <Badge variant="outline" className="text-xs">{UNIDAD_LABELS[u] || u}</Badge> : "—";
  }},
  { id: "cliente", header: "Cliente", cell: ({ row }) => row.original.clientes?.razon_social || row.original.oportunidades?.titulo || "—" },
  { accessorKey: "version", header: "Ver.", cell: ({ row }) => `v${row.original.version}` },
  { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="font-semibold">${Number(row.original.total).toLocaleString()}</span> },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "fecha_vencimiento", header: "Vence", cell: ({ row }) => formatDate(row.original.fecha_vencimiento) },
];

export default function CotizacionesPage() {
  const { data: cotizaciones, isLoading } = useCotizaciones();
  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Cotizaciones" description="Presupuestos y propuestas comerciales">
        <Button render={<Link href="/comercial/cotizaciones/nueva" />}><Plus className="mr-2 h-4 w-4" />Nueva cotizacion</Button>
      </PageHeader>
      {cotizaciones && cotizaciones.length > 0 ? (
        <DataTable columns={columns} data={cotizaciones} searchKey="codigo" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={FileText} title="Sin cotizaciones" description="Crea tu primera cotizacion.">
          <Button render={<Link href="/comercial/cotizaciones/nueva" />}><Plus className="mr-2 h-4 w-4" />Nueva cotizacion</Button>
        </EmptyState>
      )}
    </div>
  );
}
