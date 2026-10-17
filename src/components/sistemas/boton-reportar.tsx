"use client";

// El botón «Reportar» del header, a la izquierda del tema y la campanita (contrato §7.2).
//
// En el celular queda sólo el megáfono, en 44 px para el dedo. `data-capture="exclude"`: la
// foto es de la pantalla, no del botón que la sacó. `data-tour`: el paso 1 del recorrido lo
// resalta.
//
// Tocarlo no abre nada directamente: pide un reporte por el canal de eventos, y el panel
// saca la foto PRIMERO y se abre DESPUÉS. Mientras corre la foto, el ícono gira.

import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DATA_TOUR, EXCLUIR_CAPTURA, TEXTOS } from "@/lib/sistemas/tipos";
import { pedirReporte, useCapturando } from "@/components/sistemas/disparar";

export function BotonReportar() {
  const capturando = useCapturando();
  return (
    <Button
      variant="ghost"
      onClick={() => pedirReporte()}
      title={TEXTOS.boton.titulo}
      aria-busy={capturando || undefined}
      data-tour={DATA_TOUR.reportar}
      {...{ [EXCLUIR_CAPTURA.atributo]: EXCLUIR_CAPTURA.valor }}
      className="size-11 gap-1.5 px-0 sm:h-8 sm:w-auto sm:px-2.5"
    >
      {capturando ? <Loader2 className="animate-spin text-primary" /> : <Megaphone className="text-primary" />}
      <span className="sr-only sm:not-sr-only">{TEXTOS.boton.reportar}</span>
    </Button>
  );
}
