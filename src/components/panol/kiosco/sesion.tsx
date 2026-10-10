"use client";

// Quién está parado frente al kiosco.
//
// El dispositivo queda logueado con el usuario del kiosco (sólo registra movimientos);
// cada operación empieza con "¿Quién sos?" y termina volviendo ahí: después de confirmar,
// al tocar "No soy yo", o tras N segundos sin tocar nada (parámetro
// kiosco_inactividad_seg). La identidad es un token corto que firma los vales de esa
// persona (pan_identificar); no se guarda en ningún lado que sobreviva a recargar la
// página, a propósito: un kiosco que se reinicia vuelve a preguntar.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { idDispositivo, identificar as identificarRpc, useParametrosPanol } from "@/hooks/use-panol";
import { leerRechazo, type Rechazo } from "@/lib/panol/estado";
import type { Identidad } from "@/lib/panol/tipos";

type ContextoKiosco = {
  identidad: Identidad | null;
  dispositivo: string;
  /** Por credencial (código leído del QR) o por PIN. Devuelve el rechazo si no se pudo. */
  identificar: (por: { codigo?: string; pin?: string }) => Promise<Rechazo | null>;
  /** Volver a "¿Quién sos?". */
  salir: () => void;
  /** Cualquier toque: reinicia la cuenta de inactividad. */
  tocar: () => void;
  /**
   * Mientras esté en true no se vuelve a "¿Quién sos?" por inactividad. Para las tareas
   * largas de un encargado (contar una estantería): entre ítem e ítem puede pasar un minuto
   * sin tocar la pantalla. Quien lo prende lo apaga al terminar (o al desmontarse).
   */
  mantener: (activo: boolean) => void;
};

const Ctx = createContext<ContextoKiosco | null>(null);

export function KioscoProvider({ children }: { children: ReactNode }) {
  const [identidad, setIdentidad] = useState<Identidad | null>(null);
  const [dispositivo] = useState(() => (typeof window === "undefined" ? "servidor" : idDispositivo()));
  const { data: parametros } = useParametrosPanol();
  const inactividadMs = (parametros?.kiosco_inactividad_seg ?? 60) * 1000;
  const ultimoToque = useRef(0);
  const mantenida = useRef(false);

  const salir = useCallback(() => {
    mantenida.current = false;
    setIdentidad(null);
  }, []);
  const tocar = useCallback(() => {
    ultimoToque.current = Date.now();
  }, []);
  const mantener = useCallback((activo: boolean) => {
    mantenida.current = activo;
    ultimoToque.current = Date.now();
  }, []);

  const identificar = useCallback(
    async (por: { codigo?: string; pin?: string }) => {
      try {
        const r = await identificarRpc({ ...por, dispositivo });
        if ("error" in r) return leerRechazo(r.error);
        ultimoToque.current = Date.now();
        setIdentidad(r);
        return null;
      } catch (e) {
        return leerRechazo(e instanceof Error ? e.message : String(e));
      }
    },
    [dispositivo],
  );

  // Inactividad: cualquier toque o tecla cuenta; pasado el plazo, vuelve a "¿Quién sos?".
  useEffect(() => {
    if (!identidad) return;
    ultimoToque.current = Date.now();
    const marcar = () => {
      ultimoToque.current = Date.now();
    };
    window.addEventListener("pointerdown", marcar);
    window.addEventListener("keydown", marcar);
    // Un escaneo también es actividad: quien escanea una cuadrilla entera casi no toca la pantalla.
    window.addEventListener("panol:escaneo", marcar);
    const reloj = window.setInterval(() => {
      if (!mantenida.current && Date.now() - ultimoToque.current > inactividadMs) setIdentidad(null);
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
      window.removeEventListener("panol:escaneo", marcar);
      window.clearInterval(reloj);
    };
  }, [identidad, inactividadMs]);

  const valor = useMemo(
    () => ({ identidad, dispositivo, identificar, salir, tocar, mantener }),
    [identidad, dispositivo, identificar, salir, tocar, mantener],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useKiosco(): ContextoKiosco {
  const c = useContext(Ctx);
  if (!c) throw new Error("useKiosco fuera de <KioscoProvider>");
  return c;
}

/** Mientras la pantalla que lo usa esté montada, la sesión no se corta por inactividad. */
export function useMantenerSesion() {
  const { mantener } = useKiosco();
  useEffect(() => {
    mantener(true);
    return () => mantener(false);
  }, [mantener]);
}
