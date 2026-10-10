"use client";

// El día que se mira en la Hoja del día: `?dia=YYYY-MM-DD` en la URL (lo comparten
// Cuadrillas y Camiones). Sin `?dia=`, el que corresponde a la hora (dias.ts) o el último
// elegido HOY en esta computadora ("recuerda la última elegida durante el día", §1).

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
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

// "Hoy" cambia a la medianoche: se lee una vez por minuto sin re-render si no cambió.
const suscribirMinuto = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};

export function useDiaHoja() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hoy = useSyncExternalStore(suscribirMinuto, () => hoyBA(), () => hoyBA());
  const enUrl = params.get("dia");
  const porDefecto = useSyncExternalStore(suscribirMinuto, () => leerUltimo() ?? diaPorDefecto(), () => diaPorDefecto());
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
    }),
    [fecha, hoy, irA, hrefCon],
  );
}
