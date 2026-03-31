"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type {
  CotizacionFormData,
  UnidadCotizacion,
} from "@/types/cotizacion-form";
import {
  ITEM_TYPES_BY_UNIDAD,
  ITEM_TYPE_LABELS,
} from "@/types/cotizacion-form";

export function ItemsTable({ unidad }: { unidad: UnidadCotizacion }) {
  const { register, watch, setValue, control } =
    useFormContext<CotizacionFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const items = watch("items") || [];
  const availableTypes = ITEM_TYPES_BY_UNIDAD[unidad];

  const subtotal = items.reduce(
    (sum, item) => sum + (item.cantidad || 0) * (item.precio_unitario || 0),
    0
  );
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Items de la cotización
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              tipo: availableTypes[0],
              concepto: "",
              cantidad: 1,
              unidad: "un",
              precio_unitario: 0,
            })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Agregar item
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay items. Agregá uno manualmente o usá el asistente IA.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[140px_1fr_80px_70px_100px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
            <span>Tipo</span>
            <span>Concepto</span>
            <span>Cant.</span>
            <span>Unidad</span>
            <span>P. Unit.</span>
            <span />
          </div>

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-[140px_1fr_80px_70px_100px_32px] gap-2 items-center"
            >
              <Select
                value={items[index]?.tipo || availableTypes[0]}
                onValueChange={(val) =>
                  val && setValue(`items.${index}.tipo`, val)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ITEM_TYPE_LABELS[t] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                className="h-8 text-xs"
                {...register(`items.${index}.concepto`)}
                placeholder="Concepto..."
              />
              <Input
                className="h-8 text-xs"
                type="number"
                step="0.01"
                {...register(`items.${index}.cantidad`, {
                  valueAsNumber: true,
                })}
              />
              <Input
                className="h-8 text-xs"
                {...register(`items.${index}.unidad`)}
                placeholder="un"
              />
              <Input
                className="h-8 text-xs"
                type="number"
                step="0.01"
                {...register(`items.${index}.precio_unitario`, {
                  valueAsNumber: true,
                })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (21%)</span>
            <span>${iva.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-bold text-base border-t pt-1">
            <span>Total</span>
            <span className="text-primary">
              ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
