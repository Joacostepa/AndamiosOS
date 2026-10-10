"use client";

import { createContext, useContext, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelPlanificacionHoja } from "@/components/habilitaciones/panel-planificacion";

// El panel de planificación de Habilitaciones: si está abierto.
//
// VIVE EN EL LAYOUT DEL MÓDULO y no en cada página: así se abre desde la bandeja o desde
// la ficha de una obra, y al pasar de una a otra no vuelve a cargar.
//
// SE ABRE ENCIMA, EN TODAS LAS PANTALLAS (rediseño del 09/10). Antes en pantalla ancha era
// una columna fija de 380 px que se recordaba abierta: ocupaba un tercio de la bandeja para
// contestar otra pregunta. Agustina la usa para ver cómo viene la agenda, no todo el día
// (JS, 09/10), y "qué se arma pronto sin estar lista" ahora lo dice la columna "Se arma" de
// cada fila. Como hoja encima no se recuerda abierta: taparía la bandeja cada vez que se
// entra.

type Contexto = { abierto: boolean; alternar: () => void };

const ContextoPlanificacion = createContext<Contexto | null>(null);

export function PlanificacionHabilitaciones({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <ContextoPlanificacion.Provider value={{ abierto, alternar: () => setAbierto((v) => !v) }}>
      {children}
      <PanelPlanificacionHoja abierto={abierto} onOpenChange={setAbierto} />
    </ContextoPlanificacion.Provider>
  );
}

/** El botón que abre el panel. */
export function BotonPlanificacion() {
  const ctx = useContext(ContextoPlanificacion);
  if (!ctx) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      aria-pressed={ctx.abierto}
      onClick={ctx.alternar}
      data-tour="boton-planificacion"
    >
      <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
      Próximas 2 semanas
    </Button>
  );
}
