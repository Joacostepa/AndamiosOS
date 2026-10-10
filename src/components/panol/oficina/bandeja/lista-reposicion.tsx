"use client";

// La lista de reposición: lo que el encargado fue juntando desde "Reponer" para armar el
// pedido. Vive en este navegador (el borrador de pedido automático es de la fase 3) y sale
// copiada para pegar en un mail o un WhatsApp al proveedor, o como CSV.

import { ClipboardList, Copy, Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useListaReposicion, type ItemReposicion } from "@/hooks/use-panol-bandeja";

function comoTexto(items: ItemReposicion[]): string {
  return ["Pedido de reposición del pañol", ...items.map((i) => `• ${i.texto}`)].join("\n");
}

function comoCsv(items: ItemReposicion[]): string {
  const celda = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ["Artículo;Cantidad", ...items.map((i) => [celda(i.texto), celda(i.cantidad)].join(";"))].join("\r\n");
}

export function ListaReposicion() {
  const lista = useListaReposicion();
  const { items } = lista;

  function copiar() {
    navigator.clipboard.writeText(comoTexto(items))
      .then(() => toast.success("Lista copiada: pegala en el mail o el WhatsApp al proveedor."))
      .catch(() => toast.error("No se pudo copiar. Probá con «Descargar»."));
  }

  function descargar() {
    // BOM para que Excel lea bien las tildes.
    const blob = new Blob(["﻿" + comoCsv(items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reposicion-panol-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function vaciar() {
    const antes = items;
    lista.vaciar();
    toast.success("Lista vaciada.", { duration: 10_000, action: { label: "Deshacer", onClick: () => lista.reponer(antes) } });
  }

  return (
    <Sheet>
      <SheetTrigger render={<Button size="sm" variant="ghost" className="max-sm:h-10" />}>
        <ClipboardList aria-hidden /> Lista de reposición{items.length ? ` (${items.length})` : ""}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Lista de reposición</SheetTitle>
          <SheetDescription>Lo que fuiste agregando desde «Reponer». Se guarda en esta computadora.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">Todavía no agregaste nada.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {items.map((i) => (
                <li key={i.clave} className="flex items-start justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0">{i.texto}</span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Quitar ${i.texto}`} onClick={() => lista.quitar(i.clave)}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <SheetFooter className="flex-row flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copiar}><Copy aria-hidden /> Copiar</Button>
            <Button variant="outline" size="sm" onClick={descargar}><Download aria-hidden /> Descargar CSV</Button>
            <Button variant="ghost" size="sm" onClick={vaciar}>Vaciar</Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
