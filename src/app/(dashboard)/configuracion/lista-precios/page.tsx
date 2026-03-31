"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const UNIDAD_OPTIONS = [
  { value: "hogareno", label: "Hogareño" },
  { value: "multidireccional", label: "Multidireccional" },
  { value: "armado_desarme", label: "Armado/Desarme" },
];

const FRACCION_LABELS: Record<number, string> = {
  10: "10 días",
  20: "20 días",
  30: "30 días",
};

type FormData = {
  unidad_cotizacion: string;
  producto: string;
  descripcion: string;
  fraccion_dias: number | null;
  precio: number;
  zona: string;
  activo: boolean;
};

const EMPTY_FORM: FormData = {
  unidad_cotizacion: "hogareno",
  producto: "",
  descripcion: "",
  fraccion_dias: null,
  precio: 0,
  zona: "",
  activo: true,
};

export default function ListaPreciosPage() {
  const [filterUnidad, setFilterUnidad] = useState("hogareno");
  const { data: precios, isLoading } = useListaPrecios(filterUnidad);
  const createPrecio = useCreatePrecio();
  const updatePrecio = useUpdatePrecio();
  const deletePrecio = useDeletePrecio();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, unidad_cotizacion: filterUnidad });
    setDrawerOpen(true);
  }

  function openEdit(item: PrecioItem) {
    setEditId(item.id);
    setForm({
      unidad_cotizacion: item.unidad_cotizacion,
      producto: item.producto,
      descripcion: item.descripcion || "",
      fraccion_dias: item.fraccion_dias,
      precio: item.precio,
      zona: item.zona || "",
      activo: item.activo,
    });
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    if (!form.producto || form.precio <= 0) {
      toast.error("Completá producto y precio");
      return;
    }

    try {
      if (editId) {
        await updatePrecio.mutateAsync({
          id: editId,
          data: {
            producto: form.producto,
            descripcion: form.descripcion || null,
            fraccion_dias: form.fraccion_dias,
            precio: form.precio,
            zona: form.zona || null,
            activo: form.activo,
          },
        });
        toast.success("Precio actualizado");
      } else {
        await createPrecio.mutateAsync({
          unidad_cotizacion: form.unidad_cotizacion,
          producto: form.producto,
          descripcion: form.descripcion || null,
          fraccion_dias: form.fraccion_dias,
          precio: form.precio,
          zona: form.zona || null,
          precio_flete: null,
          activo: form.activo,
        });
        toast.success("Precio creado");
      }
      setDrawerOpen(false);
    } catch {
      toast.error("Error al guardar");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePrecio.mutateAsync(id);
      toast.success("Precio eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  // Agrupar por producto
  const grouped = new Map<string, PrecioItem[]>();
  precios?.forEach((p) => {
    const key = p.producto;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  });

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
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar precio
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
          {precios?.length || 0} precios
        </span>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código producto</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Fracción</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {precios && precios.length > 0 ? (
                precios.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.producto}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.descripcion || "—"}
                    </TableCell>
                    <TableCell>
                      {item.fraccion_dias ? (
                        <Badge variant="outline" className="text-xs">
                          {FRACCION_LABELS[item.fraccion_dias] ||
                            `${item.fraccion_dias}d`}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      $
                      {Number(item.precio).toLocaleString("es-AR", {
                        minimumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.activo ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {item.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay precios para esta unidad
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Drawer agregar/editar */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editId ? "Editar precio" : "Nuevo precio"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Unidad de cotización</Label>
              <Select
                value={form.unidad_cotizacion}
                onValueChange={(v) =>
                  v && setForm({ ...form, unidad_cotizacion: v })
                }
                disabled={!!editId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDAD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Código producto *</Label>
              <Input
                value={form.producto}
                onChange={(e) =>
                  setForm({ ...form, producto: e.target.value })
                }
                placeholder="Ej: MOD-AND-STD-130x250x180"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={(e) =>
                  setForm({ ...form, descripcion: e.target.value })
                }
                placeholder="Ej: Módulo de Andamio STD 1,30 X 2,50 X 1,80"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fracción (días)</Label>
                <Select
                  value={form.fraccion_dias?.toString() || ""}
                  onValueChange={(v) =>
                    v &&
                    setForm({ ...form, fraccion_dias: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 días</SelectItem>
                    <SelectItem value="20">20 días</SelectItem>
                    <SelectItem value="30">30 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Precio ($) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.precio || ""}
                  onChange={(e) =>
                    setForm({ ...form, precio: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Zona (opcional)</Label>
              <Input
                value={form.zona}
                onChange={(e) =>
                  setForm({ ...form, zona: e.target.value })
                }
                placeholder="Ej: CABA, GBA Norte..."
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSubmit}
                disabled={
                  createPrecio.isPending || updatePrecio.isPending
                }
              >
                {(createPrecio.isPending || updatePrecio.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editId ? "Guardar cambios" : "Crear precio"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
