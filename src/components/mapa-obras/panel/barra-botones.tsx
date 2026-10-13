"use client";

import { Box, House, List, Map as MapIcon, Moon, Sun, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { botonVidrio } from "./estilos";

// Arriba a la derecha: Lista (sólo celular), Día/Noche, 2D/3D, General y Modo TV.
// El texto del botón dice a qué se pasa, como en la maqueta ("Día" estando de noche).

export function BarraBotones({
  tema,
  plano,
  tv,
  listaAbierta,
  onTema,
  onPlano,
  onGeneral,
  onTv,
  onLista,
  className,
}: {
  tema: "noche" | "dia";
  plano: boolean;
  tv: boolean;
  listaAbierta: boolean;
  onTema: () => void;
  onPlano: () => void;
  onGeneral: () => void;
  onTv: () => void;
  onLista: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-1.5", className)}>
      {!tv && (
        <>
          <button
            type="button"
            className={cn(botonVidrio, "md:hidden")}
            aria-pressed={listaAbierta}
            aria-label={listaAbierta ? "Cerrar la lista" : "Abrir la lista"}
            onClick={onLista}
          >
            <List className="size-3.5" aria-hidden />
            Lista
          </button>
          <button
            type="button"
            className={botonVidrio}
            onClick={onTema}
            aria-label={tema === "noche" ? "Pasar el mapa a día" : "Pasar el mapa a noche"}
          >
            {tema === "noche" ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
            {tema === "noche" ? "Día" : "Noche"}
          </button>
          <button
            type="button"
            className={botonVidrio}
            onClick={onPlano}
            aria-pressed={plano}
            aria-label={plano ? "Ver el mapa en 3D" : "Ver el mapa desde arriba (2D)"}
          >
            {plano ? <Box className="size-3.5" aria-hidden /> : <MapIcon className="size-3.5" aria-hidden />}
            {plano ? "3D" : "2D"}
          </button>
          <button type="button" className={botonVidrio} onClick={onGeneral} aria-label="Vista general de la ciudad">
            <House className="size-3.5" aria-hidden />
            General
          </button>
        </>
      )}
      <button
        type="button"
        className={botonVidrio}
        onClick={onTv}
        aria-pressed={tv}
        aria-label={tv ? "Salir del modo TV" : "Modo TV: pantalla completa y recorrido automático"}
      >
        <Tv className="size-3.5" aria-hidden />
        {tv ? "Salir de TV" : "Modo TV"}
      </button>
    </div>
  );
}
