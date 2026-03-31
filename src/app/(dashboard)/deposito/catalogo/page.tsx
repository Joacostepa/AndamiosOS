"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useCatalogo, useCreatePieza, type Pieza } from "@/hooks/use-catalogo";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wrench, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import type { PiezaFormData } from "@/hooks/use-catalogo";

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
  const createPieza = useCreatePieza();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<PiezaFormData>({
      defaultValues: {
        categoria: "otro",
        sistema_andamio: "multidireccional",
        unidad_medida: "unidad",
        stock_minimo: 0,
      },
    });

  function onSubmit(data: PiezaFormData) {
    createPieza.mutate(data, {
      onSuccess: () => {
        toast.success("Pieza creada correctamente");
        setDrawerOpen(false);
        reset();
      },
      onError: () => {
        toast.error("Error al crear la pieza");
      },
    });
  }

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
        description="Catalogo maestro de piezas de andamio"
      >
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva pieza
        </Button>
      </PageHeader>

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
          description="Agrega piezas al catalogo para comenzar."
        >
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva pieza
          </Button>
        </EmptyState>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nueva pieza</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Codigo *</Label>
              <Input
                id="codigo"
                {...register("codigo", { required: true })}
                placeholder="Ej: MF-150-MD"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripcion *</Label>
              <Input
                id="descripcion"
                {...register("descripcion", { required: true })}
                placeholder="Marco 1.50m multidireccional"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={watch("categoria")}
                  onValueChange={(val) => val && setValue("categoria", val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "marco",
                      "diagonal",
                      "plataforma",
                      "base",
                      "rodapie",
                      "escalera",
                      "barandilla",
                      "conector",
                      "anclaje",
                      "accesorio",
                      "otro",
                    ].map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <span className="capitalize">{cat}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sistema</Label>
                <Select
                  value={watch("sistema_andamio")}
                  onValueChange={(val) =>
                    val && setValue("sistema_andamio", val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multidireccional">
                      Multidireccional
                    </SelectItem>
                    <SelectItem value="tubular">Tubular</SelectItem>
                    <SelectItem value="colgante">Colgante</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="peso_kg">Peso (kg)</Label>
                <Input
                  id="peso_kg"
                  type="number"
                  step="0.01"
                  {...register("peso_kg", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_minimo">Stock minimo</Label>
                <Input
                  id="stock_minimo"
                  type="number"
                  {...register("stock_minimo", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createPieza.isPending}>
                {createPieza.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Crear pieza
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
