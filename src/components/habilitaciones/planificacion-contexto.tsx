"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PanelPlanificacionHoja, PanelPlanificacionLateral,
} from "@/components/habilitaciones/panel-planificacion";

// El panel de planificación de Habilitaciones: si está abierto, y dónde se dibuja.
//
// VIVE EN EL LAYOUT DEL MÓDULO y no en cada página: así se abre desde la bandeja o desde
// la ficha de una obra, y al pasar de una a otra no se cierra ni vuelve a cargar.
//
// SE RECUERDA ENTRE SESIONES en pantalla ancha, en localStorage, igual que el panel
// colapsado del tablero: hay quien lo usa todo el día y lo quiere encontrar como lo dejó.
// En pantalla angosta NO se recuerda: ahí el panel se abre encima de la página, y
// recordarlo haría que tape todo cada vez que se entra a una ficha desde el celular.
//
// useSyncExternalStore y no un useState leído de localStorage: el servidor dibuja siempre
// "cerrado" y el browser corrige después de hidratar, sin el aviso de markup distinto.

const CLAVE = "habilitaciones:planificacion-abierta";
const EVENTO = "habilitaciones:planificacion-cambio";
/** Desde acá entran la bandeja y una columna de 380px sin apretar las filas. */
const ANCHO = "(min-width: 1280px)";

// Si localStorage no está (modo privado, bloqueado), el panel funciona igual: sólo no
// recuerda entre visitas.
let enMemoria = false;

function leerAbierto(): boolean {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return v === null ? enMemoria : v === "true";
  } catch {
    return enMemoria;
  }
}

function guardarAbierto(valor: boolean) {
  enMemoria = valor;
  try {
    window.localStorage.setItem(CLAVE, String(valor));
  } catch {
    // Sin storage: queda en memoria.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribirAbierto(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  // Otra pestaña abrió o cerró el panel.
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

function suscribirAncho(avisar: () => void) {
  const mq = window.matchMedia(ANCHO);
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

type Contexto = { abierto: boolean; alternar: () => void };

const ContextoPlanificacion = createContext<Contexto | null>(null);

export function PlanificacionHabilitaciones({ children }: { children: React.ReactNode }) {
  const guardado = useSyncExternalStore(suscribirAbierto, leerAbierto, () => false);
  const ancho = useSyncExternalStore(
    suscribirAncho,
    () => window.matchMedia(ANCHO).matches,
    () => true,
  );
  const [abiertoHoja, setAbiertoHoja] = useState(false);

  const abierto = ancho ? guardado : abiertoHoja;
  function alternar() {
    if (ancho) guardarAbierto(!guardado);
    else setAbiertoHoja((v) => !v);
  }

  return (
    <ContextoPlanificacion.Provider value={{ abierto, alternar }}>
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {ancho && guardado && <PanelPlanificacionLateral onCerrar={() => guardarAbierto(false)} />}
      </div>
      {!ancho && <PanelPlanificacionHoja abierto={abiertoHoja} onOpenChange={setAbiertoHoja} />}
    </ContextoPlanificacion.Provider>
  );
}

/** El botón que abre y cierra el panel. Resaltado mientras está abierto. */
export function BotonPlanificacion() {
  const ctx = useContext(ContextoPlanificacion);
  if (!ctx) return null;
  return (
    <Button
      size="sm"
      variant={ctx.abierto ? "secondary" : "outline"}
      aria-pressed={ctx.abierto}
      onClick={ctx.alternar}
    >
      <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
      Planificación
    </Button>
  );
}
