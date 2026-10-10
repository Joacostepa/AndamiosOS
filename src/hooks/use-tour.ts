"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
// El CSS base de la librería (overlay, recorte, posicionamiento). La apariencia del
// popover se sobreescribe en globals.css para que siga el tema de la app.
import "driver.js/dist/driver.css";
import type { PasoTour } from "@/lib/habilitaciones/tour";

/**
 * Recorrido guiado sobre elementos marcados con `data-tour`.
 *
 * POR QUÉ `data-tour` Y NO CLASES: las clases de Tailwind cambian con cualquier retoque
 * visual y romperían el tour en silencio. Un atributo dedicado es un contrato explícito —
 * quien edite el componente ve que hay algo colgado de ese nodo.
 *
 * LOS PASOS SIN ANCLA SE DESCARTAN ANTES DE ARRANCAR. La bandeja puede no tener el aviso
 * de desincronizadas, o no tener ningún grupo todavía; la ficha puede ser de una obra sin
 * requisitos. Sin este filtro driver.js muestra un globo flotante sin contexto, que es
 * peor que no mostrar el paso. Un paso con `anclaAlternativa` no se descarta: se cuelga de
 * esa — así los del triage se ven aunque ese día no haya obras nuevas.
 *
 * ARRANCA UNA SOLA VEZ: si alguien lo cierra en el primer paso, no le vuelve a saltar en
 * cada recarga. Para volver a verlo está el botón "¿Cómo funciona?", que llama a
 * `reiniciar()`.
 */
export function useTour(
  clave: string,
  pasos: PasoTour[],
  { listo }: { listo: boolean },
) {
  const instancia = useRef<Driver | null>(null);

  /** Abre el recorrido. Devuelve false si no había ningún paso con ancla en pantalla. */
  const abrir = useCallback((): boolean => {
    const disponibles = pasos.flatMap((p) => {
      const ancla = [p.ancla, p.anclaAlternativa].find(
        (a) => a && document.querySelector(`[data-tour="${a}"]`),
      );
      return ancla ? [{ ...p, ancla }] : [];
    });
    if (disponibles.length === 0) return false;

    instancia.current?.destroy();
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: "tour-aba",
      nextBtnText: "Siguiente",
      prevBtnText: "Atrás",
      doneBtnText: "Listo",
      progressText: "{{current}} de {{total}}",
      steps: disponibles.map((p) => ({
        element: `[data-tour="${p.ancla}"]`,
        popover: { title: p.titulo, description: p.texto, side: p.lado ?? "bottom", align: "start" },
      })),
      onDestroyed: () => {
        instancia.current = null;
      },
    });
    instancia.current = d;
    d.drive();
    return true;
  }, [pasos]);

  // Arranque automático la primera vez, recién cuando la data está en pantalla: si se
  // dispara antes, las anclas todavía no existen y el tour saldría vacío.
  //
  // LA MARCA SE GUARDA CUANDO EL RECORRIDO SE ABRE DE VERDAD, adentro del timeout, y no
  // antes de programarlo. Antes se marcaba primero: en desarrollo React monta el efecto
  // dos veces, la limpieza cancelaba el timeout de la primera pasada y la segunda ya veía
  // "visto" — el de la ficha no arrancaba nunca. Y cualquier re-render que cambiara
  // `listo` o `abrir` hacía lo mismo en producción. Si lo cierran en el primer paso sigue
  // contando como visto: la intención fue "no ahora".
  useEffect(() => {
    if (!listo || typeof window === "undefined") return;
    if (window.localStorage.getItem(clave) === "visto") return;

    // Un frame de aire para que el layout se asiente y driver.js mida bien el recorte.
    const t = window.setTimeout(() => {
      if (window.localStorage.getItem(clave) === "visto") return;
      if (abrir()) window.localStorage.setItem(clave, "visto");
    }, 350);
    return () => window.clearTimeout(t);
  }, [clave, listo, abrir]);

  useEffect(() => () => instancia.current?.destroy(), []);

  const reiniciar = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(clave, "visto");
    abrir();
  }, [clave, abrir]);

  return { reiniciar };
}

/** Deja los tours del módulo como si nunca se hubieran visto. Para probar y para capacitar. */
export function reiniciarTours(claves: string[]) {
  if (typeof window === "undefined") return;
  for (const c of claves) window.localStorage.removeItem(c);
}
