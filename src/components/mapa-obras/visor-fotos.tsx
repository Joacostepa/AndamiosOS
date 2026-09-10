"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FotoObra } from "@/lib/odoo/mapa-obras";

// Visor de las fotos de una obra.
//
// POR QUÉ EXISTE: el riel de la ficha entra en 96px de alto y una obra puede tener trece
// fotos. Ahí se ve que HAY fotos, no qué muestran. Este visor es donde se miran.
//
// Navega con flechas, con teclado y tocando una miniatura. La pantalla completa va sobre el
// contenedor de la imagen y no sobre el diálogo entero: lo que interesa agrandar es la foto,
// no el marco.

export function VisorFotos({
  fotos,
  indiceInicial,
  titulo,
  onCerrar,
}: {
  fotos: FotoObra[];
  indiceInicial: number;
  /** La obra, para que al agrandar no se pierda de qué lugar es la foto. */
  titulo: string;
  onCerrar: () => void;
}) {
  const [i, setI] = useState(indiceInicial);
  const [enPantallaCompleta, setEnPantallaCompleta] = useState(false);
  const marco = useRef<HTMLDivElement>(null);

  // Circular a propósito: con trece fotos, toparse con un botón muerto en la última es más
  // molesto que dar la vuelta.
  const ir = useCallback(
    (delta: number) => setI((prev) => (prev + delta + fotos.length) % fotos.length),
    [fotos.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ir]);

  // El estado de pantalla completa lo manda el navegador, no este componente: se puede
  // salir con Esc o con el gesto del sistema sin pasar por nuestro botón.
  useEffect(() => {
    const onCambio = () => setEnPantallaCompleta(document.fullscreenElement === marco.current);
    document.addEventListener("fullscreenchange", onCambio);
    return () => document.removeEventListener("fullscreenchange", onCambio);
  }, []);

  async function alternarPantallaCompleta() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await marco.current?.requestFullscreen().catch(() => {});
  }

  const foto = fotos[i];
  if (!foto) return null;
  const pie = [foto.descripcion, foto.fecha].filter(Boolean).join(" · ");

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-w-[min(96vw,72rem)] gap-2 p-3 sm:max-w-[min(96vw,72rem)]">
        <DialogTitle className="pr-8 text-sm font-medium">
          {titulo}
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {i + 1} / {fotos.length}
          </span>
        </DialogTitle>

        <div ref={marco} className="relative flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={foto.id}
            src={foto.url}
            alt={foto.descripcion ?? titulo}
            className={cn(
              "mx-auto object-contain",
              enPantallaCompleta ? "max-h-screen" : "max-h-[70vh]",
            )}
          />

          {fotos.length > 1 && (
            <>
              <BotonPaso lado="izq" onClick={() => ir(-1)} />
              <BotonPaso lado="der" onClick={() => ir(1)} />
            </>
          )}

          <button
            type="button"
            onClick={alternarPantallaCompleta}
            className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            aria-label={enPantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            title={enPantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {enPantallaCompleta ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          {/* El pie va DENTRO del marco para que sobreviva a la pantalla completa: agrandada,
              una foto sin fecha ni sector no dice de cuándo es. */}
          {pie && (
            <p className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1.5 text-[11px] text-white">
              {pie}
            </p>
          )}
        </div>

        {fotos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {fotos.map((f, idx) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setI(idx)}
                className={cn(
                  "shrink-0 overflow-hidden rounded border transition-opacity",
                  idx === i ? "ring-2 ring-foreground" : "opacity-60 hover:opacity-100",
                )}
                aria-label={`Foto ${idx + 1}`}
                aria-current={idx === i}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt=""
                  loading="lazy"
                  className="h-14 w-20 bg-muted object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BotonPaso({ lado, onClick }: { lado: "izq" | "der"; onClick: () => void }) {
  const Icono = lado === "izq" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70",
        lado === "izq" ? "left-2" : "right-2",
      )}
      aria-label={lado === "izq" ? "Foto anterior" : "Foto siguiente"}
    >
      <Icono className="h-5 w-5" />
    </button>
  );
}
