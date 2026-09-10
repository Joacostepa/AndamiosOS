"use client";

// El CSS va ESTÁTICO y arriba. Importado con `await import(...)` adentro del efecto, el
// bundler de Next no lo procesa: el mapa quedaba sin las reglas de .maplibregl-canvas y se
// veía un rectángulo blanco con los controles desalineados.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { TRAMOS, tramoDe, type ObraEnMapa } from "@/lib/mapa-obras/antiguedad";

// El mapa. MapLibre GL con tiles VECTORIALES, no Leaflet con imágenes.
//
// PINNEADO EN LA v5 A PROPÓSITO. La v6 resuelve su Web Worker con
// `new URL("./maplibre-gl-worker.mjs", import.meta.url)`, y cuando Next empaqueta la
// librería ese archivo no queda al lado del chunk: el navegador pide una ruta que no
// existe, el server contesta el HTML del 404 y falla con "non-JavaScript MIME type of
// text/html". El mapa queda en blanco CON los controles funcionando, porque lo único que
// se rompe es el worker que decodifica los tiles. La v5 inlinea el worker y no tiene el
// problema. Antes de subir a la v6 hay que resolver eso —probablemente con setWorkerUrl()
// apuntando a una copia en /public— o vuelve el rectángulo blanco.
//
// POR QUÉ VECTORIAL: el zoom es continuo y las etiquetas se redibujan nítidas en cualquier
// nivel, en vez de escalar una imagen y saltar de un nivel al siguiente. Es la diferencia
// entre un mapa que se siente moderno y uno que se siente de 2012.
//
// POR QUÉ OPENFREEMAP Y NO CARTO: las tiles de CARTO pasaron a pedir API key y estampan
// "API KEY REQUIRED" encima del mapa. OpenFreeMap es gratis, sin key y sin cuota, y trae el
// par positron/dark, así que el mapa sigue el tema de la app.
//
// POR QUÉ NO GOOGLE MAPS: cobra por cada carga y esta pantalla se deja abierta; y su key
// tendría que viajar al navegador, cuando la que tenemos no tiene restricción de origen
// —se la sacamos para que Odoo pueda llamarla desde su servidor—. Google se usa donde es
// insustituible: geocodificar, del lado del servidor (scripts/odoo-geocodificar-obras.mjs).
//
// LOS PUNTOS SON UNA CAPA DE CÍRCULOS, no marcadores del DOM: los dibuja la GPU, escalan
// con el zoom sin recalcular nada y permiten el halo de abajo sin sumar 83 nodos más.

const ESTILOS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const FUENTE = "obras";
const CAPA_HALO = "obras-halo";
const CAPA_PUNTO = "obras-punto";

function aGeoJson(obras: ObraEnMapa[]) {
  return {
    type: "FeatureCollection" as const,
    features: obras.map((o) => ({
      type: "Feature" as const,
      id: o.ventaId,
      geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
      properties: {
        ventaId: o.ventaId,
        color: TRAMOS[tramoDe(o.diasArmado)].color,
        direccion: o.direccion,
        referencia: o.referencia ?? "",
      },
    })),
  };
}

export function MapaObras({
  obras,
  seleccionada,
  onSeleccionar,
}: {
  obras: ObraEnMapa[];
  seleccionada: number | null;
  onSeleccionar: (ventaId: number | null) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();
  // El estado —y no una ref— es lo que destraba el efecto de los puntos. Con una ref, el
  // efecto que dibuja corría una sola vez, encontraba el mapa a medio inicializar y no se
  // volvía a ejecutar nunca: el mapa quedaba vacío. Fue exactamente el bug de la v1.
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (!vivo || !contenedor.current || mapa.current) return;

      const m = new maplibre.Map({
        container: contenedor.current,
        style: ESTILOS.light,
        center: [-58.44, -34.61],
        zoom: 10,
        attributionControl: { compact: true },
      });
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      m.addControl(new maplibre.FullscreenControl(), "top-left");
      // Zoom con la rueda, sin pedir Ctrl: es lo primero que la gente intenta en un mapa.
      m.scrollZoom.enable();
      m.on("error", (e) => {
        console.error("[mapa-obras]", e.error ?? e);
        if (vivo) setFalla(e.error?.message ?? "No se pudo cargar el mapa");
      });
      m.on("load", () => {
        if (!vivo) return;
        // Si el contenedor todavía no tenía alto al construirse, el canvas queda en 0.
        m.resize();
        setListo(true);
      });
      mapa.current = m;
    })();
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      setListo(false);
    };
  }, []);

  // Cambiar el estilo borra las capas propias, así que se vuelven a agregar cuando el
  // estilo nuevo terminó de cargar. Sin esto, pasar a oscuro dejaba el mapa sin puntos.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const url = resolvedTheme === "dark" ? ESTILOS.dark : ESTILOS.light;
    setListo(false);
    m.setStyle(url);
    m.once("styledata", () => setListo(true));
  }, [resolvedTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const datos = aGeoJson(obras);

    const existente = m.getSource(FUENTE) as GeoJSONSource | undefined;
    if (existente) {
      existente.setData(datos);
    } else {
      m.addSource(FUENTE, { type: "geojson", data: datos });
      // El halo da profundidad y hace que un punto suelto se lea desde lejos, sin agrandar
      // el punto en sí —que apelotonado en el microcentro taparía a los vecinos—.
      m.addLayer({
        id: CAPA_HALO,
        type: "circle",
        source: FUENTE,
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.16,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 20, 16, 34],
        },
      });
      m.addLayer({
        id: CAPA_PUNTO,
        type: "circle",
        source: FUENTE,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 7, 16, 11],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.95,
        },
      });

      m.on("click", CAPA_PUNTO, (e) => {
        const id = e.features?.[0]?.properties?.ventaId;
        if (id != null) onSeleccionar(Number(id));
      });
      // Clic en el mapa vacío = deseleccionar. El handler de la capa corre antes y no
      // propaga, así que no se pisan.
      m.on("click", (e) => {
        const hit = m.queryRenderedFeatures(e.point, { layers: [CAPA_PUNTO] });
        if (hit.length === 0) onSeleccionar(null);
      });
      m.on("mouseenter", CAPA_PUNTO, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", CAPA_PUNTO, () => (m.getCanvas().style.cursor = ""));
    }

    if (obras.length > 0) {
      let [oe, su, es, no] = [180, 90, -180, -90];
      for (const o of obras) {
        oe = Math.min(oe, o.lng); es = Math.max(es, o.lng);
        su = Math.min(su, o.lat); no = Math.max(no, o.lat);
      }
      m.fitBounds([[oe, su], [es, no]], { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [obras, listo, onSeleccionar]);

  // La seleccionada se agranda y el mapa vuela hacia ella. Es lo que ata la lista con el
  // mapa: hacer clic en una fila tiene que mover el mapa, no sólo pintar la fila.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !m.getLayer(CAPA_PUNTO)) return;
    m.setPaintProperty(CAPA_PUNTO, "circle-stroke-width", [
      "case", ["==", ["get", "ventaId"], seleccionada ?? -1], 4, 2,
    ]);
    m.setPaintProperty(CAPA_PUNTO, "circle-radius", [
      "case",
      ["==", ["get", "ventaId"], seleccionada ?? -1],
      ["interpolate", ["linear"], ["zoom"], 9, 8, 13, 12, 16, 16],
      ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 7, 16, 11],
    ]);
    const obra = obras.find((o) => o.ventaId === seleccionada);
    if (obra) m.flyTo({ center: [obra.lng, obra.lat], zoom: Math.max(m.getZoom(), 15), duration: 700 });
  }, [seleccionada, listo, obras]);

  return (
    <div className="relative h-full w-full">
      <div ref={contenedor} className="h-full w-full" />
      {falla && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 text-center">
          <p className="text-sm text-muted-foreground">{falla}</p>
        </div>
      )}
    </div>
  );
}
