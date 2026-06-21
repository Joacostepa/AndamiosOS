"use client";

import { cn } from "@/lib/utils";
import { iconoDeCategoria, labelDeCategoria } from "@/lib/constants/categorias-material";

export function CategoriaSidebar({
  categorias,
  activa,
  onSelect,
  conteoPorCategoria,
}: {
  categorias: string[];
  activa: string;
  onSelect: (categoria: string) => void;
  // Cantidad de ítems seleccionados (cantidad > 0) por categoría.
  conteoPorCategoria: Record<string, number>;
}) {
  return (
    <aside className="w-[260px] shrink-0 border-r pr-3">
      <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        Categorías
      </p>
      <nav className="space-y-0.5">
        {categorias.map((cat) => {
          const Icon = iconoDeCategoria(cat);
          const activo = cat === activa;
          const count = conteoPorCategoria[cat] ?? 0;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelect(cat)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                activo
                  ? "font-medium"
                  : "text-foreground hover:bg-muted/60",
              )}
              style={
                activo
                  ? { backgroundColor: "#FAECE7", color: "#993C1D" }
                  : undefined
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{labelDeCategoria(cat)}</span>
              {count > 0 && (
                <span
                  className="rounded-full px-1.5 text-[11px] font-medium"
                  style={
                    activo
                      ? { backgroundColor: "#F5C4B3", color: "#993C1D" }
                      : undefined
                  }
                >
                  <span className={cn(!activo && "text-muted-foreground")}>{count}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
