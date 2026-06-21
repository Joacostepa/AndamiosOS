"use client";

import { ClipboardCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function Metrica({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-bold leading-none" style={{ color: "#D85A30" }}>
        {valor}
      </span>
      <span className="mt-1 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// Barra de resumen inferior fija (ancho completo). Métricas acumuladas de TODO el cómputo.
export function ResumenBar({
  itemsSeleccionados,
  unidadesTotales,
  categorias,
  modoLectura = false,
  guardando = false,
  onConfirmar,
}: {
  itemsSeleccionados: number;
  unidadesTotales: number;
  categorias: number;
  modoLectura?: boolean;
  guardando?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 flex items-center gap-8 border-t bg-secondary px-6 py-3">
      <Metrica valor={itemsSeleccionados} label="Ítems seleccionados" />
      <Metrica valor={unidadesTotales} label="Unidades totales" />
      <Metrica valor={categorias} label="Categorías" />

      <div className="ml-auto flex items-center gap-3">
        {guardando && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando…
          </span>
        )}
        {!modoLectura && (
          <Button
            onClick={onConfirmar}
            disabled={itemsSeleccionados === 0}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Confirmar cómputo
          </Button>
        )}
      </div>
    </div>
  );
}
