"use client";

// La captura en grande, para Mis reportes y la bandeja. Un clic en la imagen alterna entre
// «entera en la pantalla» y «tamaño real» (con scroll): en una captura de 1920 px el texto
// de una celda no se lee achicado, y es justo lo que Sistemas necesita leer.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CapturaFirmada } from "@/lib/sistemas/tipos";

export function VisorImagenes({
  imagenes,
  indice,
  titulo,
  onCerrar,
}: {
  imagenes: CapturaFirmada[];
  /** null = cerrado. */
  indice: number | null;
  titulo: string;
  onCerrar: () => void;
}) {
  const [actual, setActual] = useState(indice ?? 0);
  const [real, setReal] = useState(false);
  const abierto = indice !== null && imagenes.length > 0;

  // Cada vez que se abre, en la imagen que se tocó y entera.
  useEffect(() => {
    if (indice !== null) {
      setActual(indice);
      setReal(false);
    }
  }, [indice]);

  const n = imagenes.length;
  const ir = (d: number) => {
    setActual((a) => (a + d + n) % n);
    setReal(false);
  };

  useEffect(() => {
    if (!abierto || n < 2) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ir sólo depende de n
  }, [abierto, n]);

  const img = imagenes[Math.min(actual, n - 1)];

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent
        data-capture="exclude"
        className="flex h-[calc(100dvh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-2 p-2 sm:max-w-[min(96vw,1600px)] sm:p-3"
      >
        <div className="flex items-center gap-2 pr-9">
          <DialogTitle className="min-w-0 flex-1 truncate text-[14px]">
            {titulo}
            {n > 1 && <span className="ml-2 font-normal text-muted-foreground tabular-nums">{Math.min(actual, n - 1) + 1} de {n}</span>}
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={() => setReal((r) => !r)}>
            {real ? <ZoomOut /> : <ZoomIn />}
            <span className="hidden sm:inline">{real ? "Entera" : "Tamaño real"}</span>
          </Button>
          {img && (
            <Button variant="ghost" size="sm" render={<a href={img.url} target="_blank" rel="noreferrer" />} nativeButton={false}>
              <ExternalLink />
              <span className="hidden sm:inline">Abrir</span>
            </Button>
          )}
        </div>
        <div className={cn("relative min-h-0 flex-1 rounded-md bg-muted", real ? "overflow-auto" : "overflow-hidden")}>
          {img && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, vence en minutos
            <img
              src={img.url}
              alt={titulo}
              onClick={() => setReal((r) => !r)}
              className={cn(
                "mx-auto block",
                real ? "max-w-none cursor-zoom-out" : "h-full w-full cursor-zoom-in object-contain",
              )}
            />
          )}
          {n > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-1/2 left-2 size-10 -translate-y-1/2 rounded-full shadow"
                onClick={() => ir(-1)}
                aria-label="Anterior"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-1/2 right-2 size-10 -translate-y-1/2 rounded-full shadow"
                onClick={() => ir(1)}
                aria-label="Siguiente"
              >
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
