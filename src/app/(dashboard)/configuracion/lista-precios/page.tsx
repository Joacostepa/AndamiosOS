"use client";

import { useState, useEffect } from "react";
import {
  useListaPrecios,
  useCreatePrecio,
  useUpdatePrecio,
  useDeletePrecio,
  type PrecioItem,
} from "@/hooks/use-lista-precios";
import { useCatalogo } from "@/hooks/use-catalogo";
import { PageHeader } from "@/components/shared/page-header";
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
import { Plus, Trash2, Loader2, Save, Check } from "lucide-react";
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
  precios: {
    [fraccion: number]: { id: string; precio: number } | undefined;
  };
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
    if (!group.descripcion && item.descripcion)
      group.descripcion = item.descripcion;
    if (item.fraccion_dias) {
      group.precios[item.fraccion_dias] = {
        id: item.id,
        precio: item.precio,
      };
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    a.descripcion.localeCompare(b.descripcion)
  );
}

export default function ListaPreciosPage() {
  const [filterUnidad, setFilterUnidad] = useState("hogareno");
  const { data: precios, isLoading } = useListaPrecios(filterUnidad);
  const { data: catalogo } = useCatalogo();
  const createPrecio = useCreatePrecio();
  const updatePrecio = useUpdatePrecio();
  const deletePrecio = useDeletePrecio();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPieza, setSelectedPieza] = useState("");
  const [newPrecios, setNewPrecios] = useState<Record<number, number>>({
    10: 0,
    20: 0,
    30: 0,
  });
  const [saving, setSaving] = useState(false);

  // Editable prices: includes existing IDs and new entries keyed as "producto:fraccion"
  const [editPrices, setEditPrices] = useState<Record<string, number>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  const grouped = precios ? groupByProduct(precios) : [];

  // Products already in the list
  const existingProducts = new Set(grouped.map((g) => g.producto));

  // Available catalog items not yet in the price list
  const availablePiezas =
    catalogo?.filter((p) => !existingProducts.has(p.codigo)) || [];

  // Initialize edit prices when data loads
  useEffect(() => {
    if (precios) {
      const prices: Record<string, number> = {};
      precios.forEach((p) => {
        prices[p.id] = p.precio;
      });
      setEditPrices(prices);
      setDirtyKeys(new Set());
    }
  }, [precios]);

  function handlePriceChange(key: string, value: number) {
    setEditPrices((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  }

  // Key for new (non-existing) fraction entries
  function newKey(producto: string, fraccion: number) {
    return `new:${producto}:${fraccion}`;
  }

  function handleNewFractionChange(
    producto: string,
    descripcion: string,
    fraccion: number,
    value: number
  ) {
    const key = newKey(producto, fraccion);
    setEditPrices((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  }

  async function saveAllChanges() {
    if (dirtyKeys.size === 0) return;
    setSaving(true);
    try {
      for (const key of dirtyKeys) {
        if (key.startsWith("new:")) {
          // Create new price entry
          const parts = key.split(":");
          const producto = parts[1];
          const fraccion = parseInt(parts[2]);
          const precio = editPrices[key];
          if (precio > 0) {
            const group = grouped.find((g) => g.producto === producto);
            await createPrecio.mutateAsync({
              unidad_cotizacion: filterUnidad,
              producto,
              descripcion: group?.descripcion || null,
              fraccion_dias: fraccion,
              precio,
              zona: null,
              precio_flete: null,
              activo: true,
            });
          }
        } else {
          // Update existing
          await updatePrecio.mutateAsync({
            id: key,
            data: { precio: editPrices[key] },
          });
        }
      }
      setDirtyKeys(new Set());
      toast.success("Precios guardados");
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

  async function handleAddFromCatalog() {
    if (!selectedPieza) {
      toast.error("Seleccioná un producto del catálogo");
      return;
    }
    const pieza = catalogo?.find((p) => p.codigo === selectedPieza);
    if (!pieza) return;

    setSaving(true);
    try {
      for (const fraccion of FRACCIONES) {
        if (newPrecios[fraccion] > 0) {
          await createPrecio.mutateAsync({
            unidad_cotizacion: filterUnidad,
            producto: pieza.codigo,
            descripcion: pieza.descripcion,
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
      setSelectedPieza("");
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
                <TableHead className="text-center w-[120px]">
                  10 días
                </TableHead>
                <TableHead className="text-center w-[120px]">
                  20 días
                </TableHead>
                <TableHead className="text-center w-[120px]">
                  30 días
                </TableHead>
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
                      const nk = newKey(group.producto, fraccion);
                      return (
                        <TableCell
                          key={fraccion}
                          className="text-center p-1"
                        >
                          {entry ? (
                            <Input
                              type="number"
                              min={0}
                              step="100"
                              value={editPrices[entry.id] ?? entry.precio}
                              onChange={(e) =>
                                handlePriceChange(
                                  entry.id,
                                  Number(e.target.value)
                                )
                              }
                              className={`h-8 text-xs text-center w-24 mx-auto ${
                                dirtyKeys.has(entry.id)
                                  ? "border-primary ring-1 ring-primary/30"
                                  : ""
                              }`}
                            />
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              step="100"
                              value={editPrices[nk] || ""}
                              onChange={(e) =>
                                handleNewFractionChange(
                                  group.producto,
                                  group.descripcion,
                                  fraccion,
                                  Number(e.target.value)
                                )
                              }
                              placeholder="—"
                              className={`h-8 text-xs text-center w-24 mx-auto ${
                                dirtyKeys.has(nk)
                                  ? "border-primary ring-1 ring-primary/30"
                                  : ""
                              }`}
                            />
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

      {/* Botón confirmar edición */}
      {dirtyKeys.size > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            onClick={saveAllChanges}
            disabled={saving}
            className="shadow-lg px-8"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Confirmar cambios ({dirtyKeys.size})
          </Button>
        </div>
      )}

      {/* Drawer agregar producto desde catálogo */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Agregar producto a la lista</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Producto del catálogo *</Label>
              <Select
                value={selectedPieza}
                onValueChange={(v) => v && setSelectedPieza(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Buscar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {availablePiezas.length > 0 ? (
                    availablePiezas.map((p) => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        <span className="font-mono text-xs mr-2">
                          {p.codigo}
                        </span>
                        {p.descripcion}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="_empty" disabled>
                      Todos los productos ya están en la lista
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {selectedPieza && catalogo && (
                <p className="text-xs text-muted-foreground">
                  {
                    catalogo.find((p) => p.codigo === selectedPieza)
                      ?.descripcion
                  }
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Precios por fracción</Label>
              {FRACCIONES.map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-16">
                    {f} días
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="100"
                    value={newPrecios[f] || ""}
                    onChange={(e) =>
                      setNewPrecios((prev) => ({
                        ...prev,
                        [f]: Number(e.target.value),
                      }))
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
              <Button onClick={handleAddFromCatalog} disabled={saving}>
                {saving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Agregar producto
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
