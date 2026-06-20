"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useComputos, type Computo } from "@/hooks/use-computos";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { Calculator, Plus, Building2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const columns: ColumnDef<Computo>[] = [
  {
    id: "obra",
    header: "Obra",
    cell: ({ row }) => (
      <Link href={`/oficina-tecnica/computos/${row.original.id}`} className="font-medium hover:text-primary transition-colors">
        {row.original.obras ? `${row.original.obras.codigo} — ${row.original.obras.nombre}` : "—"}
      </Link>
    ),
  },
  { accessorKey: "version", header: "Version", cell: ({ row }) => `v${row.original.version}` },
  { accessorKey: "estado", header: "Estado", cell: ({ row }) => <StatusBadge status={row.original.estado} /> },
  { accessorKey: "created_at", header: "Creado", cell: ({ row }) => formatDate(row.original.created_at) },
];

export default function ComputosPage() {
  const { data: computos, isLoading } = useComputos();
  const { data: obras } = useObras();

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  // Obras que todavía no tienen cómputo → Oficina Técnica las ve como pendientes.
  const conComputo = new Set((computos ?? []).map((c) => c.obra_id));
  const pendientes = (obras ?? []).filter((o) => o.estado !== "cancelada" && o.estado !== "desarmado" && !conComputo.has(o.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Computos de Materiales" description="Cómputo madre de cada obra (lista de piezas)">
        <Button render={<Link href="/oficina-tecnica/computos/nuevo" />}>
          <Plus className="mr-2 h-4 w-4" />Nuevo computo
        </Button>
      </PageHeader>

      {pendientes.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-yellow-400" />
              Obras pendientes de cómputo ({pendientes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendientes.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.nombre}</p>
                  <p className="font-mono text-xs text-muted-foreground">{o.codigo}</p>
                </div>
                <Button size="sm" variant="outline" render={<Link href={`/oficina-tecnica/computos/nuevo?obra=${o.id}`} />}>
                  <Plus className="mr-1 h-4 w-4" />Computar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {computos && computos.length > 0 ? (
        <DataTable columns={columns} data={computos} searchKey="obra" searchPlaceholder="Buscar..." />
      ) : (
        <EmptyState icon={Calculator} title="Sin computos" description="Generá el cómputo madre de una obra desde las obras pendientes de arriba." />
      )}
    </div>
  );
}
