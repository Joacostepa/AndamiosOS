"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useListaPrecios,
  useCreatePrecio,
  useUpdatePrecio,
  useDeletePrecio,
  type PrecioItem,
} from "@/hooks/use-lista-precios";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const UNIDAD_OPTIONS = [
  { value: "hogareno", label: "Hogareño" },
  { value: "multidireccional", label: "Multidireccional" },
  { value: "armado_desarme", label: "Armado/Desarme" },
];

const FRACCIONES = [10, 20, 30] as const;

type GroupedProduct = {
  producto: string;
  descripcion: string;
  precios: { [fraccion: number]: { id: string; precio: number } | undefined };
};

function groupByProduct(items: PrecioItem[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>();
  items.forEach((item) => {
    if (!map.has(item.producto)) {
      map.set(item.producto, {
        producto: item.producto,
        descripcion: item.descripcion || "",
        precios: {},
      });
    }
    const group = map.get(item.producto)!;
    if (!group.descripcion && item.descripcion) group.descripcion = item.descripcion;
    if (item.fraccion_dias) {
      group.precios[item.fraccion_dias] = { id: item.id, precio: item.precio };
    }
  });
  return Array.from(map.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
}

export default function ListaPreciosPage() {
  const [filterUnidad, setFilterUnidad] = useState("hogareno");
  const { data: precios, isLoading } = useListaPrecios(filterUnidad);
  const createPrecio = useCreatePrecio();
  const updatePrecio = useUpdatePrecio();
  const deletePrecio = useDeletePrecio();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newProducto, setNewProducto] = useState("");
  const [newDescripcion, setNewDescripcion] = useState("");
  const [newPrecios, setNewPrecios] = useState<Record<number, number>>({ 10: 0, 20: 0, 30: 0 });
  const [saving, setSaving] = useState(false);

  // Editable prices state
  const [editPrices, setEditPrices] = useState<Record<string, number>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const grouped = precios ? groupByProduct(precios) : [];

  // Initialize edit prices when data loads
  useEffect(() => {
    if (precios) {
      const prices: Record<string, number> = {};
      precios.forEach((p) => { prices[p.id] = p.precio; });
      setEditPrices(prices);
      setDirtyIds(new Set());
    }
  }, [precios]);

  function handlePriceChange(id: string, value: number) {
    setEditPrices((prev) => ({ ...prev, [id]: value }));
    setDirtyIds((prev) => new Set(prev).add(id));
  }

  async function saveAllChanges() {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    try {
      for (const id of dirtyIds) {
        await updatePrecio.mutateAsync({ id, data: { precio: editPrices[id] } });
      }
      setDirtyIds(new Set());
      toast.success(`${dirtyIds.size} precio${dirtyIds.size > 1 ? "s" : ""} actualizado${dirtyIds.size > 1 ? "s" : ""}`);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct(group: GroupedProduct) {
    try {
      for (const fraccion of FRACCIONES) {
        const entry = group.precios[fraccion];
        if (entry) await deletePrecio.mutateAsync(entry.id);
      }
      toast.success("Producto eliminado de la lista");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  async function handleCreateProduct() {
    if (!newProducto) {
      toast.error("Completá el código de producto");
      return;
    }
    setSaving(true);
    try {
      for (const fraccion of FRACCIONES) {
        if (newPrecios[fraccion] > 0) {
          await createPrecio.mutateAsync({
            unidad_cotizacion: filterUnidad,
            producto: newProducto,
            descripcion: newDescripcion || null,
            fraccion_dias: fraccion,
            precio: newPrecios[fraccion],
            zona: null,
            precio_flete: null,
            activo: true,
          });
        }
      }
      toast.success("Producto agregado a la lista");
      setDrawerOpen(false);
      setNewProducto("");
      setNewDescripcion("");
      setNewPrecios({ 10: 0, 20: 0, 30: 0 });
    } catch {
      toast.error("Error al crear");
    } finally {
      setSaving(false);
    }
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
        title="Lista de precios"
        description="Precios por unidad de negocio y fracción de alquiler"
      >
        {dirtyIds.size > 0 && (
          <Button variant="outline" onClick={saveAllChanges} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar cambios ({dirtyIds.size})
          </Button>
        )}
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar producto
        </Button>
      </PageHeader>

      {/* Filtro por unidad */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">Unidad:</Label>
        <div className="flex gap-1">
          {UNIDAD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filterUnidad === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterUnidad(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {grouped.length} productos
        </span>
      </div>

      {/* Tabla agrupada */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Producto</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-center w-[120px]">10 días</TableHead>
                <TableHead className="text-center w-[120px]">20 días</TableHead>
                <TableHead className="text-center w-[120px]">30 días</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.length > 0 ? (
                grouped.map((group) => (
                  <TableRow key={group.producto}>
                    <TableCell className="font-mono text-xs">
                      {group.producto}
                    </TableCell>
                    <TableCell className="text-sm">
                      {group.descripcion || "—"}
                    </TableCell>
                    {FRACCIONES.map((fraccion) => {
                      const entry = group.precios[fraccion];
                      return (
                        <TableCell key={fraccion} className="text-center p-1">
                          {entry ? (
                            <Input
                              type="number"
                              min={0}
                              step="100"
                              value={editPrices[entry.id] ?? entry.precio}
                              onChange={(e) =>
                                handlePriceChange(entry.id, Number(e.target.value))
                              }
                              className={`h-8 text-xs text-center w-24 mx-auto ${
                                dirtyIds.has(entry.id)
                                  ? "border-primary ring-1 ring-primary/30"
                                  : ""
                              }`}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteProduct(group)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No hay precios para esta unidad
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Drawer agregar producto */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Agregar producto a la lista</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Código producto *</Label>
              <Input
                value={newProducto}
                onChange={(e) => setNewProducto(e.target.value)}
                placeholder="Ej: MOD-AND-STD-130x250x180"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={newDescripcion}
                onChange={(e) => setNewDescripcion(e.target.value)}
                placeholder="Ej: Módulo de Andamio STD 1,30 X 2,50 X 1,80"
              />
            </div>

            <div className="space-y-3">
              <Label>Precios por fracción</Label>
              {FRACCIONES.map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-16">{f} días</span>
                  <Input
                    type="number"
                    min={0}
                    step="100"
                    value={newPrecios[f] || ""}
                    onChange={(e) =>
                      setNewPrecios((prev) => ({ ...prev, [f]: Number(e.target.value) }))
                    }
                    placeholder="$0"
                    className="text-sm"
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Dejá en 0 las fracciones que no aplican.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleCreateProduct} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agregar producto
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
