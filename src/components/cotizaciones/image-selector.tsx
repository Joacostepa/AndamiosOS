"use client";

import { useState } from "react";
import { useImagenesReferencia } from "@/hooks/use-imagenes-referencia";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Image as ImageIcon } from "lucide-react";

interface ImageSelectorProps {
  categoria: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ImageSelector({ categoria, selectedIds, onSelectionChange }: ImageSelectorProps) {
  const { data: imagenes, isLoading } = useImagenesReferencia(categoria);

  if (isLoading) return null;
  if (!imagenes || imagenes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-50" />
        <p>No hay imágenes de referencia para esta categoría</p>
        <p className="text-xs mt-1">Cargalas desde Configuración &gt; Imágenes</p>
      </div>
    );
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Imágenes de referencia</Label>
      <p className="text-xs text-muted-foreground">Seleccioná las imágenes que se incluirán en el PDF</p>
      <div className="grid grid-cols-3 gap-3">
        {imagenes.map((img) => {
          const isSelected = selectedIds.includes(img.id);
          return (
            <button
              key={img.id}
              type="button"
              className={cn(
                "relative rounded-lg border overflow-hidden transition-all hover:border-primary/50",
                isSelected && "ring-2 ring-primary border-primary"
              )}
              onClick={() => toggle(img.id)}
            >
              <img
                src={img.url}
                alt={img.titulo}
                className="w-full h-28 object-cover"
              />
              <div className="p-2">
                <p className="text-xs font-medium truncate">{img.titulo}</p>
                {img.descripcion && (
                  <p className="text-[10px] text-muted-foreground truncate">{img.descripcion}</p>
                )}
              </div>
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs text-primary">{selectedIds.length} imagen{selectedIds.length > 1 ? "es" : ""} seleccionada{selectedIds.length > 1 ? "s" : ""}</p>
      )}
    </div>
  );
}
