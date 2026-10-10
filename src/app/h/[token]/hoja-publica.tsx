"use client";

import { useEffect } from "react";
import { MensajeCelular, SinDescargar, VistaCelular } from "@/components/hoja-dia/celular";
import { useHojaPublica } from "@/components/hoja-dia/celular/use-hoja-publica";

/** El service worker de /h/ (ver /h/sw.js): que la página se abra sin señal la próxima vez. */
function useCopiaSinSenal() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let vivo = true;
    navigator.serviceWorker
      .register("/h/sw.js", { scope: "/h/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!vivo) return;
        // Lo que se bajó antes de que el service worker controlara la página (la primera vez).
        const urls = [location.href, ...performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.startsWith(`${location.origin}/_next/static/`))];
        reg.active?.postMessage({ tipo: "guardar", urls });
      })
      .catch(() => { /* sin service worker: igual queda la copia de la hoja en el teléfono */ });
    return () => { vivo = false; };
  }, []);
}

export function HojaPublica({ token }: { token: string }) {
  const h = useHojaPublica(token);
  useCopiaSinSenal();
  if (h.vista) {
    return (
      <VistaCelular
        vista={h.vista}
        acciones={h.acciones}
        pendientes={h.pendientes}
        conexion={h.conexion}
        coordinadorConocido={h.coordinadorConocido}
      />
    );
  }
  if (h.sinDescargar) return <SinDescargar coordinador={h.coordinadorConocido} />;
  if (h.error) return <MensajeCelular titulo="No se pudo cargar la hoja." texto="Probá de nuevo en un rato." onReintentar={h.acciones.reintentar} />;
  return <MensajeCelular titulo="Cargando tu hoja…" />;
}
