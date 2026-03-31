"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  useMovimientos,
  useCreateMovimiento,
  type Movimiento,
  type MovimientoFormData,
} from "@/hooks/use-stock";
import { useCatalogo } from "@/hooks/use-catalogo";
import { useObras } from "@/hooks/use-obras";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatDateTime } from "@/lib/utils/formatters";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const columns: ColumnDef<Movimiento>[] = [
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => (
      <span className="text-sm">{formatDateTime(row.original.fecha)}</span>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => <StatusBadge status={row.original.tipo} />,
  },
  {
    id: "pieza",
    header: "Pieza",
    cell: ({ row }) => (
      <div>
        <span className="font-mono text-sm">
          {row.original.catalogo_piezas?.codigo}
        </span>
        <br />
        <span className="text-xs text-muted-foreground">
          {row.original.catalogo_piezas?.descripcion}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "cantidad",
    header: "Cantidad",
    cell: ({ row }) => (
      <span className="font-semibold">{row.original.cantidad}</span>
    ),
  },
  {
    accessorKey: "motivo",
    header: "Motivo",
    cell: ({ row }) => row.original.motivo || "—",
  },
];

export default function MovimientosPage() {
  const { data: movimientos, isLoading } = useMovimientos();
  const createMovimiento = useCreateMovimiento();
  const { data: catalogo } = useCatalogo();
  const { data: obras } = useObras();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } =
    useForm<MovimientoFormData>({
      defaultValues: { tipo: "entrada", cantidad: 1 },
    });

  function onSubmit(data: MovimientoFormData) {
    createMovimiento.mutate(data, {
      onSuccess: () => {
        toast.success("Movimiento registrado");
        setDrawerOpen(false);
        reset();
      },
      onError: () => {
        toast.error("Error al registrar movimiento");
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

  const tipo = watch("tipo");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimientos"
        description="Registro de movimientos de stock"
      >
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo movimiento
        </Button>
      </PageHeader>

      {movimientos && (
        <DataTable
          columns={columns}
          data={movimientos}
          searchKey="tipo"
          searchPlaceholder="Filtrar..."
        />
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo movimiento</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select
                value={tipo}
                onValueChange={(val) => val && setValue("tipo", val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="salida">Salida</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pieza *</Label>
              <Select
                value={watch("pieza_id") || ""}
                onValueChange={(val) => val && setValue("pieza_id", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar pieza..." />
                </SelectTrigger>
                <SelectContent>
                  {catalogo?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} — {p.descripcion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cantidad">Cantidad *</Label>
              <Input
                id="cantidad"
                type="number"
                min={1}
                {...register("cantidad", {
                  required: true,
                  valueAsNumber: true,
                })}
              />
            </div>

            {(tipo === "salida" || tipo === "transferencia") && (
              <div className="space-y-2">
                <Label>Obra destino</Label>
                <Select
                  value={watch("obra_destino_id") || ""}
                  onValueChange={(val) => val && setValue("obra_destino_id", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {obras?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.codigo} — {o.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo</Label>
              <Textarea
                id="motivo"
                {...register("motivo")}
                placeholder="Motivo del movimiento"
                rows={2}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createMovimiento.isPending}>
                {createMovimiento.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Registrar
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
