"use client";

import { Printer } from "lucide-react";

/** «Guardar PDF»: la impresión del navegador (en el celular, Compartir → Guardar como PDF). */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#AF2C19] px-4 text-[14px] font-semibold text-white hover:bg-[#8f2414] print:hidden"
    >
      <Printer className="size-4" aria-hidden /> Guardar PDF
    </button>
  );
}
