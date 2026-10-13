"use client";

// Ciudad Armada: el mapa 3D real de Buenos Aires con cada estructura dibujada sobre la vereda.
// Especificación: docs/mapa-obras/ciudad-armada.md y la maqueta aprobada
// docs/mapa-obras/maqueta/ciudad-armada.html. Contrato: CiudadArmadaMapaProps / Api en
// src/lib/mapa-obras/tipos.ts. La página lo carga con dynamic(..., { ssr: false }) y le pasa
// `ref` (React 19: ref es una prop más, sin forwardRef).
//
// DOS TRAMPAS YA RESUELTAS, NO DESHACER:
//  · El CSS de MapLibre va ESTÁTICO y arriba (ee6f18f). Con import dinámico Next no lo procesa
//    y el mapa queda como un rectángulo blanco con los controles desalineados.
//  · maplibre-gl fijado en la v5 (fd0badc). El worker de la v6 se resuelve con
//    `new URL(..., import.meta.url)` y no sobrevive al bundling de Next: el mapa queda en blanco.
//
// El mapa se crea UNA vez. Obras, selección y tema se aplican con setData / setFilter /
// setPaintProperty; nunca se recrea ni se cambia el style (eso borraría las capas de obras).

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, PointLike } from "maplibre-gl";
import type { CiudadArmadaMapaApi, CiudadArmadaMapaProps, ObraParaMapa } from "@/lib/mapa-obras/tipos";
import { anclaDe, armarCapas, medidasDibujo, puntoDetras, seDibuja } from "@/lib/mapa-obras/geometria";
import { CAPA_EDIFICIOS, colorPaleta, estiloMapa } from "@/lib/mapa-obras/estilo-mapa";
import {
  agregarCapasObras,
  CAPA,
  CAPAS_CLICK,
  FUENTE_COLUMNAS,
  FUENTE_ESTRUCTURA,
  FUENTE_PUNTOS,
  marcarSeleccionada,
  temaCapasObras,
} from "./capas";

type Margen = NonNullable<CiudadArmadaMapaProps["margen"]>;
const SIN_MARGEN: Margen = { top: 0, right: 0, bottom: 0, left: 0 };

/** Vista general de CABA, inclinada (el HOME de la maqueta). */
const GENERAL = { center: [-58.452, -34.612] as [number, number], zoom: 11.55, pitch: 52, bearing: -17 };
/** Donde arranca la cámara antes del vuelo de entrada. */
const INICIO = { center: [-58.44, -34.605] as [number, number], zoom: 10.3 };
const PITCH_3D = 58;

/** Un pedido de cámara que llegó antes de que el mapa terminara de cargar. */
type PedidoCamara = (m: MapLibreMap) => void;

const prefiereMenosMovimiento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Desplazamiento del centro para que lo que se enfoca quede en el centro del hueco libre. */
const desplazamiento = (m: Margen): PointLike => [(m.left - m.right) / 2, (m.top - m.bottom) / 2];

export type CiudadArmadaMapaComponenteProps = CiudadArmadaMapaProps & { ref?: Ref<CiudadArmadaMapaApi> };

export function CiudadArmadaMapa({
  obras,
  seleccionada,
  onSeleccionar,
  tema,
  plano,
  margen,
  ref,
}: CiudadArmadaMapaComponenteProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  // Obras con edificio de OSM detrás (no llevan el aproximado). Se descubre mirando el mapa.
  const [conEdificio, setConEdificio] = useState<ReadonlySet<number>>(() => new Set());

  // Lo último de cada prop, para los handlers del mapa que se registran una sola vez.
  const props = useRef({ obras, onSeleccionar, tema, plano, margen: margen ?? SIN_MARGEN });
  useEffect(() => {
    props.current = { obras, onSeleccionar, tema, plano, margen: margen ?? SIN_MARGEN };
  });
  const pendiente = useRef<PedidoCamara | null>(null);
  const revisadas = useRef(new Map<number, boolean>());
  const pulso = useRef<{ actualizar: () => void; hayPendientes: boolean }>({ actualizar: () => {}, hayPendientes: false });

  useImperativeHandle(ref, (): CiudadArmadaMapaApi => {
    /** Ejecuta un movimiento de cámara ahora o, si el mapa no cargó, apenas cargue. */
    const camara = (f: PedidoCamara) => {
      const m = mapa.current;
      if (m && m.getLayer(CAPA.punto)) f(m);
      else pendiente.current = f;
    };
    return {
      volarA(ventaId, duracionMs) {
        camara((m) => volarAObra(m, props.current, ventaId, duracionMs));
      },
      irAGeneral(duracionMs) {
        camara((m) => irAGeneral(m, props.current, duracionMs));
      },
      encuadrar(ventaIds) {
        camara((m) => encuadrar(m, props.current, ventaIds));
      },
    };
  }, []);

  // ---- crear el mapa (una vez) ----
  useEffect(() => {
    let vivo = true;
    let ro: ResizeObserver | null = null;
    let raf = 0;
    let intro: ReturnType<typeof setTimeout> | undefined;
    const pul = pulso.current;
    const alCambiarVisibilidad = () => pul.actualizar();

    (async () => {
      // El JS se importa adentro del efecto (el CSS no: ver arriba). El componente ya se
      // carga sin SSR, pero así tampoco rompe si alguien lo importa en el server.
      const maplibre = (await import("maplibre-gl")).default;
      if (!vivo || !contenedor.current || mapa.current) return;

      let m: MapLibreMap;
      try {
        m = new maplibre.Map({
          container: contenedor.current,
          style: estiloMapa(props.current.tema),
          center: INICIO.center,
          zoom: INICIO.zoom,
          pitch: 0,
          bearing: 0,
          maxZoom: 20.5,
          minZoom: 8,
          maxPitch: 75,
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true },
        });
      } catch (e) {
        console.error("[ciudad-armada]", e);
        setFalla("No se pudo iniciar el mapa 3D. Puede que este navegador no tenga WebGL.");
        return;
      }
      mapa.current = m;
      m.addControl(new maplibre.NavigationControl({ visualizePitch: true }), "bottom-right");

      m.on("error", (e) => {
        console.warn("[ciudad-armada]", e.error?.message ?? e);
        // Un tile que falla no rompe el mapa; un style que no carga, sí.
        if (vivo && !m.loaded() && !m.isStyleLoaded()) setFalla("No se pudo cargar el mapa. Revisá la conexión y recargá.");
      });

      m.on("load", () => {
        if (!vivo) return;
        m.resize();
        agregarCapasObras(m, props.current.tema);
        setFalla(null);
        setListo(true);

        // ---- click y cursor ----
        const capasClick = () => CAPAS_CLICK.filter((l) => m.getLayer(l));
        const obraBajo = (p: { x: number; y: number }, tolerancia: number): number | null => {
          const f: MapGeoJSONFeature[] = m.queryRenderedFeatures(
            [
              [p.x - tolerancia, p.y - tolerancia],
              [p.x + tolerancia, p.y + tolerancia],
            ],
            { layers: capasClick() },
          );
          const id = f[0]?.properties?.id;
          return id == null ? null : Number(id);
        };
        m.on("click", (e) => props.current.onSeleccionar(obraBajo(e.point, 4)));
        let ultimoCursor = "";
        m.on("mousemove", (e) => {
          if (m.isMoving()) return;
          const c = obraBajo(e.point, 2) != null ? "pointer" : "";
          if (c !== ultimoCursor) m.getCanvas().style.cursor = ultimoCursor = c;
        });

        // ---- edificios de OSM detrás de cada obra ----
        m.on("idle", () => revisarEdificios(m));

        // ---- pulso del halo de las pendientes ----
        // Sólo corre si hay pendientes dibujadas, la pestaña está visible y el usuario no
        // pidió menos movimiento. Una vuelta cada ~1,4 s, a ~30 cuadros por segundo.
        let ultimo = 0;
        const paso = (t: number) => {
          raf = 0;
          if (!vivo || !m.getLayer(CAPA.halo)) return;
          if (t - ultimo >= 33) {
            ultimo = t;
            const ph = (t / 1400) % 1;
            m.setPaintProperty(CAPA.halo, "circle-radius", 8 + ph * 22);
            m.setPaintProperty(CAPA.halo, "circle-stroke-opacity", 0.8 * (1 - ph));
          }
          raf = requestAnimationFrame(paso);
        };
        pulso.current.actualizar = () => {
          const correr = vivo && pulso.current.hayPendientes && !document.hidden && !prefiereMenosMovimiento();
          if (correr && !raf) raf = requestAnimationFrame(paso);
          if (!correr && raf) {
            cancelAnimationFrame(raf);
            raf = 0;
          }
        };
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        pulso.current.actualizar();

        // ---- cámara inicial ----
        const p = pendiente.current;
        pendiente.current = null;
        if (p) p(m);
        else {
          const reducir = prefiereMenosMovimiento();
          intro = setTimeout(() => irAGeneral(m, props.current, reducir ? 0 : 4200), reducir ? 0 : 500);
        }
      });

      ro = new ResizeObserver(() => m.resize());
      ro.observe(contenedor.current);
    })();

    /**
     * ¿Hay un edificio de OpenStreetMap detrás de la fachada? Se mira un punto 5 m adentro y se
     * pregunta a la capa de edificios. Sólo de cerca (zoom ≥ 15,5, cuando la capa existe y se
     * ve) y para las obras en pantalla que todavía no se revisaron. Si hay, el aproximado sobra:
     * se dibujaría superpuesto con el real.
     */
    function revisarEdificios(m: MapLibreMap) {
      if (!vivo || m.getZoom() < 15.5 || !m.getLayer(CAPA_EDIFICIOS)) return;
      const canvas = m.getCanvas();
      const ancho = canvas.clientWidth;
      const alto = canvas.clientHeight;
      const nuevas: number[] = [];
      for (const { obra } of props.current.obras) {
        if (revisadas.current.has(obra.ventaId) || !seDibuja(obra)) continue;
        const atras = puntoDetras(obra, 5);
        if (!atras) continue;
        const px = m.project(atras);
        if (px.x < 0 || px.y < 0 || px.x > ancho || px.y > alto) continue;
        const hay = m.queryRenderedFeatures(px, { layers: [CAPA_EDIFICIOS] }).length > 0;
        revisadas.current.set(obra.ventaId, hay);
        if (hay) nuevas.push(obra.ventaId);
      }
      if (nuevas.length) setConEdificio((prev) => new Set([...prev, ...nuevas]));
    }

    return () => {
      vivo = false;
      clearTimeout(intro);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      pul.actualizar = () => {};
      ro?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      pendiente.current = null;
      setListo(false);
    };
  }, []);

  // ---- obras y tema → setData ----
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const capas = armarCapas(obras, tema, conEdificio);
    (m.getSource(FUENTE_ESTRUCTURA) as GeoJSONSource | undefined)?.setData(capas.estructura);
    (m.getSource(FUENTE_COLUMNAS) as GeoJSONSource | undefined)?.setData(capas.columnas);
    (m.getSource(FUENTE_PUNTOS) as GeoJSONSource | undefined)?.setData(capas.puntos);
    pulso.current.hayPendientes = capas.puntos.features.some((f) => f.properties.cat === "pendiente");
    pulso.current.actualizar();
  }, [obras, tema, conEdificio, listo]);

  // ---- tema → colores del mapa base y de las etiquetas, sin recargar el style ----
  const temaAplicado = useRef(tema);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || temaAplicado.current === tema) return;
    temaAplicado.current = tema;
    for (const capa of estiloMapa(tema).layers) {
      if (!m.getLayer(capa.id) || !("paint" in capa) || !capa.paint) continue;
      for (const [k, v] of Object.entries(capa.paint)) m.setPaintProperty(capa.id, k, v);
    }
    temaCapasObras(m, tema);
  }, [tema, listo]);

  // ---- selección → etiqueta grande ----
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    marcarSeleccionada(m, seleccionada);
  }, [seleccionada, listo]);

  // ---- 2D / 3D ----
  const planoAplicado = useRef(plano);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || planoAplicado.current === plano) return;
    planoAplicado.current = plano;
    m.easeTo({
      pitch: plano ? 0 : PITCH_3D,
      bearing: plano ? 0 : m.getBearing(),
      duration: prefiereMenosMovimiento() ? 0 : 900,
    });
  }, [plano, listo]);

  return (
    <div className="relative h-full w-full" style={{ background: colorPaleta("bg", tema) }}>
      <div ref={contenedor} className="h-full w-full" />
      {falla && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 text-center">
          <p className="text-sm text-muted-foreground">{falla}</p>
        </div>
      )}
    </div>
  );
}

export default CiudadArmadaMapa;

// ---------------------------------------------------------------------------------------
// Cámara

type Actual = { obras: ObraParaMapa[]; plano: boolean; margen: Margen };

const duracion = (ms: number) => (prefiereMenosMovimiento() ? 0 : ms);

/** Volar de frente a la fachada: `focus()` de la maqueta. */
function volarAObra(m: MapLibreMap, a: Actual, ventaId: number, duracionMs?: number) {
  const p = a.obras.find((x) => x.obra.ventaId === ventaId);
  if (!p || !seDibuja(p.obra)) return;
  const ancla = anclaDe(p.obra)!;
  const [nx, ny] = ancla.normal;
  // Mirando en la dirección de la normal (de la calle al edificio), girado 28° para ver el
  // andamio un poco de costado y no de frente plano.
  const bearing = (Math.atan2(nx, ny) * 180) / Math.PI + 28;
  const { alto } = medidasDibujo(p.obra);
  const zoom = alto > 10 ? 18.6 : alto > 5 ? 19.3 : 19.8;
  m.flyTo({
    center: ancla.punto,
    zoom,
    pitch: a.plano ? 0 : 64,
    bearing,
    offset: desplazamiento(a.margen),
    duration: duracion(duracionMs ?? 3200),
    essential: true,
  });
}

function irAGeneral(m: MapLibreMap, a: Actual, duracionMs?: number) {
  m.flyTo({
    ...GENERAL,
    pitch: a.plano ? 0 : GENERAL.pitch,
    bearing: a.plano ? 0 : GENERAL.bearing,
    offset: desplazamiento(a.margen),
    duration: duracion(duracionMs ?? 2600),
    essential: true,
  });
}

/** Encuadrar el resultado de una búsqueda: `fitVis()` de la maqueta. */
function encuadrar(m: MapLibreMap, a: Actual, ventaIds: number[]) {
  const ids = new Set(ventaIds);
  const puntos = a.obras
    .filter((p) => ids.has(p.obra.ventaId) && seDibuja(p.obra))
    .map((p) => anclaDe(p.obra)!.punto);
  if (!puntos.length) return;
  if (puntos.length === 1) {
    m.easeTo({
      center: puntos[0],
      zoom: 16.5,
      pitch: a.plano ? 0 : 55,
      offset: desplazamiento(a.margen),
      duration: duracion(1200),
    });
    return;
  }
  let [oe, su, es, no] = [180, 90, -180, -90];
  for (const [x, y] of puntos) {
    oe = Math.min(oe, x);
    es = Math.max(es, x);
    su = Math.min(su, y);
    no = Math.max(no, y);
  }
  // Si los paneles ocupan casi todo (ventana chica), se encuadra sin descontarlos: con un
  // padding más grande que el canvas MapLibre no se mueve.
  const c = m.getCanvas();
  const entra = a.margen.left + a.margen.right + 200 < c.clientWidth && a.margen.top + a.margen.bottom + 200 < c.clientHeight;
  const mg = entra ? a.margen : SIN_MARGEN;
  m.fitBounds(
    [
      [oe, su],
      [es, no],
    ],
    {
      padding: { top: mg.top + 60, right: mg.right + 60, bottom: mg.bottom + 60, left: mg.left + 60 },
      maxZoom: 16,
      pitch: a.plano ? 0 : 45,
      duration: duracion(1200),
    },
  );
}
