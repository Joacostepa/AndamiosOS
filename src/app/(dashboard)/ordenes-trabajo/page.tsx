"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useOrdenesTrabajo, type OrdenTrabajo } from "@/hooks/use-ordenes-trabajo";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ListOrdered, Shield, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";

// Vista global de OTs para Operaciones (las OTs bajan de Odoo; acá se ven todas,
// con su bloqueo de habilitación explícito). Las acciones de ciclo viven en la obra.
const TIPO_OT_LABELS: Record<string, string> = {
  armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro",
};

const columns: ColumnDef<OrdenTrabajo>[] = [
  { accessorKey: "codigo", header: "OT", cell: ({ row }) => <span className="font-mono text-sm">{row.original.codigo}</span> },
  { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras
    ? <Link href={`/obras/${row.original.obra_id}`} className="text-primary hover:underline">{row.original.obras.codigo} — {row.original.obras.nombre}</Link>
    : "—" },
  { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => TIPO_OT_LABELS[row.original.tipo] || row.original.tipo },
  { accessorKey: "fecha_programada", header: "Programada", cell: ({ row }) => formatDate(row.original.fecha_programada) },
  { id: "estado", header: "Estado", cell: ({ row }) =>
    row.original.requiere_habilitacion && !row.original.habilitacion_aprobada && row.original.estado === "pendiente"
      ? <Badge variant="outline" className="gap-1 bg-red-500/15 text-red-400 border-red-500/25"><Shield className="h-3 w-3" />Pend. habilitación</Badge>
      : <StatusBadge status={row.original.estado} /> },
  { id: "habilitacion", header: "Habilitación", cell: ({ row }) => !row.original.requiere_habilitacion
    ? <span className="text-muted-foreground text-sm">No requiere</span>
    : row.original.habilitacion_aprobada
      ? <CheckCircle className="h-4 w-4 text-green-400" />
      : <Clock className="h-4 w-4 text-yellow-400" /> },
];

export default function OrdenesTrabajoPage() {
  const { data: ots, isLoading } = useOrdenesTrabajo();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  const total = ots?.length || 0;
  const bloqueadas = ots?.filter((o) => o.requiere_habilitacion && !o.habilitacion_aprobada && o.estado === "pendiente").length || 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Órdenes de Trabajo" description={`${total} en total · ${bloqueadas} esperando habilitación`} />
      {ots && ots.length > 0 ? (
        <DataTable columns={columns} data={ots} searchKey="codigo" searchPlaceholder="Buscar OT..." />
      ) : (
        <EmptyState icon={ListOrdered} title="Sin órdenes de trabajo" description="Las OTs se generan desde Odoo (Comercial) y bajan a la app, o se crean desde el detalle de una obra." />
      )}
    </div>
  );
}
