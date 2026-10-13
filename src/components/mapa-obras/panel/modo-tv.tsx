"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { CiudadArmadaMapaApi } from "@/lib/mapa-obras/tipos";
import { fmtEntero, TIPO_TEXTO, type ItemTv, type KpisCalle } from "@/lib/mapa-obras/categorias";
import { vidrio } from "./estilos";

// Modo TV: para la tele de la oficina. Pantalla completa, sin paneles, recorre "Para
// decidir" más las más viejas con un titular grande (11 s por obra) y cierra con la vista
// general y el resumen; después vuelve a empezar. Se sale con Esc, tocando el mapa o con
// el botón. Pide que la pantalla no se apague, si el navegador lo permite.

const POR_OBRA_MS = 11_000;
const RESUMEN_MS = 9_000;

export function useModoTv({
  contenedor,
  api,
  items,
  reducirMovimiento,
  alEmpezar,
  alSeleccionar,
}: {
  contenedor: RefObject<HTMLElement | null>;
  api: RefObject<CiudadArmadaMapaApi | null>;
  items: ItemTv[];
  reducirMovimiento: boolean;
  /** Cierra la ficha, vuelve a "En la calle", limpia la búsqueda. */
  alEmpezar: () => void;
  alSeleccionar: (ventaId: number | null) => void;
}) {
  // null = apagado. 0..items.length-1 = una obra; items.length = el resumen.
  const [paso, setPaso] = useState<number | null>(null);
  const entroPantallaCompleta = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Los ítems se leen por ref: si react-query refresca a mitad del recorrido, no se reinicia.
  const itemsRef = useRef(items);
  const alSeleccionarRef = useRef(alSeleccionar);
  useEffect(() => {
    itemsRef.current = items;
    alSeleccionarRef.current = alSeleccionar;
  });

  const pedirWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen");
    } catch {
      // Sin permiso o sin soporte: la TV se queda sin la garantía, nada más.
    }
  }, []);

  const salir = useCallback(() => {
    setPaso(null);
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    if (entroPantallaCompleta.current && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    entroPantallaCompleta.current = false;
    alSeleccionarRef.current(null);
  }, []);

  const empezar = useCallback(() => {
    alEmpezar();
    setPaso(0);
    const el = contenedor.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => {
          entroPantallaCompleta.current = true;
        })
        .catch(() => {});
    }
    void pedirWakeLock();
  }, [alEmpezar, contenedor, pedirWakeLock]);

  const activo = paso !== null;

  // El recorrido.
  useEffect(() => {
    if (paso === null) return;
    const lista = itemsRef.current;
    let t: ReturnType<typeof setTimeout>;
    if (paso < lista.length) {
      const it = lista[paso];
      alSeleccionarRef.current(it.obra.ventaId);
      api.current?.volarA(it.obra.ventaId, reducirMovimiento ? 0 : 5000);
      t = setTimeout(() => setPaso(paso + 1), POR_OBRA_MS);
    } else {
      alSeleccionarRef.current(null);
      api.current?.irAGeneral(reducirMovimiento ? 0 : 4000);
      t = setTimeout(() => setPaso(0), RESUMEN_MS);
    }
    return () => clearTimeout(t);
  }, [paso, api, reducirMovimiento]);

  // Si se sale de pantalla completa (Esc del navegador), se sale del modo TV.
  useEffect(() => {
    if (!activo) return;
    const onCambio = () => {
      if (!document.fullscreenElement && entroPantallaCompleta.current) salir();
    };
    // El wake lock se suelta solo al cambiar de pestaña: se vuelve a pedir al volver.
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!wakeLock.current || wakeLock.current.released)) void pedirWakeLock();
    };
    document.addEventListener("fullscreenchange", onCambio);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("fullscreenchange", onCambio);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activo, salir, pedirWakeLock]);

  // Si la página se desmonta en pleno recorrido, soltar el wake lock.
  useEffect(() => () => void wakeLock.current?.release().catch(() => {}), []);

  return { activo, paso, empezar, salir };
}

export function TarjetaTv({
  paso,
  items,
  resumen,
  className,
}: {
  paso: number;
  items: ItemTv[];
  resumen: KpisCalle | null;
  className?: string;
}) {
  const it = items[paso];
  return (
    <div
      className={cn(vidrio, "max-w-[min(700px,calc(100%-56px))] px-[22px] py-[18px]", className)}
      role="status"
      aria-live="polite"
    >
      {it ? (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-primary">
            {paso + 1} de {items.length} · {it.obra.estado === "pendiente_desarme" ? "pendiente de desarme" : "para revisar"}
          </div>
          <h2 className="mb-0.5 mt-1 text-[clamp(28px,4vw,48px)] font-bold leading-none tracking-tight">
            {it.obra.direccionCorta}
          </h2>
          <p className="text-[clamp(15px,1.6vw,20px)] text-muted-foreground">
            {it.motivo}
            {it.obra.tipo ? ` · ${TIPO_TEXTO[it.obra.tipo]}` : ""}
          </p>
        </>
      ) : (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-primary">Hoy en la calle</div>
          <h2 className="mb-0.5 mt-1 text-[clamp(28px,4vw,48px)] font-bold leading-none tracking-tight">
            {resumen ? `${resumen.armadas} obras armadas · ${resumen.pendientes} pendientes de desarme` : "Ciudad Armada"}
          </h2>
          {resumen && (
            <p className="text-[clamp(15px,1.6vw,20px)] text-muted-foreground">
              ~{fmtEntero(resumen.metrosLineales)} metros lineales de estructura en Buenos Aires
            </p>
          )}
        </>
      )}
    </div>
  );
}
