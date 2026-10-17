"use client";

// El mini-mapa del Pizarrón: las obras del día (un punto del color de su cuadrilla, con el
// número) y el depósito. MapLibre como el Mapa de obras (mapa-obras.tsx): CSS estático arriba,
// la librería con import dinámico, tiles de OpenFreeMap con el par claro/oscuro del tema.
// Tocar un punto pide atención a esa columna. Los pedidos a otra dirección (F4) van con una
// "P"; con `colocar`, tocar el mapa ubica un pedido que Google no encontró.

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { registrarLienzo } from "@/lib/sistemas/lienzos-webgl";

const ESTILOS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const cargar = () => import("maplibre-gl");

export type PuntoMapa = {
  k: string; lat: number; lng: number; rotulo: string; color: string; titulo: string; c: number | null; deposito?: boolean;
  /** Un pedido a otra dirección (su id, o "nuevo" el que se está cargando). */
  pedido?: string; hecho?: boolean;
};

export function MiniMapa({ puntos, onTocar, colocar }: {
  puntos: PuntoMapa[];
  onTocar: (c: number) => void;
  /** Tocar el mapa ubica un pedido (el cursor cambia mientras tanto). */
  colocar?: { onColocar: (ll: { lat: number; lng: number }) => void } | null;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcas = useRef<Marker[]>([]);
  const lib = useRef<Awaited<ReturnType<typeof cargar>> | null>(null);
  const { resolvedTheme } = useTheme();
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState(false);
  const tocar = useRef(onTocar);
  const ubicar = useRef(colocar);
  useEffect(() => {
    tocar.current = onTocar;
    ubicar.current = colocar;
  }, [onTocar, colocar]);

  useEffect(() => {
    let vivo = true;
    let quitarFoto: (() => void) | undefined;
    (async () => {
      const m = await cargar();
      if (!vivo || !contenedor.current || mapa.current) return;
      lib.current = m;
      const map = new m.default.Map({
        container: contenedor.current,
        style: resolvedTheme === "dark" ? ESTILOS.dark : ESTILOS.light,
        center: [-58.44, -34.61],
        zoom: 10.3,
        attributionControl: { compact: true },
      });
      map.on("error", () => vivo && setFalla(true));
      map.on("click", (e) => ubicar.current?.onColocar({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      map.on("load", () => {
        if (!vivo) return;
        map.resize();
        setListo(true);
      });
      mapa.current = map;
      // «Reportar» (Sistemas): la foto del lienzo WebGL (src/lib/sistemas/lienzos-webgl.ts).
      quitarFoto = registrarLienzo(map.getCanvas(), () => {
        map.redraw();
        return map.getCanvas().toDataURL("image/png");
      });
    })();
    return () => {
      vivo = false;
      quitarFoto?.();
      mapa.current?.remove();
      mapa.current = null;
      setListo(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapa.current;
    if (!map || !listo) return;
    map.setStyle(resolvedTheme === "dark" ? ESTILOS.dark : ESTILOS.light);
  }, [resolvedTheme, listo]);

  useEffect(() => {
    const map = mapa.current;
    if (!map || !listo) return;
    map.getCanvas().style.cursor = colocar ? "crosshair" : "";
  }, [colocar, listo]);

  // Los puntos son marcadores del DOM (son pocos, y así llevan el número y se tocan con teclado).
  useEffect(() => {
    const map = mapa.current;
    const m = lib.current;
    if (!map || !m || !listo) return;
    for (const x of marcas.current) x.remove();
    marcas.current = puntos.map((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = p.titulo;
      el.setAttribute("aria-label", p.titulo);
      el.textContent = p.rotulo;
      el.style.cssText = `width:22px;height:22px;border-radius:${p.deposito ? "4px" : p.pedido ? "50% 50% 50% 0" : "50%"};background:${p.color};color:#fff;font:800 12px/22px var(--font-sans);text-align:center;border:2px solid var(--card);box-shadow:0 1px 3px rgb(0 0 0/.35);cursor:pointer;padding:0${p.hecho ? ";opacity:.45" : ""}`;
      if (p.pedido) el.dataset.pinPedido = p.pedido;
      if (p.c != null) el.addEventListener("click", () => tocar.current(p.c!));
      return new m.default.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
    });
    if (puntos.length > 1) {
      const lngs = puntos.map((p) => p.lng), lats = puntos.map((p) => p.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 28, maxZoom: 13, duration: 0 });
    } else if (puntos[0]) map.jumpTo({ center: [puntos[0].lng, puntos[0].lat], zoom: 12 });
  }, [puntos, listo]);

  return (
    <div className="relative">
      <div ref={contenedor} className={`h-[220px] w-full overflow-hidden rounded-md bg-muted${colocar ? " ring-2 ring-primary" : ""}`} aria-label="Mini mapa con las obras del día" role="region" />
      {falla && <p className="mt-1.5 text-xs text-muted-foreground">No se pudo cargar el mapa.</p>}
    </div>
  );
}
