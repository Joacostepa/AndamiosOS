"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useCatalogo, type Pieza } from "@/hooks/use-catalogo";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Wrench } from "lucide-react";

// NOTA: El catálogo de piezas es read-only — la fuente de verdad es Odoo (product.product),
// se sincroniza vía /api/odoo/sync/materiales. No hay ABM en la app.
const columns: ColumnDef<Pieza>[] = [
  {
    accessorKey: "codigo",
    header: "Codigo",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.codigo}</span>
    ),
  },
  {
    accessorKey: "descripcion",
    header: "Descripcion",
  },
  {
    accessorKey: "categoria",
    header: "Categoria",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.categoria}</span>
    ),
  },
  {
    accessorKey: "sistema_andamio",
    header: "Sistema",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.sistema_andamio}</span>
    ),
  },
  {
    accessorKey: "peso_kg",
    header: "Peso (kg)",
    cell: ({ row }) =>
      row.original.peso_kg ? `${row.original.peso_kg} kg` : "—",
  },
  {
    accessorKey: "stock_minimo",
    header: "Stock min.",
  },
];

export default function CatalogoPage() {
  const { data: piezas, isLoading } = useCatalogo();

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
        title="Catalogo de Piezas"
        description="Sincronizado desde Odoo · solo lectura"
      />

      {piezas && piezas.length > 0 ? (
        <DataTable
          columns={columns}
          data={piezas}
          searchKey="descripcion"
          searchPlaceholder="Buscar por descripcion..."
        />
      ) : (
        <EmptyState
          icon={Wrench}
          title="Catalogo vacio"
          description="Los materiales se sincronizan desde Odoo."
        />
      )}
    </div>
  );
}
