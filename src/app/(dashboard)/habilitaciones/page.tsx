"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useOrdenesPendientesHabilitacion, useUpdateOrdenTrabajo, type OrdenTrabajo } from "@/hooks/use-ordenes-trabajo";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ShieldCheck, Loader2, Shield } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// Módulo crítico (flujo ABA): el área Habilitaciones ve las OTs bloqueadas
// (requiere_habilitacion && !habilitacion_aprobada) y las libera una vez gestionados
// nóminas / pólizas RT / no repetición / SPA del personal.
const TIPO_OT_LABELS: Record<string, string> = {
  armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro",
};

export default function HabilitacionesPage() {
  const { data: ots, isLoading } = useOrdenesPendientesHabilitacion();
  const updateOT = useUpdateOrdenTrabajo();

  function habilitar(ot: OrdenTrabajo) {
    updateOT.mutate(
      { id: ot.id, data: { habilitacion_aprobada: true } },
      {
        onSuccess: () => toast.success(`OT ${ot.codigo} habilitada`),
        onError: () => toast.error("Error al habilitar"),
      },
    );
  }

  const columns: ColumnDef<OrdenTrabajo>[] = [
    { accessorKey: "codigo", header: "OT", cell: ({ row }) => <span className="font-mono text-sm">{row.original.codigo}</span> },
    { id: "obra", header: "Obra", cell: ({ row }) => row.original.obras
      ? <Link href={`/obras/${row.original.obra_id}`} className="text-primary hover:underline">{row.original.obras.codigo} — {row.original.obras.nombre}</Link>
      : "—" },
    { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => TIPO_OT_LABELS[row.original.tipo] || row.original.tipo },
    { accessorKey: "fecha_programada", header: "Programada", cell: ({ row }) => formatDate(row.original.fecha_programada) },
    { id: "estado", header: "Estado", cell: () => <Badge variant="outline" className="gap-1 bg-red-500/15 text-red-400 border-red-500/25"><Shield className="h-3 w-3" />Bloqueada</Badge> },
    { id: "accion", header: "", cell: ({ row }) => (
      <Button size="sm" onClick={() => habilitar(row.original)} disabled={updateOT.isPending}>
        {updateOT.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Habilitar
      </Button>
    ) },
  ];

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  const n = ots?.length || 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Habilitaciones" description={`${n} ${n === 1 ? "OT esperando" : "OTs esperando"} habilitación`} />
      {ots && ots.length > 0 ? (
        <DataTable columns={columns} data={ots} searchKey="codigo" searchPlaceholder="Buscar OT..." />
      ) : (
        <EmptyState icon={ShieldCheck} title="Todo habilitado" description="No hay órdenes de trabajo esperando habilitación." />
      )}
    </div>
  );
}
