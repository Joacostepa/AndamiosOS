"use client";

// El día que se mira en la Hoja del día: `?dia=YYYY-MM-DD` en la URL (lo comparten
// Cuadrillas y Camiones). Sin `?dia=`, el que corresponde a la hora (dias.ts) o el último
// elegido HOY en esta computadora ("recuerda la última elegida durante el día", §1).

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { diaHabil, diaPorDefecto, esFecha, hoyBA, mananaDe } from "@/lib/hoja-dia/dias";
import type { Fecha } from "@/lib/hoja-dia/tipos";

const CLAVE = "hoja-dia:ultimo";

function leerUltimo(): string | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const x = JSON.parse(raw) as { hoy?: string; dia?: string };
    return x.hoy === hoyBA() && esFecha(x.dia) ? x.dia : null;
  } catch {
    return null;
  }
}
function guardarUltimo(dia: Fecha) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ hoy: hoyBA(), dia }));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

// La hora de corte ("abre en Mañana desde las 15"): el parámetro hora_corte_manana, que el
// layout (servidor) lee de la base y pasa acá. Así la pantalla abre el mismo día en que el
// servidor guarda un pedido nuevo sin fecha (fechaPorDefecto). Sin el parámetro, 15:00.
const CorteCtx = createContext<number>(15 * 60);
export function ProveedorCorteHoja({ corteMin, children }: { corteMin: number; children: ReactNode }) {
  return createElement(CorteCtx.Provider, { value: corteMin }, children);
}

// Montado: el día por defecto depende del reloj, y el del servidor (al prerenderizar) no es
// el del navegador (al hidratar). Lo que depende de la hora se muestra sólo ya montado.
const nada = () => () => {};
export const useMontado = () => useSyncExternalStore(nada, () => true, () => false);

// "Hoy" cambia a la medianoche: se lee una vez por minuto sin re-render si no cambió.
const suscribirMinuto = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};

export function useDiaHoja() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const corte = useContext(CorteCtx);
  const montado = useMontado();
  const hoy = useSyncExternalStore(suscribirMinuto, () => hoyBA(), () => hoyBA());
  const enUrl = params.get("dia");
  const porDefecto = useSyncExternalStore(suscribirMinuto, () => leerUltimo() ?? diaPorDefecto(Date.now(), corte), () => diaPorDefecto(Date.now(), corte));
  const fecha: Fecha = esFecha(enUrl) ? enUrl : porDefecto;

  useEffect(() => {
    if (esFecha(enUrl)) guardarUltimo(enUrl);
  }, [enUrl]);

  /** El href de una vista de la hoja con el día de ahora. */
  const hrefCon = useCallback((ruta: string, dia: Fecha = fecha) => `${ruta}?dia=${dia}`, [fecha]);

  const irA = useCallback(
    (dia: Fecha) => {
      guardarUltimo(dia);
      const qs = new URLSearchParams(params.toString());
      qs.set("dia", dia);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return useMemo(
    () => ({
      fecha,
      hoy,
      manana: mananaDe(hoy),
      anterior: diaHabil(fecha, -1),
      siguiente: diaHabil(fecha, 1),
      irA,
      hrefCon,
      /** false en el servidor y al hidratar: lo que depende del reloj se dibuja después. */
      montado,
    }),
    [fecha, hoy, irA, hrefCon, montado],
  );
}
