"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useStock, type StockItem } from "@/hooks/use-stock";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const columns: ColumnDef<StockItem>[] = [
  {
    id: "codigo",
    header: "Codigo",
    cell: ({ row }) => (
      <Link
        href={`/deposito/stock/${row.original.pieza_id}`}
        className="font-mono text-sm font-medium hover:text-primary transition-colors"
      >
        {row.original.catalogo_piezas.codigo}
      </Link>
    ),
  },
  {
    id: "descripcion",
    header: "Descripcion",
    cell: ({ row }) => row.original.catalogo_piezas.descripcion,
    filterFn: "includesString",
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => (
      <span className="font-semibold">{row.original.total}</span>
    ),
  },
  {
    accessorKey: "en_deposito",
    header: "Deposito",
    cell: ({ row }) => row.original.en_deposito,
  },
  {
    accessorKey: "comprometido",
    header: "Comprometido",
    cell: ({ row }) =>
      row.original.comprometido > 0 ? (
        <span className="text-yellow-400">{row.original.comprometido}</span>
      ) : (
        0
      ),
  },
  {
    accessorKey: "en_obras",
    header: "En obras",
    cell: ({ row }) =>
      row.original.en_obras > 0 ? (
        <span className="text-blue-400">{row.original.en_obras}</span>
      ) : (
        0
      ),
  },
  {
    accessorKey: "en_transito",
    header: "En transito",
    cell: ({ row }) =>
      row.original.en_transito > 0 ? (
        <span className="text-orange-400">{row.original.en_transito}</span>
      ) : (
        0
      ),
  },
  {
    accessorKey: "danado",
    header: "Danado",
    cell: ({ row }) =>
      row.original.danado > 0 ? (
        <span className="text-red-400">{row.original.danado}</span>
      ) : (
        0
      ),
  },
  {
    id: "estado",
    header: "Estado",
    cell: ({ row }) => {
      const { en_deposito, catalogo_piezas } = row.original;
      const bajoMinimo = en_deposito < catalogo_piezas.stock_minimo;
      return bajoMinimo ? (
        <Badge
          variant="outline"
          className="bg-red-500/15 text-red-400 border-red-500/25"
        >
          Bajo minimo
        </Badge>
      ) : null;
    },
  },
];

export default function StockPage() {
  const { data: stock, isLoading } = useStock();

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
        title="Stock"
        description="Inventario de materiales en tiempo real"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Piezas unicas"
          value={stock?.length || 0}
        />
        <SummaryCard
          label="Total en deposito"
          value={stock?.reduce((sum, s) => sum + s.en_deposito, 0) || 0}
        />
        <SummaryCard
          label="En obras"
          value={stock?.reduce((sum, s) => sum + s.en_obras, 0) || 0}
        />
        <SummaryCard
          label="Bajo minimo"
          value={
            stock?.filter(
              (s) => s.en_deposito < s.catalogo_piezas.stock_minimo
            ).length || 0
          }
          alert
        />
      </div>

      {stock && (
        <DataTable
          columns={columns}
          data={stock}
          searchKey="codigo"
          searchPlaceholder="Buscar por codigo..."
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${alert && value > 0 ? "text-red-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}
