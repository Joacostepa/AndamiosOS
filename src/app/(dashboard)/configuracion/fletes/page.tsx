"use client";

import { useState, useEffect } from "react";
import {
  useFletes,
  useCreateFlete,
  useUpdateFlete,
  useDeleteFlete,
} from "@/hooks/use-fletes";
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
import { Plus, Trash2, Loader2, Check, Search } from "lucide-react";
import { toast } from "sonner";

export default function FletesPage() {
  const { data: fletes, isLoading } = useFletes();
  const createFlete = useCreateFlete();
  const updateFlete = useUpdateFlete();
  const deleteFlete = useDeleteFlete();

  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newZona, setNewZona] = useState("");
  const [newPrecio, setNewPrecio] = useState(0);
  const [saving, setSaving] = useState(false);

  // Editable prices
  const [editPrices, setEditPrices] = useState<Record<string, number>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (fletes) {
      const prices: Record<string, number> = {};
      fletes.forEach((f) => { prices[f.id] = f.precio; });
      setEditPrices(prices);
      setDirtyIds(new Set());
    }
  }, [fletes]);

  function handlePriceChange(id: string, value: number) {
    setEditPrices((prev) => ({ ...prev, [id]: value }));
    setDirtyIds((prev) => new Set(prev).add(id));
  }

  async function saveAllChanges() {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    try {
      for (const id of dirtyIds) {
        await updateFlete.mutateAsync({ id, data: { precio: editPrices[id] } });
      }
      setDirtyIds(new Set());
      toast.success(`${dirtyIds.size} precio${dirtyIds.size > 1 ? "s" : ""} actualizado${dirtyIds.size > 1 ? "s" : ""}`);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFlete.mutateAsync(id);
      toast.success("Zona eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  async function handleCreate() {
    if (!newZona || newPrecio <= 0) {
      toast.error("Completá zona y precio");
      return;
    }
    try {
      await createFlete.mutateAsync({ zona: newZona.toUpperCase(), precio: newPrecio });
      toast.success("Zona agregada");
      setDrawerOpen(false);
      setNewZona("");
      setNewPrecio(0);
    } catch {
      toast.error("Error al crear (¿la zona ya existe?)");
    }
  }

  const filtered = fletes?.filter((f) =>
    f.zona.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fletes por zona"
        description="Precios de envío + retiro por barrio/localidad (alquileres hogareños)"
      >
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar zona
        </Button>
      </PageHeader>

      {/* Buscador */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar zona..."
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} de {fletes?.length || 0} zonas
        </span>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zona / Barrio</TableHead>
                <TableHead className="text-right w-[180px]">Precio (envío + retiro)</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? (
                filtered.map((flete) => (
                  <TableRow key={flete.id}>
                    <TableCell className="font-medium">{flete.zona}</TableCell>
                    <TableCell className="text-right p-1">
                      <Input
                        type="number"
                        min={0}
                        step="500"
                        value={editPrices[flete.id] ?? flete.precio}
                        onChange={(e) => handlePriceChange(flete.id, Number(e.target.value))}
                        className={`h-8 text-sm text-right w-32 ml-auto ${
                          dirtyIds.has(flete.id) ? "border-primary ring-1 ring-primary/30" : ""
                        }`}
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(flete.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    {search ? "No se encontraron zonas" : "No hay zonas cargadas"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Botón confirmar */}
      {dirtyIds.size > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button size="lg" onClick={saveAllChanges} disabled={saving} className="shadow-lg px-8">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Confirmar cambios ({dirtyIds.size})
          </Button>
        </div>
      )}

      {/* Drawer agregar zona */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Agregar zona</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Zona / Barrio *</Label>
              <Input
                value={newZona}
                onChange={(e) => setNewZona(e.target.value)}
                placeholder="Ej: VILLA URQUIZA"
              />
            </div>
            <div className="space-y-2">
              <Label>Precio envío + retiro ($) *</Label>
              <Input
                type="number"
                min={0}
                step="500"
                value={newPrecio || ""}
                onChange={(e) => setNewPrecio(Number(e.target.value))}
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleCreate} disabled={createFlete.isPending}>
                {createFlete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agregar zona
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
