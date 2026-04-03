"use client";

import { useState, useRef } from "react";
import {
  useImagenesReferencia,
  useCreateImagenReferencia,
  useDeleteImagenReferencia,
} from "@/hooks/use-imagenes-referencia";
import { createClient } from "@/lib/supabase/client";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const CATEGORIAS = [
  { value: "fachadas", label: "Fachadas" },
  { value: "industria", label: "Industria" },
  { value: "construccion", label: "Construcción" },
  { value: "eventos", label: "Eventos" },
  { value: "obra_publica", label: "Obra pública" },
  { value: "estructuras_especiales", label: "Estructuras especiales" },
  { value: "general", label: "General" },
];

export default function ImagenesPage() {
  const [filterCat, setFilterCat] = useState("");
  const { data: imagenes, isLoading } = useImagenesReferencia(filterCat || undefined);
  const createImagen = useCreateImagenReferencia();
  const deleteImagen = useDeleteImagenReferencia();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("fachadas");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo imágenes"); return; }
    if (!titulo.trim()) { toast.error("Ponele un título primero"); return; }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const fileName = `imagenes-referencia/${Date.now()}-${titulo.replace(/\s+/g, "-").toLowerCase()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("empresa")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("empresa")
        .getPublicUrl(fileName);

      await createImagen.mutateAsync({
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        categoria,
        url: publicUrl,
      });

      toast.success("Imagen subida");
      setDrawerOpen(false);
      setTitulo("");
      setDescripcion("");
    } catch (err: any) {
      toast.error("Error: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteImagen.mutateAsync(id);
      toast.success("Imagen eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Imágenes de referencia" description="Renders y esquemas técnicos para adjuntar en cotizaciones">
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Subir imagen
        </Button>
      </PageHeader>

      {/* Filtro por categoría */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">Categoría:</Label>
        <div className="flex gap-1 flex-wrap">
          <Button variant={filterCat === "" ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setFilterCat("")}>Todas</Button>
          {CATEGORIAS.map((c) => (
            <Button key={c.value} variant={filterCat === c.value ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => setFilterCat(c.value)}>
              {c.label}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">{imagenes?.length || 0} imágenes</span>
      </div>

      {/* Galería */}
      {imagenes && imagenes.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {imagenes.map((img) => (
            <Card key={img.id} className="overflow-hidden">
              <img src={img.url} alt={img.titulo} className="w-full h-40 object-cover" />
              <CardContent className="p-3 space-y-1">
                <p className="font-medium text-sm truncate">{img.titulo}</p>
                {img.descripcion && <p className="text-xs text-muted-foreground truncate">{img.descripcion}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground capitalize">{img.categoria}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(img.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No hay imágenes cargadas</p>
          <p className="text-xs mt-1">Subí renders o esquemas técnicos para usar en las cotizaciones</p>
        </div>
      )}

      {/* Drawer subir imagen */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Subir imagen de referencia</SheetTitle></SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Andamio fachada 8 pisos con bandeja" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle opcional..." />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={(v) => v && setCategoria(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Archivo de imagen</Label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading || !titulo.trim()}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Subiendo..." : "Seleccionar y subir"}
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG o WebP. Recomendado: renders de SketchUp o esquemas técnicos.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
