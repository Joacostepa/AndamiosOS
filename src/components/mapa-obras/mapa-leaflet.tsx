"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Map as LeafletMap, CircleMarker, LayerGroup } from "leaflet";
import { antiguedadDe, type ObraEnMapa } from "@/lib/mapa-obras/antiguedad";

// El mapa en sí. Leaflet manejado a mano, sin wrapper de React.
//
// POR QUÉ SIN WRAPPER: es un solo mapa en toda la app. Un wrapper agregaría una dependencia
// más y un modelo de reconciliación que acá no hace falta — los puntos se redibujan enteros
// cuando cambia el filtro, que con 85 marcadores es instantáneo.
//
// POR QUÉ NO GOOGLE MAPS PARA DIBUJAR: Google cobra por CADA carga de mapa, y esta pantalla
// se deja abierta. Además su key tendría que viajar al navegador, y la que tenemos no tiene
// restricción de origen —se la sacamos para que Odoo pueda llamarla desde su servidor—, así
// que publicarla sería regalarla. Google se usa donde es insustituible: geocodificar, una
// vez, del lado del servidor (ver scripts/odoo-geocodificar-obras.mjs).
//
// Los tiles son de CARTO, que tiene un par claro/oscuro del mismo diseño: el mapa sigue al
// tema de la app en vez de quedar como un rectángulo blanco en modo oscuro.

const TILES = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATRIBUCION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Encuadre inicial: AMBA. Se reemplaza por el de los puntos apenas hay alguno. */
const CENTRO: [number, number] = [-34.61, -58.44];

export function MapaLeaflet({
  obras,
  seleccionada,
  onSeleccionar,
}: {
  obras: ObraEnMapa[];
  seleccionada: number | null;
  onSeleccionar: (ventaId: number | null) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const capaPuntos = useRef<LayerGroup | null>(null);
  const porVenta = useRef<Map<number, CircleMarker>>(new Map());
  const { resolvedTheme } = useTheme();
  const capaTiles = useRef<ReturnType<typeof import("leaflet").tileLayer> | null>(null);

  // Leaflet toca `window` al importarse, así que entra por import dinámico dentro del
  // efecto: con un import estático el build de Next lo evalúa en el servidor y explota.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (!vivo || !contenedor.current || mapa.current) return;

      const m = L.map(contenedor.current, {
        center: CENTRO,
        zoom: 11,
        zoomControl: true,
        // El scroll del mouse hace zoom sólo con Ctrl: la página scrollea y un mapa que se
        // come la rueda deja al usuario atrapado adentro.
        scrollWheelZoom: false,
      });
      capaTiles.current = L.tileLayer(TILES.light, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(m);
      capaPuntos.current = L.layerGroup().addTo(m);
      // Clic en el mapa vacío = deseleccionar. Sin esto la ficha lateral queda pegada.
      m.on("click", () => onSeleccionar(null));
      mapa.current = m;
    })();
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
    };
    // Se monta una sola vez: los handlers leen de refs, no de props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El tema cambia sin remontar el mapa: se cambia la URL de los tiles y listo.
  useEffect(() => {
    if (!capaTiles.current) return;
    capaTiles.current.setUrl(resolvedTheme === "dark" ? TILES.dark : TILES.light);
  }, [resolvedTheme]);

  // Puntos. Se redibujan enteros cuando cambia el filtro.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !mapa.current || !capaPuntos.current) return;
      capaPuntos.current.clearLayers();
      porVenta.current.clear();

      for (const o of obras) {
        const a = antiguedadDe(o.diasArmado);
        const marcador = L.circleMarker([o.lat, o.lng], {
          radius: 7,
          weight: 2,
          color: "#ffffff",
          fillColor: a.color,
          fillOpacity: 0.9,
        })
          .bindTooltip(
            `<b>${escapar(o.direccion)}</b>${o.referencia ? `<br>${escapar(o.referencia)}` : ""}`,
            { direction: "top", offset: [0, -8] },
          )
          .on("click", (e) => {
            // Sin esto el clic sube al mapa y el handler de deseleccionar lo apaga al toque.
            e.originalEvent.stopPropagation();
            onSeleccionar(o.ventaId);
          });
        marcador.addTo(capaPuntos.current!);
        porVenta.current.set(o.ventaId, marcador);
      }

      if (obras.length > 0) {
        const limites = L.latLngBounds(obras.map((o) => [o.lat, o.lng] as [number, number]));
        mapa.current.fitBounds(limites, { padding: [40, 40], maxZoom: 14 });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [obras, onSeleccionar]);

  // La seleccionada se agranda y se centra. Es lo que ata la lista lateral con el mapa:
  // hacer clic en una fila tiene que mover el mapa, no sólo pintar la fila.
  useEffect(() => {
    for (const [ventaId, marcador] of porVenta.current) {
      marcador.setStyle({ weight: ventaId === seleccionada ? 4 : 2 });
      marcador.setRadius(ventaId === seleccionada ? 11 : 7);
    }
    if (seleccionada != null) {
      const m = porVenta.current.get(seleccionada);
      if (m && mapa.current) mapa.current.panTo(m.getLatLng());
    }
  }, [seleccionada, obras]);

  return <div ref={contenedor} className="h-full w-full rounded-lg" />;
}

/** Los tooltips van como HTML: una dirección con "&" o "<" rompería el marcado. */
function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
