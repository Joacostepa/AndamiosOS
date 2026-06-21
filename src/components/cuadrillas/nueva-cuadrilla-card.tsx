"use client";

import { Plus } from "lucide-react";

export function NuevaCuadrillaCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors hover:bg-secondary hover:border-[#D85A30]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-muted-foreground group-hover:border-[#D85A30] group-hover:text-[#D85A30]">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium group-hover:text-[#D85A30]">Nueva cuadrilla</span>
      <span className="text-[11px] text-muted-foreground">Para divisiones temporales o nuevos equipos</span>
    </button>
  );
}
