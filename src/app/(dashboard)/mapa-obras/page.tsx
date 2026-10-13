"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type {
  CategoriaMapa, CiudadArmadaMapaApi, ObraMapa, ObraParaMapa, RespuestaMapaObras,
} from "@/lib/mapa-obras/tipos";
import {
  categoriaDe, coincide, conteoCategorias, curvaDe, decisiones as calcularDecisiones, fechaBA,
  itemsTv, kpis, presenteEn, semanaParaVer, subtituloDe, tieneUbicacion, type Vista,
} from "@/lib/mapa-obras/categorias";
import { PanelKpis } from "@/components/mapa-obras/panel/kpis";
import { Leyenda, SelectorVista } from "@/components/mapa-obras/panel/vista-leyenda";
import { BarraBotones } from "@/components/mapa-obras/panel/barra-botones";
import { ListaObras } from "@/components/mapa-obras/panel/lista-obras";
import { FichaObra } from "@/components/mapa-obras/panel/ficha-obra";
import { LineaTiempo } from "@/components/mapa-obras/panel/linea-tiempo";
import { TarjetaTv, useModoTv } from "@/components/mapa-obras/panel/modo-tv";
import { vidrio } from "@/components/mapa-obras/panel/estilos";

// Ciudad Armada: el mapa 3D real de Buenos Aires con lo que tenemos en la calle, las
// pendientes de desarme y el histórico de lo desarmado.
//
// Especificación: docs/mapa-obras/ciudad-armada.md y la maqueta aprobada
// (docs/mapa-obras/maqueta/ciudad-armada.html). La página decide QUÉ se ve (vista, búsqueda,
// leyenda, fecha del histórico, modo TV) y el mapa sólo pinta lo que recibe.
//
// El mapa ocupa todo el alto disponible y los paneles flotan encima en vidrio oscuro. El
// contenedor de los paneles lleva `dark` para que Input y Button tomen los tokens oscuros
// aunque la app esté en claro.

const CiudadArmadaMapa = dynamic(() => import("@/components/mapa-obras/ciudad/ciudad-armada-mapa"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center font-mono text-xs text-[#9AA8B3]">
      Cargando el mapa de Buenos Aires…
    </div>
  ),
});

/** Fondo del contenedor mientras carga el mapa, del color del mapa. */
const FONDO = { noche: "#0B1116", dia: "#E7EAE6" } as const;

type Ocultas = Record<Vista, Set<CategoriaMapa>>;

function useMedia(query: string, enServidor = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => enServidor,
  );
}

/** Después de que React aplique el estado y el mapa reciba las obras nuevas. */
const despues = (f: () => void) => setTimeout(f, 0);

export default function MapaObrasPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["mapa-obras"],
    queryFn: async () => {
      const res = await fetch("/api/operaciones/mapa-obras");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo leer el mapa");
      return (await res.json()) as RespuestaMapaObras;
    },
    staleTime: 5 * 60 * 1000,
    // Las fotos de Telegram vienen con URLs firmadas que vencen a la hora (fotos-telegram.ts)
    // y la TV de la oficina queda abierta todo el día sin foco, así que sin esto mostraba los
    // datos de cuando se abrió y miniaturas rotas. Media hora: antes de que venzan las URLs.
    refetchInterval: 30 * 60 * 1000,
  });

  // Mientras el servidor no devuelva el formato nuevo (con `curva`), no se pinta nada: las
  // obras del formato viejo no traen estado, medidas ni ubicación y romperían los paneles.
  const formatoNuevo = !!data && Array.isArray(data.obras) && Array.isArray(data.curva);
  const obras: ObraMapa[] = useMemo(() => (formatoNuevo ? data!.obras : []), [formatoNuevo, data]);
  const generado = data?.generado ?? null;
  const hoy = useMemo(() => (generado ? fechaBA(new Date(generado)) : fechaBA()), [generado]);
  const curva = useMemo(() => curvaDe(obras, formatoNuevo ? data!.curva : [], hoy), [obras, formatoNuevo, data, hoy]);

  // ---- estado de la pantalla ----
  const [vista, setVista] = useState<Vista>("calle");
  const [ocultas, setOcultas] = useState<Ocultas>(() => ({ calle: new Set(), historico: new Set() }));
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState(""); // la búsqueda con 160 ms de respiro
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [tema, setTema] = useState<"noche" | "dia">("noche");
  const [plano, setPlano] = useState(false);
  const [indiceElegido, setIndice] = useState<number | null>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);

  const escritorio = useMedia("(min-width: 1024px)", true);
  const reducirMovimiento = useMedia("(prefers-reduced-motion: reduce)");

  const contenedor = useRef<HTMLDivElement>(null);
  const api = useRef<CiudadArmadaMapaApi | null>(null);

  // El histórico arranca seis semanas atrás: en la semana de hoy, por definición, no hay
  // ninguna desarmada en la calle y el mapa se ve igual que "En la calle".
  const indice = Math.min(indiceElegido ?? Math.max(0, curva.length - 7), Math.max(0, curva.length - 1));
  const fechaHist = curva[indice]?.fecha ?? hoy;
  const hist = vista === "historico";

  // ---- derivados ----
  const decisiones = useMemo(() => calcularDecisiones(obras, hoy), [obras, hoy]);
  const tvItems = useMemo(() => itemsTv(obras, decisiones), [obras, decisiones]);
  const kpisCalle = useMemo(() => (formatoNuevo ? kpis(obras, "calle") : null), [obras, formatoNuevo]);
  const kpisVista = useMemo(
    () => (!formatoNuevo ? null : hist ? kpis(obras, "historico", fechaHist) : kpisCalle),
    [formatoNuevo, hist, obras, fechaHist, kpisCalle],
  );
  const conteos = useMemo(() => conteoCategorias(obras, vista, fechaHist), [obras, vista, fechaHist]);

  const filtrarParaMapa = useCallback(
    (q: string): ObraParaMapa[] =>
      obras
        .filter((o) => (vista === "calle" ? o.estado !== "desarmada" : presenteEn(o, fechaHist)))
        .filter((o) => tieneUbicacion(o) && coincide(o, q))
        .map((o) => ({ obra: o, categoria: categoriaDe(o, vista, fechaHist), subtitulo: subtituloDe(o) }))
        .filter((x) => !ocultas[vista].has(x.categoria)),
    [obras, vista, fechaHist, ocultas],
  );
  const obrasMapa = useMemo(() => filtrarParaMapa(consulta), [filtrarParaMapa, consulta]);
  const obraSel = useMemo(() => obras.find((o) => o.ventaId === seleccionada) ?? null, [obras, seleccionada]);

  // ---- modo TV ----
  const alEmpezarTv = useCallback(() => {
    setSeleccionada(null);
    setVista("calle");
    setBusqueda("");
    setConsulta("");
    setListaAbierta(false);
    setReproduciendo(false);
    // Sin filtros de la leyenda: si no, la TV anuncia una obra oculta y la cámara no vuela.
    setOcultas({ calle: new Set(), historico: new Set() });
  }, []);
  const tv = useModoTv({
    contenedor,
    api,
    items: tvItems,
    reducirMovimiento,
    alEmpezar: alEmpezarTv,
    alSeleccionar: setSeleccionada,
  });
  const temaMapa = tv.activo ? "noche" : tema;

  // ---- búsqueda: filtra lista y mapa, y encuadra ----
  const filtrarRef = useRef(filtrarParaMapa);
  useEffect(() => {
    filtrarRef.current = filtrarParaMapa;
  });
  useEffect(() => {
    const t = setTimeout(() => {
      setConsulta(busqueda);
      if (!busqueda.trim()) return;
      const ids = filtrarRef.current(busqueda).map((x) => x.obra.ventaId);
      if (ids.length) despues(() => api.current?.encuadrar(ids));
    }, 160);
    return () => clearTimeout(t);
  }, [busqueda]);

  // ---- play de la línea de tiempo ----
  const indiceRef = useRef(indice);
  useEffect(() => {
    indiceRef.current = indice;
  });
  useEffect(() => {
    if (!reproduciendo) return;
    const id = setInterval(() => {
      const i = indiceRef.current + 1;
      if (i >= curva.length) {
        setReproduciendo(false);
        return;
      }
      setIndice(i);
    }, reducirMovimiento ? 1200 : 650);
    return () => clearInterval(id);
  }, [reproduciendo, curva.length, reducirMovimiento]);

  // ---- acciones ----
  const cambiarVista = useCallback((v: Vista) => {
    setVista(v);
    setSeleccionada(null);
    setReproduciendo(false);
    // Sin filtros de la leyenda: si no, la TV anuncia una obra oculta y la cámara no vuela.
    setOcultas({ calle: new Set(), historico: new Set() });
  }, []);

  const elegir = useCallback(
    (o: ObraMapa) => {
      if (tv.activo) tv.salir();
      if (vista === "calle" && o.estado === "desarmada") setVista("historico");
      const enHist = vista === "historico" || o.estado === "desarmada";
      if (enHist && tieneUbicacion(o) && !presenteEn(o, fechaHist)) {
        const i = semanaParaVer(o, curva.map((p) => p.fecha));
        if (i != null) {
          setIndice(i);
          setReproduciendo(false);
        }
      }
      setSeleccionada(o.ventaId);
      if (tieneUbicacion(o)) despues(() => api.current?.volarA(o.ventaId, reducirMovimiento ? 0 : undefined));
      setListaAbierta(false);
    },
    [tv, vista, fechaHist, curva, reducirMovimiento],
  );

  const alSeleccionarEnMapa = useCallback(
    (id: number | null) => {
      setSeleccionada(id);
      if (id != null) api.current?.volarA(id, reducirMovimiento ? 0 : undefined);
    },
    [reducirMovimiento],
  );

  const irALaObra = useCallback(
    (o: ObraMapa) => api.current?.volarA(o.ventaId, reducirMovimiento ? 0 : undefined),
    [reducirMovimiento],
  );

  const alternarCategoria = useCallback(
    (c: CategoriaMapa) =>
      setOcultas((prev) => {
        const s = new Set(prev[vista]);
        if (s.has(c)) s.delete(c);
        else s.add(c);
        return { ...prev, [vista]: s };
      }),
    [vista],
  );

  // Esc: sale del modo TV o cierra la ficha (si no hay un diálogo abierto, como el visor).
  const salirTv = tv.salir;
  const tvActivo = tv.activo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tvActivo) salirTv();
      else if (!document.querySelector('[role="dialog"]')) setSeleccionada(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvActivo, salirTv]);

  // ---- margen de los paneles para la cámara ----
  const margen = useMemo(() => {
    if (tv.activo) return { top: 40, right: 40, bottom: 200, left: 40 };
    if (!escritorio) return { top: 140, right: 0, bottom: obraSel ? 320 : 110, left: 0 };
    return { top: 70, left: 384, right: obraSel ? 404 : 12, bottom: hist ? 92 : 12 };
  }, [tv.activo, escritorio, obraSel, hist]);

  const errorTexto = isError
    ? error instanceof Error
      ? error.message
      : "No se pudo leer el mapa"
    : data && !formatoNuevo
      ? "El servidor todavía devuelve el formato anterior del mapa."
      : null;

  return (
    <div
      ref={contenedor}
      className="relative isolate h-[calc(100vh-6rem)] overflow-hidden rounded-xl border shadow-sm"
      style={{ background: FONDO[temaMapa] }}
    >
      <CiudadArmadaMapa
        ref={api}
        obras={obrasMapa}
        seleccionada={seleccionada}
        onSeleccionar={alSeleccionarEnMapa}
        tema={temaMapa}
        plano={plano}
        margen={margen}
      />

      {/* Los paneles. pointer-events-none en el contenedor para que el mapa siga
          respondiendo entre panel y panel. */}
      <div className="dark pointer-events-none absolute inset-0 z-[3] text-foreground [&>*]:pointer-events-auto">
        {!tv.activo && (
          <>
            {/* Izquierda: contadores y lista. */}
            <div
              className={cn(
                "absolute left-3 top-3 flex w-[min(360px,calc(100%-24px))] flex-col gap-2 max-lg:right-3 max-lg:w-auto",
                "lg:bottom-3",
                hist && "lg:bottom-[92px]",
                // Celular: la lista es una hoja que se abre con el botón.
                listaAbierta && (hist ? "max-lg:bottom-[150px]" : "max-lg:bottom-[110px]"),
                "pointer-events-none! [&>*]:pointer-events-auto",
              )}
            >
              <PanelKpis
                datos={kpisVista}
                hoy={hoy}
                fecha={fechaHist}
                generado={generado}
                cargando={isLoading}
              />
              <ListaObras
                vista={vista}
                obras={obras}
                decisiones={decisiones}
                busqueda={busqueda}
                onBusqueda={setBusqueda}
                seleccionada={seleccionada}
                onElegir={elegir}
                className={cn("flex-1", !listaAbierta && "max-lg:hidden", obraSel && "max-lg:hidden")}
              />
            </div>

            {/* Centro: vista y leyenda (la leyenda sólo en pantallas anchas). */}
            <div
              className={cn(
                "absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2",
                "lg:top-3 lg:w-max lg:max-w-[calc(100%-820px)]",
                hist ? "max-lg:bottom-[92px]" : "max-lg:bottom-3",
                "pointer-events-none! [&>*]:pointer-events-auto",
              )}
            >
              <SelectorVista vista={vista} onCambiar={cambiarVista} />
              <Leyenda
                vista={vista}
                conteos={conteos}
                ocultas={ocultas[vista]}
                onAlternar={alternarCategoria}
                className="max-xl:hidden"
              />
            </div>

            {obraSel && (
              <FichaObra
                key={obraSel.ventaId}
                obra={obraSel}
                hoy={hoy}
                onCerrar={() => setSeleccionada(null)}
                onIrALaObra={irALaObra}
                className={cn(
                  "absolute right-3 top-[60px] w-[min(380px,calc(100%-24px))]",
                  hist ? "max-h-[calc(100%-160px)]" : "max-h-[calc(100%-72px)]",
                  "max-lg:inset-x-3 max-lg:bottom-3 max-lg:top-auto max-lg:z-10 max-lg:w-auto max-lg:max-h-[60%]",
                )}
              />
            )}

            {hist && (
              <LineaTiempo
                curva={curva}
                indice={indice}
                onIndice={(i) => {
                  setReproduciendo(false);
                  setIndice(i);
                }}
                reproduciendo={reproduciendo}
                onReproducir={() => {
                  if (reproduciendo) return setReproduciendo(false);
                  if (indice >= curva.length - 1) setIndice(0);
                  setReproduciendo(true);
                }}
                className="absolute inset-x-3 bottom-3"
              />
            )}

            {errorTexto && (
              <div className={cn(vidrio, "absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 px-4 py-3 text-center text-sm")}>
                {errorTexto}
              </div>
            )}
          </>
        )}

        {tv.activo && tv.paso != null && (
          <TarjetaTv
            paso={tv.paso}
            items={tvItems}
            resumen={kpisCalle}
            className="absolute bottom-10 left-7"
          />
        )}

        {/* En modo TV, tocar el mapa sale: una capa transparente toma el toque antes que el
            mapa (que si no, empezaría a arrastrarse). */}
        {tv.activo && (
          <div aria-hidden className="absolute inset-0 cursor-pointer" onPointerDown={() => tv.salir()} />
        )}

        <BarraBotones
          tema={temaMapa}
          plano={plano}
          tv={tv.activo}
          listaAbierta={listaAbierta}
          onTema={() => setTema((t) => (t === "noche" ? "dia" : "noche"))}
          onPlano={() => setPlano((p) => !p)}
          onGeneral={() => {
            setSeleccionada(null);
            api.current?.irAGeneral(reducirMovimiento ? 0 : undefined);
          }}
          onTv={() => (tv.activo ? tv.salir() : tv.empezar())}
          onLista={() => {
            setListaAbierta((a) => !a);
            setSeleccionada(null);
          }}
          className={cn(
            "absolute right-3 top-3 max-w-[420px]",
            !tv.activo && (hist ? "max-lg:bottom-[150px]" : "max-lg:bottom-[60px]"),
            !tv.activo && "max-lg:top-auto",
          )}
        />

      </div>
    </div>
  );
}
