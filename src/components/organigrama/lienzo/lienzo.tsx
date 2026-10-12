"use client";

// EL LIENZO VIVO (docs/organigrama/propuesta.md § 7). La propuesta 2 del organigrama: en vez de
// leer columnas, se agarra, se suelta, se cambia, y todo se acomoda solo con springs.
//
// Piezas:
//   - layout puro (lib/organigrama/layout.ts) → cada cambio recalcula posiciones y las tarjetas
//     y conectores viajan a su nuevo lugar. Dos formas, «Lista» y «Árbol» (selector en la barra,
//     recordado en localStorage; en el celular siempre lista): al cambiar, todo viaja a la forma
//     nueva y después encuadra;
//   - encuadres (todo, foco, recorrido, papel) dentro del área que NO tapan los paneles
//     flotantes, medidos en el momento (`data-panel`, `areaLibre`);
//   - cámara (camara.ts) con paneo, zoom hacia el cursor, pinch, vuelos y minimapa;
//   - arrastre (arrastre.tsx) para herramientas, personas y puestos, con vista previa (las demás
//     cajas hacen lugar) y rebote si no se puede;
//   - modos didácticos (didactico.tsx): «Conocé ABA» y «Seguí el papel»;
//   - jerarquía: tarjetas de tamaño y estilo por clase (Dirección, área, subárea, puesto) y los
//     GRUPOS de cada área (grupos.tsx): recuadros anidados en el árbol, franja en la lista;
//   - vacantes calmas: el tratamiento fuerte solo para búsquedas abiertas o con «Resaltar
//     vacantes» (contador de la barra, tecla V);
//   - renombrar en línea: doble clic en el título o el rol, F2, o «Renombrar» en la ficha.
//
// ESTADO: el mismo proveedor que el mapa. La estructura va al BORRADOR (si el editor todavía no
// estaba en el borrador, entra solo al primer cambio) y la ocupación es inmediata. Deshacer y
// rehacer guardan fotos de las dos cosas (acción «restaurar» del proveedor) y viven mientras el
// lienzo esté abierto.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { toast } from "sonner";
import {
  ancestros,
  areaDe,
  cargaPorPersona,
  descendientes,
  eliminar,
  estadoPuesto,
  hijos,
  marcasDeCambio,
  mover,
  nodoDe,
  nombreCompleto,
  ocupantesVigentes,
  personaDe,
  puestosDePersona,
  raiz,
} from "@/lib/organigrama/arbol";
import { CIRCUITOS } from "@/lib/organigrama/circuitos";
import { hoyBA } from "@/lib/organigrama/datos";
import {
  areaLibre,
  calcularLayout,
  claseCaja,
  desplazamientoAncla,
  desplazar,
  encuadrar,
  limitesDe,
  limitesDeRama,
  rutaEntre,
  centrar,
  type Caja,
  type FormaLayout,
  type Layout,
  type Limites,
  type PanelFlotante,
  type Punto,
} from "@/lib/organigrama/layout";
import {
  cambiarRol,
  crearDesdeHerramienta,
  deshacer as deshacerH,
  destinoValidoHerramienta,
  destinoValidoNodo,
  destinoValidoPersona,
  eliminarRama,
  esBusquedaAbierta,
  esCajaExterna,
  estadisticaRama,
  hayQuePreguntar,
  historialVacio,
  nodoDeHerramienta,
  quitarOcupante,
  registrar,
  rehacer as rehacerH,
  renombrar,
  resumen as calcularResumen,
  ubicarPersona,
  type Herramienta,
} from "@/lib/organigrama/lienzo";
import type { ColorArea, Nodo, Ocupante } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { useOrg, type FotoOrg } from "../proveedor";
import { CapaFantasma, ProveedorArrastre, useArrastre, type Carga, type Destino, type Manejador, type Resultado } from "./arrastre";
import { BarraLienzo } from "./barra";
import { useCamara, useGestosCamara } from "./camara";
import {
  AccionesCtx,
  EVENTO_RENOMBRAR,
  RESORTE,
  esCampoDeTexto,
  varsArea,
  type AccionesLienzo,
  type CampoEditable,
  type EstadoDestino,
  type PersonaEnNodo,
  type Salida,
  type VistaNodo,
} from "./comun";
import { Conectores } from "./conectores";
import { DialogoTacho, DialogoUbicar } from "./dialogos-lienzo";
import { Papelito, TarjetaPapel, TarjetaRecorrido, type PasoRecorrido } from "./didactico";
import { Grupos } from "./grupos";
import { CajaHerramientas } from "./herramientas";
import { Banco } from "./banco";
import { ControlesZoom, Minimapa } from "./navegacion";
import { AvisoSeleccion, Celebracion, DialogoAtajos, Fantasma, Tacho } from "./piezas";
import { Tarjeta, type ModoTarjeta } from "./tarjeta";

const FANTASMA = "__fantasma__";
const VACIO: ReadonlySet<string> = new Set();
/** Por debajo de este zoom las tarjetas se simplifican (zoom semántico). */
const ZOOM_SIMPLE = 0.5;
/** Debajo de este ancho del lienzo (celular) se fuerza la lista y no se ofrece el árbol. */
const ANCHO_ANGOSTO = 768;
const CLAVE_FORMA = "organigrama.lienzo.forma";
/** Lo que tarda el viaje de las cajas entre Lista y Árbol antes de encuadrar. */
const ESPERA_ENCUADRE_FORMA = 520;

// La forma elegida vive en localStorage, leída con useSyncExternalStore: sin desajuste de
// hidratación si alguna vez se renderiza en el servidor (ahí vale «arbol») y sin parpadeo en el
// navegador. localStorage puede no estar o tirar (modo privado, bloqueado): entonces la elección
// vale en memoria mientras la página esté abierta.
let formaEnMemoria: FormaLayout | null = null;
const oyentesForma = new Set<() => void>();

function leerForma(): FormaLayout {
  if (formaEnMemoria) return formaEnMemoria;
  try {
    return window.localStorage.getItem(CLAVE_FORMA) === "lista" ? "lista" : "arbol";
  } catch {
    return "arbol";
  }
}

function guardarForma(f: FormaLayout) {
  formaEnMemoria = f;
  try {
    window.localStorage.setItem(CLAVE_FORMA, f);
  } catch {
    // Queda en memoria.
  }
  oyentesForma.forEach((o) => o());
}

function suscribirForma(cambio: () => void) {
  // Otra pestaña la cambió: manda lo guardado.
  const otraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_FORMA) return;
    formaEnMemoria = null;
    cambio();
  };
  oyentesForma.add(cambio);
  window.addEventListener("storage", otraPestana);
  return () => {
    oyentesForma.delete(cambio);
    window.removeEventListener("storage", otraPestana);
  };
}

const sinSuscripcion = () => () => {};

/**
 * Los paneles flotantes (`data-panel="arriba|abajo|izquierda|derecha"`) en coordenadas del
 * lienzo. Con offsets (no getBoundingClientRect): las animaciones de entrada (transform) no
 * corren la medida.
 */
function medirPaneles(raiz: HTMLElement | null): PanelFlotante[] {
  if (!raiz) return [];
  return [...raiz.querySelectorAll<HTMLElement>("[data-panel]")].map((el) => {
    let x = 0;
    let y = 0;
    let n: HTMLElement | null = el;
    while (n && n !== raiz) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent as HTMLElement | null;
    }
    return { lado: el.dataset.panel as PanelFlotante["lado"], x, y, w: el.offsetWidth, h: el.offsetHeight };
  });
}

type Pregunta = { tipo: "ubicar"; persona: string; nodo: string; desdeOcupante?: string } | { tipo: "tacho"; clave: string } | null;
type Seleccion = { tipo: "herramienta"; herramienta: Herramienta } | { tipo: "persona"; persona: string } | null;
type EstadoPapel = { circuito: string; paso: number; desde: number | null; reproduciendo: boolean } | null;
/** Edición en línea. `nuevo`: el nodo recién creado (su primer nombre no suma otro paso al historial). */
type Edicion = { clave: string; campo: CampoEditable; nuevo: boolean } | null;

export function Lienzo() {
  const manejador = useRef<Manejador | null>(null);
  // reducedMotion="user": con «reducir movimiento» las cajas y conectores cambian de lugar sin
  // viajar (solo fundidos); la cámara salta y el papel no vuela.
  return (
    <MotionConfig reducedMotion="user">
      <ProveedorArrastre manejador={manejador}>
        <Escena manejador={manejador} />
      </ProveedorArrastre>
    </MotionConfig>
  );
}

/** Retrasos de la entrada inicial: de arriba hacia abajo, en cascada. */
function retrasosIniciales(nodos: Nodo[]): Record<string, number> {
  const fuera: Record<string, number> = {};
  const r = raiz(nodos);
  if (!r) return fuera;
  fuera[r.clave] = 0;
  hijos(nodos, r.clave).forEach((a, i) => {
    fuera[a.clave] = 0.12 + i * 0.05;
    descendientes(nodos, a.clave).forEach((d, j) => (fuera[d.clave] = 0.3 + i * 0.05 + j * 0.03));
  });
  return fuera;
}

function centroDe(c: Caja): Punto {
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}

/** El fondo de puntos se mueve y escala con la cámara (da sensación de superficie). */
function Fondo({ x, y, k }: { x: MotionValue<number>; y: MotionValue<number>; k: MotionValue<number> }) {
  const tam = useTransform(k, (v) => `${Math.max(8, 24 * v)}px ${Math.max(8, 24 * v)}px`);
  const pos = useMotionTemplate`${x}px ${y}px`;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--border)_1.2px,transparent_1.2px)]"
      style={{ backgroundSize: tam, backgroundPosition: pos }}
    />
  );
}

function TarjetaFantasma({ caja, titulo, color, tipo }: { caja: Caja; titulo: string; color: ColorArea; tipo: Nodo["tipo"] }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0"
      style={{ width: caja.w, height: caja.h, ...varsArea(color) }}
      initial={{ x: caja.x, y: caja.y - 12, opacity: 0, scale: 0.9 }}
      animate={{ x: caja.x, y: caja.y, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={RESORTE}
    >
      <div className="flex h-full flex-col justify-center rounded-lg border-2 border-dashed border-foreground/50 bg-card/60 pr-3 pl-4">
        <p className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{tipo === "area" ? "Área" : "Puesto"} · va acá</p>
        <p className="truncate text-[13.5px] font-semibold">{titulo}</p>
      </div>
    </motion.div>
  );
}

function Escena({ manejador }: { manejador: React.RefObject<Manejador | null> }) {
  const { datos, estado, dispatch, puedeEditar, enBorrador, cambios, usuario, abrir } = useOrg();
  const { carga: cargaCruda, destino, volviendo, gesto } = useArrastre();
  const carga = volviendo ? null : cargaCruda;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const foco = params.get("puesto");
  const personaFoco = params.get("persona");
  const reducido = useReducedMotion();
  const nodos = datos.nodos;

  // ── Tamaño y cámara ──────────────────────────────────────────────────────────
  const contRef = useRef<HTMLDivElement>(null);
  const tachoRef = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cam = useCamara(tam);
  const { onPointerDown } = useGestosCamara(contRef, cam);
  const [simple, setSimple] = useState(false);
  useMotionValueEvent(cam.k, "change", (k) => setSimple(k < ZOOM_SIMPLE));

  // ── Forma: Lista / Árbol ─────────────────────────────────────────────────────
  // En el celular, siempre lista (y no se ofrece el selector); hasta medir el lienzo, se adivina
  // por el ancho de la ventana.
  const forma = useSyncExternalStore<FormaLayout>(suscribirForma, leerForma, () => "arbol");
  const angostoInicial = useSyncExternalStore(sinSuscripcion, () => window.innerWidth < ANCHO_ANGOSTO, () => false);
  const angosto = tam.w ? tam.w < ANCHO_ANGOSTO : angostoInicial;
  const formaEf: FormaLayout = angosto ? "lista" : forma;
  const cambiarForma = guardarForma;

  // ── Estado del lienzo ────────────────────────────────────────────────────────
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(VACIO);
  const [hist, setHist] = useState(historialVacio<FotoOrg>);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [resaltarVacantes, setResaltarVacantes] = useState(false);
  const [pregunta, setPregunta] = useState<Pregunta>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [recorrido, setRecorrido] = useState<number | null>(null);
  const [papel, setPapel] = useState<EstadoPapel>(null);
  const [atajos, setAtajos] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [celebraciones, setCelebraciones] = useState<{ id: number; clave: string }[]>([]);
  const [salida, setSalida] = useState<Salida>(null);
  const [retrasos, setRetrasos] = useState<Record<string, number>>(() => retrasosIniciales(datos.nodos));
  useEffect(() => {
    if (!Object.keys(retrasos).length) return;
    const t = window.setTimeout(() => setRetrasos({}), 1400);
    return () => window.clearTimeout(t);
  }, [retrasos]);

  const didactico = recorrido !== null || papel !== null;

  // ── Pantalla completa ────────────────────────────────────────────────────────
  // El lienzo tapa la app (fixed) y además se pide pantalla completa al navegador sobre todo el
  // documento, así las hojas y diálogos (que van en portales del body) se siguen viendo. Donde el
  // navegador no lo permite (iPhone), queda igual tapando la app.
  const alternarCompleta = useCallback(() => {
    setCompleta((c) => {
      if (!c) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return !c;
    });
  }, []);
  useEffect(() => {
    const h = () => {
      if (!document.fullscreenElement) setCompleta(false);
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const colapsadosEf = didactico ? VACIO : colapsados;

  // ── Layout (con vista previa del lugar donde caería lo que se arrastra) ──────
  const base = useMemo(() => calcularLayout(nodos, { colapsados: colapsadosEf, forma: formaEf }), [nodos, colapsadosEf, formaEf]);

  const validar = useCallback(
    (c: Carga, d: Destino): boolean => {
      if (!d) return false;
      if (c.tipo === "nodo") return d.tipo === "tacho" ? !!nodoDe(nodos, c.clave)?.dependeDe : d.tipo === "nodo" && destinoValidoNodo(nodos, c.clave, d.clave);
      if (c.tipo === "herramienta") return d.tipo === "nodo" && destinoValidoHerramienta(nodos, c.herramienta, d.clave);
      if (d.tipo === "banco") return !!c.desdeOcupante;
      return d.tipo === "nodo" && destinoValidoPersona(datos, c.persona, d.clave);
    },
    [nodos, datos],
  );
  const destinoValido = carga ? validar(carga, destino) : false;

  const padreFantasma =
    carga && destinoValido && destino?.tipo === "nodo" && (carga.tipo === "herramienta" || carga.tipo === "nodo") ? destino.clave : null;
  const nodoFantasma = useMemo<Nodo | null>(() => {
    if (!padreFantasma || !carga) return null;
    if (carga.tipo === "herramienta") return { ...nodoDeHerramienta(nodos, carga.herramienta, padreFantasma), clave: FANTASMA };
    if (carga.tipo === "nodo") {
      const n = nodoDe(nodos, carga.clave);
      return n ? { ...n, clave: FANTASMA, dependeDe: padreFantasma, orden: Number.MAX_SAFE_INTEGER } : null;
    }
    return null;
  }, [padreFantasma, carga, nodos]);

  const layout = useMemo<Layout>(() => {
    if (!nodoFantasma?.dependeDe) return base;
    const col = new Set(colapsadosEf);
    col.delete(nodoFantasma.dependeDe);
    const con = calcularLayout([...nodos, nodoFantasma], { colapsados: col, forma: formaEf });
    const d = desplazamientoAncla(base, con, nodoFantasma.dependeDe);
    return desplazar(con, d.x, d.y);
  }, [base, nodoFantasma, nodos, colapsadosEf, formaEf]);

  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Al confirmar un cambio, la cámara compensa el corrimiento del destino: lo que soltaste no
  // se escapa de debajo del puntero.
  const anclaRef = useRef<{ clave: string; antes: Caja } | null>(null);
  useLayoutEffect(() => {
    const a = anclaRef.current;
    if (!a) return;
    anclaRef.current = null;
    const nueva = base.cajas[a.clave];
    if (!nueva) return;
    const dx = a.antes.x - nueva.x;
    const dy = a.antes.y - nueva.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const c = cam.actual();
    cam.ir({ k: c.k, x: c.x + dx * c.k, y: c.y + dy * c.k }, { suave: false });
  }, [base, cam]);

  // ── Área útil de la pantalla (lo que no tapan los paneles) ───────────────────
  // Se MIDE en el momento de encuadrar: la barra de arriba (que en angosto ocupa dos filas), el
  // banco de abajo (abierto o cerrado), la caja de herramientas, el minimapa y el zoom, y en los
  // modos didácticos la tarjeta del recorrido o del papel. Con `lim` (lo que se va a encuadrar)
  // elige, entre los huecos que dejan los paneles, el que lo muestra más grande. `extra` suma
  // paneles que no están en el lienzo (la hoja lateral del foco).
  const areaUtil = useCallback(
    (lim?: Limites, extra: PanelFlotante[] = []) =>
      areaLibre(
        tam.w,
        tam.h,
        [...medirPaneles(contRef.current), ...extra],
        12,
        160,
        lim ? { w: lim.maxX - lim.minX, h: lim.maxY - lim.minY } : undefined,
      ),
    [tam.w, tam.h],
  );

  const encuadrarTodo = useCallback(
    (animar = true) => {
      const lim = layoutRef.current.limites;
      cam.ir(encuadrar(lim, areaUtil(lim), 24, 1), { animar });
    },
    [cam, areaUtil],
  );

  // Primer encuadre, apenas se conoce el tamaño. Si para que entre todo hubiera que alejar
  // tanto que no se lee, arranca legible y alineado arriba (la Dirección y las áreas a la vista).
  const encuadrado = useRef(false);
  useEffect(() => {
    if (encuadrado.current || !tam.w) return;
    encuadrado.current = true;
    const lim = layoutRef.current.limites;
    // En el celular arranca legible y alineado arriba: se usa el hueco central, no el más grande.
    const area = areaUtil(angosto ? undefined : lim);
    const todo = encuadrar(lim, area, 24, 1);
    const k = angosto ? Math.max(todo.k, 0.55) : Math.max(todo.k, Math.min(0.62, area.w / Math.max(1, lim.maxX - lim.minX)));
    if (k === todo.k) return cam.ir(todo, { animar: false });
    const cx = (lim.minX + lim.maxX) / 2;
    cam.ir({ k, x: area.x + area.w / 2 - cx * k, y: area.y + 12 - lim.minY * k }, { animar: false });
  }, [tam.w, areaUtil, cam, angosto]);

  // ── Historial ────────────────────────────────────────────────────────────────
  const foto = useCallback(
    (): FotoOrg => ({ borrador: estado.borrador, borradorMeta: estado.borradorMeta, editando: estado.editando, ocupantes: estado.ocupantes }),
    [estado.borrador, estado.borradorMeta, estado.editando, estado.ocupantes],
  );
  const autor = usuario ? nombreCompleto(usuario) : "Editor";

  const estructura = useCallback(
    (f: (n: Nodo[]) => Nodo[]): boolean => {
      let nuevos: Nodo[];
      try {
        nuevos = f(estado.borrador ?? estado.vigente);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo");
        return false;
      }
      setHist((h) => registrar(h, foto()));
      if (!enBorrador) {
        dispatch({ tipo: "entrar", autor });
        toast("Estás editando el borrador", { description: "Nada cambia para los demás hasta que publiques una versión." });
      }
      dispatch({ tipo: "estructura", nodos: nuevos });
      return true;
    },
    [estado.borrador, estado.vigente, foto, enBorrador, dispatch, autor],
  );

  const ocupacion = useCallback(
    (f: (o: Ocupante[]) => Ocupante[]) => {
      setHist((h) => registrar(h, foto()));
      dispatch({ tipo: "restaurar", foto: { ...foto(), ocupantes: f(estado.ocupantes) } });
    },
    [foto, dispatch, estado.ocupantes],
  );

  const deshacer = useCallback(() => {
    const r = deshacerH(hist, foto());
    if (!r) return;
    setHist(r.historial);
    dispatch({ tipo: "restaurar", foto: r.foto });
  }, [hist, foto, dispatch]);
  const rehacer = useCallback(() => {
    const r = rehacerH(hist, foto());
    if (!r) return;
    setHist(r.historial);
    dispatch({ tipo: "restaurar", foto: r.foto });
  }, [hist, foto, dispatch]);
  // El «Deshacer» de los toasts se ejecuta más tarde: tiene que usar el historial de ese momento.
  const deshacerRef = useRef(deshacer);
  useEffect(() => {
    deshacerRef.current = deshacer;
  }, [deshacer]);
  const accionDeshacer = useMemo(() => ({ label: "Deshacer", onClick: () => deshacerRef.current() }), []);

  // ── Acciones ─────────────────────────────────────────────────────────────────
  const expandir = useCallback((clave: string) => {
    setColapsados((prev) => {
      if (!prev.has(clave)) return prev;
      const s = new Set(prev);
      s.delete(clave);
      return s;
    });
  }, []);

  const celebrar = useCallback((clave: string) => {
    const id = Date.now() + Math.random();
    setCelebraciones((c) => [...c, { id, clave }]);
    window.setTimeout(() => setCelebraciones((c) => c.filter((x) => x.id !== id)), 1300);
  }, []);

  const anclar = useCallback((clave: string) => {
    const c = layoutRef.current.cajas[clave];
    anclaRef.current = c ? { clave, antes: c } : null;
  }, []);

  const crearCon = useCallback(
    (h: Herramienta, padre: string) => {
      let clave = "";
      anclar(padre);
      const ok = estructura((n) => {
        const r = crearDesdeHerramienta(n, h, padre);
        clave = r.clave;
        return r.nodos;
      });
      if (!ok) return;
      expandir(padre);
      setEdicion({ clave, campo: "titulo", nuevo: true });
    },
    [anclar, estructura, expandir],
  );

  const hacerUbicar = useCallback(
    (persona: string, nodo: string, modo: "reemplazar" | "compartir" | "interino", desdeOcupante?: string) => {
      const eraVacante = estadoPuesto(datos, nodo).vacante;
      ocupacion((o) => ubicarPersona(o, { nodo, persona, modo, desdeOcupante, id: crypto.randomUUID(), hoy: hoyBA() }));
      if (eraVacante && modo !== "interino") celebrar(nodo);
      const p = personaDe(datos.personas, persona);
      const n = nodoDe(nodos, nodo);
      toast(`${p ? nombreCompleto(p) : "La persona"} quedó en ${n?.titulo ?? "el puesto"}${modo === "interino" ? " (interino)" : ""}`, {
        action: accionDeshacer,
      });
    },
    [datos, nodos, ocupacion, celebrar, accionDeshacer],
  );

  const ubicarCon = useCallback(
    (persona: string, nodo: string, desdeOcupante?: string) => {
      if (hayQuePreguntar(datos, nodo, desdeOcupante)) setPregunta({ tipo: "ubicar", persona, nodo, desdeOcupante });
      else hacerUbicar(persona, nodo, "compartir", desdeOcupante);
    },
    [datos, hacerUbicar],
  );

  const puntoTacho = useRef<Punto | null>(null);
  const aMundo = useCallback(
    (sx: number, sy: number): Punto => {
      const r = contRef.current?.getBoundingClientRect();
      const c = cam.actual();
      return { x: (sx - (r?.left ?? 0) - c.x) / c.k, y: (sy - (r?.top ?? 0) - c.y) / c.k };
    },
    [cam],
  );

  const eliminarYa = useCallback(
    (clave: string, modo: "solo" | "subir" | "rama") => {
      const n = nodoDe(nodos, clave);
      if (!n) return;
      const claves = new Set(modo === "rama" ? [clave, ...descendientes(nodos, clave).map((d) => d.clave)] : [clave]);
      const a = puntoTacho.current ?? centroDe(layoutRef.current.cajas[clave] ?? { x: 0, y: 0, w: 0, h: 0 });
      setSalida({ claves, a, modo: "tacho" });
      const ok = estructura((ns) => (modo === "rama" ? eliminarRama(ns, clave) : eliminar(ns, clave, true)));
      if (ok) {
        const padre = nodoDe(nodos, n.dependeDe);
        toast(
          modo === "rama"
            ? `Eliminaste ${n.titulo} y ${claves.size - 1} puestos de abajo`
            : modo === "subir"
              ? `Eliminaste ${n.titulo}; sus puestos ahora dependen de ${padre?.titulo}`
              : `Eliminaste ${n.titulo}`,
          { action: accionDeshacer },
        );
      }
    },
    [nodos, estructura, accionDeshacer],
  );

  const pedirEliminar = useCallback(
    (clave: string) => {
      if (hijos(nodos, clave).length) setPregunta({ tipo: "tacho", clave });
      else eliminarYa(clave, "solo");
    },
    [nodos, eliminarYa],
  );

  const soltar = useCallback(
    (c: Carga, d: Destino, valido: boolean): Resultado => {
      if (c.tipo === "herramienta") {
        if (!valido || d?.tipo !== "nodo") return { tipo: "rebote" };
        crearCon(c.herramienta, d.clave);
        return { tipo: "ok" };
      }
      if (c.tipo === "nodo") {
        if (d?.tipo === "tacho" && valido) {
          const r = tachoRef.current?.getBoundingClientRect();
          puntoTacho.current = r ? aMundo(r.left + r.width / 2, r.top + r.height / 2) : null;
          pedirEliminar(c.clave);
          return { tipo: "ok" };
        }
        if (!valido || d?.tipo !== "nodo") return { tipo: "rebote" };
        anclar(d.clave);
        if (estructura((n) => mover(n, c.clave, d.clave))) {
          expandir(d.clave);
          const n = nodoDe(nodos, c.clave);
          const p = nodoDe(nodos, d.clave);
          toast(`${n?.titulo} ahora depende de ${p?.titulo}`, { action: accionDeshacer });
        }
        return { tipo: "ok" };
      }
      if (d?.tipo === "nodo" && valido) {
        ubicarCon(c.persona, d.clave, c.desdeOcupante);
        return { tipo: "ok" };
      }
      if (c.desdeOcupante && (!d || d.tipo === "banco")) {
        const p = personaDe(datos.personas, c.persona);
        const n = nodoDe(nodos, c.desdeNodo);
        ocupacion((o) => quitarOcupante(o, c.desdeOcupante!, hoyBA()));
        toast(`${p ? nombreCompleto(p) : "La persona"} dejó ${n?.titulo ?? "el puesto"}`, { action: accionDeshacer });
        const b = document.querySelector('[data-destino="banco"]')?.getBoundingClientRect();
        return b ? { tipo: "volar", a: { x: b.left + b.width / 2, y: b.top + 24 } } : { tipo: "ok" };
      }
      return { tipo: "rebote" };
    },
    [crearCon, aMundo, pedirEliminar, anclar, estructura, expandir, nodos, accionDeshacer, ubicarCon, datos.personas, ocupacion],
  );

  useEffect(() => {
    manejador.current = { validar, onSoltar: soltar };
  }, [manejador, validar, soltar]);

  // ── Foco (clic en un puesto → la cámara vuela, la cadena de mando se resalta, ficha) ──
  const irA = useCallback(
    (q: string) => {
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const aplicarSeleccion = useCallback(
    (clave: string): boolean => {
      if (!seleccion) return false;
      const c: Carga = seleccion.tipo === "herramienta" ? { tipo: "herramienta", herramienta: seleccion.herramienta } : { tipo: "persona", persona: seleccion.persona };
      if (!validar(c, { tipo: "nodo", clave })) {
        toast("Ahí no se puede", { description: seleccion.tipo === "herramienta" ? "Un área nueva va debajo de la Dirección." : "Ya está en ese puesto o el puesto sale de las cuadrillas." });
        return true;
      }
      if (c.tipo === "herramienta") crearCon(c.herramienta, clave);
      else if (c.tipo === "persona") ubicarCon(c.persona, clave);
      setSeleccion(null);
      return true;
    },
    [seleccion, validar, crearCon, ubicarCon],
  );

  const acciones = useMemo<AccionesLienzo>(
    () => ({
      alClic: (clave) => {
        if (aplicarSeleccion(clave)) return;
        expandir(clave);
        irA(`puesto=${encodeURIComponent(clave)}`);
      },
      alternar: (clave) => {
        const caja = layoutRef.current.cajas[clave];
        const debajo = descendientes(nodos, clave);
        if (colapsados.has(clave)) {
          const r: Record<string, number> = {};
          debajo.forEach((d, i) => (r[d.clave] = Math.min(0.6, i * 0.035)));
          setRetrasos(r);
        } else if (caja) {
          setSalida({ claves: new Set(debajo.map((d) => d.clave)), a: centroDe(caja), modo: "colapsar" });
        }
        setColapsados((prev) => {
          const s = new Set(prev);
          if (s.has(clave)) s.delete(clave);
          else s.add(clave);
          return s;
        });
      },
      editar: (clave, campo) => {
        if (!puedeEditar || didactico) return;
        setEdicion({ clave, campo, nuevo: false });
      },
      guardarEdicion: (clave, campo, valor) => {
        const actuales = estado.borrador ?? estado.vigente;
        const actual = nodoDe(actuales, clave);
        if (!actual) return;
        const v = valor.trim();
        if (campo === "titulo" ? !v || v === actual.titulo : v === (actual.rol ?? "")) return;
        const cambiar = (n: Nodo[]) => (campo === "titulo" ? renombrar(n, clave, v) : cambiarRol(n, clave, v));
        // Nombrar lo que se acaba de crear es parte del mismo paso: no suma al historial.
        if (edicion?.clave === clave && edicion.nuevo) dispatch({ tipo: "estructura", nodos: cambiar(actuales) });
        // Renombrar algo que ya estaba es un cambio de estructura más: borrador (se abre solo) y deshacer.
        else estructura(cambiar);
      },
      terminarEdicion: () => setEdicion(null),
      abrirPersona: (id) => irA(`persona=${encodeURIComponent(id)}`),
    }),
    [aplicarSeleccion, expandir, irA, nodos, colapsados, estado.borrador, estado.vigente, dispatch, estructura, edicion, puedeEditar, didactico],
  );

  useEffect(() => {
    if ((!foco && !personaFoco) || didactico || !tam.w) return;
    const l = layoutRef.current;
    // Lo que se encuadra: la cadena de mando del puesto, o los puestos de la persona con la suya.
    const base = foco ? [foco] : puestosDePersona(datos, personaFoco!).map((p) => p.nodo.clave);
    const claves = base.flatMap((k) => [k, ...ancestros(nodos, k).map((a) => a.clave)]);
    const cajas = claves.map((k) => l.cajas[k]).filter(Boolean);
    const el = contRef.current;
    if (!cajas.length || !el) return;
    const principal = l.cajas[base[0]] ?? cajas[0];
    const r = el.getBoundingClientRect();
    // La hoja lateral tapa la derecha (560 px) en escritorio: se encuadra en lo que queda.
    const bordeHoja = window.innerWidth >= 640 ? window.innerWidth - Math.min(560, window.innerWidth) : window.innerWidth;
    const visible = Math.min(r.right, bordeHoja) - r.left;
    if (visible < 260) {
      // Celular: la hoja tapa todo; se centra el puesto para cuando se cierre.
      cam.ir(centrar(centroDe(principal), { x: tam.w / 2, y: tam.h * 0.4 }, Math.max(cam.k.get(), 0.8)));
      return;
    }
    // La hoja cuenta como un panel más a la derecha, además de la barra, el banco y la caja.
    const hoja: PanelFlotante[] = visible < r.width ? [{ lado: "derecha", x: visible, y: 0, w: r.width - visible, h: tam.h }] : [];
    const area = areaUtil(limitesDe(cajas), hoja);
    const cad = encuadrar(limitesDe(cajas), area, 24, 1);
    if (cad.k >= 0.45) cam.ir(cad);
    else cam.ir(centrar(centroDe(principal), { x: area.x + area.w / 2, y: area.y + Math.min(area.h * 0.42, 220) }, 0.85));
    // Solo cuando cambia el foco (no en cada cambio de layout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco, personaFoco]);

  // ── Recorrido «Conocé ABA» ───────────────────────────────────────────────────
  const pasosRecorrido = useMemo<PasoRecorrido[]>(() => {
    const r = raiz(nodos);
    const areas = r ? hijos(nodos, r.clave).filter((n) => n.tipo !== "puesto") : [];
    return [{ tipo: "intro" }, ...areas.map((nodo) => ({ tipo: "area" as const, nodo, rama: estadisticaRama(datos, nodo.clave) })), { tipo: "fin" }];
  }, [nodos, datos]);

  const irPasoRecorrido = useCallback((i: number) => setRecorrido(Math.max(0, Math.min(pasosRecorrido.length - 1, i))), [pasosRecorrido.length]);

  useEffect(() => {
    if (recorrido === null) return;
    const p = pasosRecorrido[recorrido];
    if (!p) return;
    const l = layoutRef.current;
    const lim = p.tipo === "area" ? limitesDeRama(l, nodos, p.nodo.clave) : l.limites;
    cam.ir(encuadrar(lim, areaUtil(lim), 30, p.tipo === "area" ? 1.05 : 1));
  }, [recorrido, pasosRecorrido, nodos, cam, areaUtil]);

  // ── Seguí el papel ───────────────────────────────────────────────────────────
  const circuito = papel ? CIRCUITOS.find((c) => c.id === papel.circuito) : undefined;
  const papelX = useMotionValue(0);
  const papelY = useMotionValue(0);
  const rotPapel = useMotionValue(0);

  const esquina = useCallback((clave: string): Punto | null => {
    const c = layoutRef.current.cajas[clave];
    return c ? { x: c.x + c.w - 14, y: c.y + 6 } : null;
  }, []);

  const rutaPapel = useMemo(() => {
    if (!papel || !circuito || papel.desde === null) return null;
    const a = circuito.paradas[papel.desde]?.nodo;
    const b = circuito.paradas[papel.paso]?.nodo;
    if (!a || !b || !layout.cajas[a] || !layout.cajas[b]) return null;
    const ini = { x: layout.cajas[a].x + layout.cajas[a].w - 14, y: layout.cajas[a].y + 6 };
    const fin = { x: layout.cajas[b].x + layout.cajas[b].w - 14, y: layout.cajas[b].y + 6 };
    const medio = a === b ? [] : rutaEntre(layout, nodos, a, b);
    return [ini, ...medio, fin];
  }, [papel, circuito, layout, nodos]);

  const duracionRuta = useMemo(() => {
    if (!rutaPapel) return 0;
    let largo = 0;
    for (let i = 1; i < rutaPapel.length; i++) largo += Math.hypot(rutaPapel[i].x - rutaPapel[i - 1].x, rutaPapel[i].y - rutaPapel[i - 1].y);
    return Math.min(2.6, Math.max(0.5, largo / 650));
  }, [rutaPapel]);

  useEffect(() => {
    if (!papel || !circuito) return;
    const parada = circuito.paradas[papel.paso];
    const destinoP = esquina(parada.nodo);
    if (!destinoP) return;
    const l = layoutRef.current;
    const ruta = rutaPapel ?? [destinoP];
    const claves = [parada.nodo, papel.desde !== null ? circuito.paradas[papel.desde].nodo : parada.nodo];
    const lim = limitesDe([...claves.map((k) => l.cajas[k]).filter(Boolean), ...ruta.map((p) => ({ x: p.x - 20, y: p.y - 20, w: 40, h: 40 }))]);
    cam.ir(encuadrar(lim, areaUtil(lim), 50, 1.05));
    if (reducido || ruta.length < 2) {
      papelX.set(destinoP.x);
      papelY.set(destinoP.y);
      return;
    }
    const opciones = { duration: duracionRuta, ease: "easeInOut" as const };
    const a = animate(papelX, ruta.map((p) => p.x), opciones);
    const b = animate(papelY, ruta.map((p) => p.y), opciones);
    const c = animate(rotPapel, [0, -10, 8, -6, 0], { duration: duracionRuta });
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [papel, circuito, rutaPapel, duracionRuta, esquina, cam, areaUtil, reducido, papelX, papelY, rotPapel]);

  const irPasoPapel = useCallback(
    (i: number) =>
      setPapel((p) => {
        if (!p) return p;
        const c = CIRCUITOS.find((x) => x.id === p.circuito);
        if (!c) return p;
        const paso = Math.max(0, Math.min(c.paradas.length - 1, i));
        return paso === p.paso ? p : { ...p, paso, desde: p.paso };
      }),
    [],
  );

  useEffect(() => {
    if (!papel?.reproduciendo || !circuito) return;
    const t = window.setTimeout(() => {
      if (papel.paso >= circuito.paradas.length - 1) setPapel((p) => (p ? { ...p, reproduciendo: false } : p));
      else irPasoPapel(papel.paso + 1);
    }, 3600 + duracionRuta * 1000);
    return () => window.clearTimeout(t);
  }, [papel, circuito, irPasoPapel, duracionRuta]);

  const empezarPapel = useCallback(
    (id: string) => {
      setRecorrido(null);
      setSeleccion(null);
      irA("");
      const c = CIRCUITOS.find((x) => x.id === id);
      const p = c && esquina(c.paradas[0].nodo);
      if (p) {
        papelX.set(p.x);
        papelY.set(p.y);
      }
      setPapel({ circuito: id, paso: 0, desde: null, reproduciendo: true });
    },
    [irA, esquina, papelX, papelY],
  );

  const salirDidactico = useCallback(() => {
    setRecorrido(null);
    setPapel(null);
    window.setTimeout(() => encuadrarTodo(), 50);
  }, [encuadrarTodo]);

  // Al entrar o salir de pantalla completa cambia el tamaño: se vuelve a encuadrar.
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    const t = window.setTimeout(() => encuadrarTodo(), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el modo
  }, [completa]);

  // Al cambiar entre Lista y Árbol, las cajas y los conectores viajan con su spring a la forma
  // nueva (se ve la transformación) y, cuando llegan, la cámara encuadra.
  const formaVista = useRef<FormaLayout | null>(null);
  useEffect(() => {
    if (!tam.w) return;
    const antes = formaVista.current;
    formaVista.current = formaEf;
    if (!antes || antes === formaEf || didactico) return;
    const t = window.setTimeout(() => encuadrarTodo(), reducido ? 0 : ESPERA_ENCUADRE_FORMA);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar la forma
  }, [formaEf, tam.w]);

  // «Renombrar» desde la ficha (en el celular no hay doble clic ni F2): la ficha se cierra y la
  // tarjeta queda editándose; si estaba dentro de algo colapsado, se abre.
  useEffect(() => {
    const h = (e: Event) => {
      const clave = (e as CustomEvent<string>).detail;
      if (!puedeEditar || didactico || !nodoDe(nodos, clave)) return;
      const arriba = new Set(ancestros(nodos, clave).map((a) => a.clave));
      setColapsados((prev) => ([...prev].some((c) => arriba.has(c)) ? new Set([...prev].filter((c) => !arriba.has(c))) : prev));
      setEdicion({ clave, campo: "titulo", nuevo: false });
    };
    window.addEventListener(EVENTO_RENOMBRAR, h);
    return () => window.removeEventListener(EVENTO_RENOMBRAR, h);
  }, [puedeEditar, didactico, nodos]);

  // ── Teclado ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (esCampoDeTexto(e.target) || (e.target as Element | null)?.closest?.('[role="dialog"], [role="menu"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const tecla = e.key.toLowerCase();
      if (mod && tecla === "z" && puedeEditar && !didactico) {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
        return;
      }
      if (mod && tecla === "y" && puedeEditar && !didactico) {
        e.preventDefault();
        rehacer();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "+" || e.key === "=") cam.zoom(1.25);
      else if (e.key === "-" || e.key === "_") cam.zoom(0.8);
      else if (e.key === "0") encuadrarTodo();
      else if (e.key === "?") setAtajos(true);
      else if (tecla === "f") alternarCompleta();
      else if (tecla === "l" && !angosto && !didactico) cambiarForma(forma === "arbol" ? "lista" : "arbol");
      else if (tecla === "v") setResaltarVacantes((r) => !r);
      else if (e.key === "ArrowRight" && recorrido !== null) irPasoRecorrido(recorrido + 1);
      else if (e.key === "ArrowLeft" && recorrido !== null) irPasoRecorrido(recorrido - 1);
      else if (e.key === "ArrowRight" && papel) irPasoPapel(papel.paso + 1);
      else if (e.key === "ArrowLeft" && papel) irPasoPapel(papel.paso - 1);
      else if (e.key === "Escape") {
        if (didactico) salirDidactico();
        else if (seleccion) setSeleccion(null);
        else if (completa) alternarCompleta();
        else return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [puedeEditar, didactico, rehacer, deshacer, cam, encuadrarTodo, recorrido, irPasoRecorrido, papel, irPasoPapel, salirDidactico, seleccion, completa, alternarCompleta, angosto, forma, cambiarForma]);

  // ── Vistas y modos de cada tarjeta ───────────────────────────────────────────
  const marcas = useMemo(() => (enBorrador ? marcasDeCambio(cambios) : new Map()), [enBorrador, cambios]);
  const vistas = useMemo<VistaNodo[]>(() => {
    const fuera: VistaNodo[] = [];
    for (const [clave, caja] of Object.entries(layout.cajas)) {
      if (clave === FANTASMA) continue;
      const nodo = nodoDe(nodos, clave);
      if (!nodo) continue;
      const personas: PersonaEnNodo[] = ocupantesVigentes(datos, clave)
        .map((o): PersonaEnNodo | null => {
          const persona = personaDe(datos.personas, o.persona);
          return persona ? { persona, modalidad: o.modalidad, ocupante: o.id.startsWith("cuadrilla-") ? undefined : o.id } : null;
        })
        .filter((x): x is PersonaEnNodo => !!x);
      const padre = nodo.dependeDe ? layout.cajas[nodo.dependeDe] : undefined;
      fuera.push({
        nodo,
        caja,
        color: areaDe(nodos, clave)?.color ?? "gris",
        personas,
        estado: estadoPuesto(datos, clave),
        ocultos: layout.ocultos[clave] ?? 0,
        cantHijos: hijos(nodos, clave).length,
        marca: marcas.get(clave),
        deCuadrillas: nodo.fuenteOcupantes === "cuadrillas",
        desde: padre ? { x: padre.x, y: padre.y } : { x: caja.x, y: caja.y },
        rama: nodo.tipo !== "puesto" ? estadisticaRama(datos, clave) : { puestos: 0, personas: personas.length, vacantes: 0 },
        clase: claseCaja(nodo, nodoDe(nodos, nodo.dependeDe)),
        busqueda: esBusquedaAbierta(nodo),
        cajaExterna: esCajaExterna(nodo),
      });
    }
    return fuera;
  }, [layout, nodos, datos, marcas]);

  const enfoque = useMemo<ReadonlySet<string> | null>(() => {
    if (recorrido !== null) {
      const p = pasosRecorrido[recorrido];
      return p?.tipo === "area" ? new Set([p.nodo.clave, ...descendientes(nodos, p.nodo.clave).map((d) => d.clave)]) : null;
    }
    if (papel && circuito) {
      const s = new Set([circuito.paradas[papel.paso].nodo]);
      if (papel.desde !== null) s.add(circuito.paradas[papel.desde].nodo);
      return s;
    }
    if (foco && nodoDe(nodos, foco)) return new Set([foco, ...ancestros(nodos, foco).map((a) => a.clave)]);
    if (personaFoco) {
      const claves = puestosDePersona(datos, personaFoco).map((p) => p.nodo.clave);
      if (!claves.length) return null;
      return new Set(claves.flatMap((c) => [c, ...ancestros(nodos, c).map((a) => a.clave)]));
    }
    return null;
  }, [recorrido, pasosRecorrido, papel, circuito, foco, personaFoco, nodos, datos]);

  const cadena = useMemo<ReadonlySet<string>>(() => {
    if (didactico || !enfoque || (!foco && !personaFoco)) return VACIO;
    return new Set([...enfoque].filter((c) => nodoDe(nodos, c)?.dependeDe));
  }, [didactico, enfoque, foco, personaFoco, nodos]);

  const arrastradas = useMemo<ReadonlySet<string>>(
    () => (carga?.tipo === "nodo" ? new Set([carga.clave, ...descendientes(nodos, carga.clave).map((d) => d.clave)]) : VACIO),
    [carga, nodos],
  );

  const cargaSeleccion: Carga | null = seleccion
    ? seleccion.tipo === "herramienta"
      ? { tipo: "herramienta", herramienta: seleccion.herramienta }
      : { tipo: "persona", persona: seleccion.persona }
    : null;
  const cargaActiva = carga ?? cargaSeleccion;

  const estadoDestino = (clave: string): EstadoDestino => {
    if (!cargaActiva) return null;
    const ok = validar(cargaActiva, { tipo: "nodo", clave });
    if (carga && destino?.tipo === "nodo" && destino.clave === clave) return ok ? "sobre" : "sobre-invalido";
    if (ok) return "valido";
    if (cargaActiva.tipo === "nodo") return arrastradas.has(clave) && clave !== cargaActiva.clave ? "invalido" : null;
    return "invalido";
  };

  const modos: Record<string, ModoTarjeta> = {};
  for (const v of vistas) {
    const c = v.nodo.clave;
    modos[c] = {
      atenuada: !!enfoque && !enfoque.has(c),
      resaltada: !!enfoque && (c === foco || (papel !== null && circuito?.paradas[papel.paso].nodo === c)),
      destino: estadoDestino(c),
      arrastrada: arrastradas.has(c) && carga?.tipo === "nodo" && c === carga.clave,
      simple,
      editando: edicion?.clave === c ? edicion.campo : null,
      retraso: retrasos[c] ?? 0,
      puedeEditar: puedeEditar && !didactico,
      arbol: formaEf === "arbol",
      resaltarVacantes,
    };
  }
  const destinosGrupos: Record<string, EstadoDestino> = {};
  for (const g of layout.grupos) destinosGrupos[g.clave] = estadoDestino(g.clave);
  const gruposAtenuados = enfoque ? new Set(layout.grupos.filter((g) => !enfoque.has(g.clave)).map((g) => g.clave)) : null;

  const res = useMemo(() => calcularResumen(datos, hoyBA()), [datos]);
  const cargaPersonas = useMemo(() => cargaPorPersona(datos), [datos]);
  const coloresMini = useMemo(() => Object.fromEntries(vistas.map((v) => [v.nodo.clave, v.color])), [vistas]);
  const cajasMini = useMemo(() => Object.entries(base.cajas), [base]);
  const gruposVisibles = useMemo(() => layout.grupos.filter((g) => g.clave !== FANTASMA), [layout]);

  // ── Fantasma bajo el puntero ─────────────────────────────────────────────────
  let fantasma: React.ReactNode = null;
  if (cargaCruda) {
    const hay = !!destino;
    if (cargaCruda.tipo === "herramienta") fantasma = <Fantasma herramienta={cargaCruda.herramienta} valido={destinoValido} hayDestino={hay} />;
    else if (cargaCruda.tipo === "persona") fantasma = <Fantasma persona={personaDe(datos.personas, cargaCruda.persona)} valido={destinoValido} hayDestino={hay} />;
    else {
      const n = nodoDe(nodos, cargaCruda.clave);
      fantasma = (
        <Fantasma
          nodo={n}
          color={areaDe(nodos, cargaCruda.clave)?.color}
          debajo={descendientes(nodos, cargaCruda.clave).length}
          valido={destinoValido}
          hayDestino={hay}
        />
      );
    }
  }

  const cajaFantasma = layout.cajas[FANTASMA];
  const personaSel = seleccion?.tipo === "persona" ? personaDe(datos.personas, seleccion.persona) : undefined;

  return (
    <AccionesCtx.Provider value={acciones}>
      <div
        ref={contRef}
        data-lienzo
        className={cn(
          "touch-none overflow-hidden bg-background select-none",
          completa
            ? "fixed inset-0 z-40 h-dvh w-screen"
            : "relative h-[calc(100dvh-16.5rem)] min-h-[540px] w-full rounded-xl border max-md:h-[calc(100dvh-13rem)] max-md:min-h-[560px]",
          cargaActiva ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={onPointerDown}
        onClick={(e) => {
          if (gesto.current.suprimirClick) return;
          const t = e.target as Element;
          if (t.closest("[data-nodo], [data-sin-pan]")) return;
          // Con una herramienta o persona elegida (celular), tocar el recuadro de un área es tocar el área.
          const grupo = t.closest<HTMLElement>("[data-grupo]")?.dataset.grupo;
          if (seleccion && grupo && aplicarSeleccion(grupo)) return;
          if (seleccion) setSeleccion(null);
          else if (foco || personaFoco) irA("");
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* En el lienzo, la hoja lateral no tapa con velo: se ve el foco y la cadena de mando. */}
        <style>{`body:has([data-lienzo]) [data-slot="sheet-overlay"]{background:transparent;backdrop-filter:none}`}</style>
        <Fondo x={cam.x} y={cam.y} k={cam.k} />

        <motion.div className="absolute top-0 left-0" style={{ x: cam.x, y: cam.y, scale: cam.k, originX: 0, originY: 0 }}>
          <Grupos grupos={gruposVisibles} colores={coloresMini} atenuados={gruposAtenuados} destinos={destinosGrupos} />
          <Conectores aristas={layout.aristas} cadena={cadena} atenuar={!!enfoque} fantasma={FANTASMA} colores={coloresMini} />
          {rutaPapel && (
            <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
              <motion.path
                key={`${papel?.desde}-${papel?.paso}`}
                d={`M ${rutaPapel.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
                fill="none"
                className="stroke-foreground/60"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reducido ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: duracionRuta, ease: "easeInOut" }}
              />
            </svg>
          )}
          <AnimatePresence custom={salida}>
            {vistas.map((v) => (
              <Tarjeta key={v.nodo.clave} vista={v} modo={modos[v.nodo.clave]} />
            ))}
            {cajaFantasma && nodoFantasma && (
              <TarjetaFantasma
                key={FANTASMA}
                caja={cajaFantasma}
                titulo={nodoFantasma.titulo}
                tipo={nodoFantasma.tipo}
                color={nodoFantasma.tipo === "area" ? (nodoFantasma.color ?? "gris") : (areaDe(nodos, nodoFantasma.dependeDe ?? "")?.color ?? "gris")}
              />
            )}
          </AnimatePresence>
          {papel && circuito && (
            <motion.div className="pointer-events-none absolute top-0 left-0 z-30" style={{ x: papelX, y: papelY, rotate: rotPapel }}>
              <Papelito papel={circuito.paradas[papel.paso].papel} />
            </motion.div>
          )}
          {celebraciones.map((c) => {
            const caja = layout.cajas[c.clave];
            if (!caja) return null;
            const p = centroDe(caja);
            return <Celebracion key={c.id} x={p.x} y={p.y} />;
          })}
        </motion.div>

        {/* ── Paneles flotantes ── */}
        <div className="pointer-events-none absolute inset-0 p-2">
          <div className="relative flex h-full flex-col gap-2">
            <BarraLienzo
              resumen={res}
              puedeEditar={puedeEditar}
              enBorrador={enBorrador}
              hayBorrador={!!estado.borrador}
              cambios={cambios.length}
              puedeDeshacer={hist.pasado.length > 0}
              puedeRehacer={hist.futuro.length > 0}
              onDeshacer={deshacer}
              onRehacer={rehacer}
              onPublicar={() => abrir({ tipo: "publicar" })}
              onVerCambios={() => abrir({ tipo: "cambios" })}
              onDescartar={() => abrir({ tipo: "descartar" })}
              onAlternarBorrador={() => dispatch(enBorrador ? { tipo: "salir" } : { tipo: "entrar", autor })}
              onRecorrido={() => {
                setPapel(null);
                setSeleccion(null);
                irA("");
                setRecorrido(0);
              }}
              onPapel={empezarPapel}
              onAtajos={() => setAtajos(true)}
              ocupado={didactico}
              forma={formaEf}
              onForma={angosto ? undefined : cambiarForma}
              resaltarVacantes={resaltarVacantes}
              onResaltarVacantes={() => setResaltarVacantes((r) => !r)}
            />

            <div className="flex justify-center">
              <AnimatePresence>
                {seleccion && (
                  <AvisoSeleccion
                    key="sel"
                    texto={
                      seleccion.tipo === "herramienta"
                        ? "Tocá el puesto del que va a depender"
                        : `Tocá un puesto para ubicar a ${personaSel ? personaSel.nombre : "la persona"}`
                    }
                    onCancelar={() => setSeleccion(null)}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="relative min-h-0 flex-1">
              <AnimatePresence>
                {puedeEditar && !didactico && (
                  <div key="caja" data-panel="izquierda" className="absolute top-0 left-0">
                    <CajaHerramientas
                      seleccionada={seleccion?.tipo === "herramienta" ? seleccion.herramienta : null}
                      onTocar={(h) => setSeleccion((s) => (s?.tipo === "herramienta" && s.herramienta === h ? null : { tipo: "herramienta", herramienta: h }))}
                    />
                  </div>
                )}
              </AnimatePresence>

              <div data-panel="derecha" className={cn("absolute right-0 flex flex-col items-end gap-2", angosto ? "top-0" : "bottom-0")}>
                {!angosto && !didactico && <Minimapa cajas={cajasMini} grupos={base.grupos} colores={coloresMini} limites={base.limites} cam={cam} vista={tam} />}
                <ControlesZoom cam={cam} onEncuadrar={() => encuadrarTodo()} completa={completa} onPantallaCompleta={alternarCompleta} />
              </div>

              <AnimatePresence>
                {recorrido !== null && (
                  <div key="rec" data-panel={angosto ? "abajo" : "izquierda"} className="absolute bottom-0 left-0 max-sm:right-0">
                    <TarjetaRecorrido pasos={pasosRecorrido} paso={recorrido} datos={datos} resumen={res} onIr={irPasoRecorrido} onSalir={salirDidactico} />
                  </div>
                )}
                {papel && circuito && (
                  <div key="papel" data-panel={angosto ? "abajo" : "izquierda"} className="absolute bottom-0 left-0 max-sm:right-0">
                    <TarjetaPapel
                      circuito={circuito}
                      paso={papel.paso}
                      datos={datos}
                      reproduciendo={papel.reproduciendo}
                      onIr={(i) => {
                        setPapel((p) => (p ? { ...p, reproduciendo: false } : p));
                        irPasoPapel(i);
                      }}
                      onReproducir={() =>
                        setPapel((p) => {
                          if (!p) return p;
                          if (!p.reproduciendo && p.paso >= (circuito.paradas.length ?? 1) - 1) return { ...p, paso: 0, desde: null, reproduciendo: true };
                          return { ...p, reproduciendo: !p.reproduciendo };
                        })
                      }
                      onSalir={salirDidactico}
                    />
                  </div>
                )}
              </AnimatePresence>
            </div>

            {!didactico && (
              <div data-panel="abajo" className={cn("absolute inset-x-0 bottom-0 flex justify-center", !angosto && "pr-[200px] pl-[180px]")}>
                <AnimatePresence mode="popLayout">
                  {carga?.tipo === "nodo" ? (
                    <Tacho key="tacho" ref={tachoRef} encima={destino?.tipo === "tacho"} />
                  ) : (
                    <Banco
                      key="banco"
                      personas={datos.personas}
                      carga={cargaPersonas}
                      puedeEditar={puedeEditar}
                      seleccion={seleccion?.tipo === "persona" ? seleccion.persona : null}
                      onTocar={(id) => {
                        if (!puedeEditar) return irA(`persona=${encodeURIComponent(id)}`);
                        setSeleccion((s) => (s?.tipo === "persona" && s.persona === id ? null : { tipo: "persona", persona: id }));
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        <CapaFantasma>{fantasma}</CapaFantasma>
      </div>

      {pregunta?.tipo === "ubicar" &&
        (() => {
          const persona = personaDe(datos.personas, pregunta.persona);
          const nodo = nodoDe(nodos, pregunta.nodo);
          if (!persona || !nodo) return null;
          const actuales = ocupantesVigentes(datos, pregunta.nodo)
            .filter((o) => o.id !== pregunta.desdeOcupante)
            .map((o) => personaDe(datos.personas, o.persona))
            .filter((p): p is NonNullable<typeof p> => !!p);
          return (
            <DialogoUbicar
              persona={persona}
              nodo={nodo}
              actuales={actuales}
              onCerrar={() => setPregunta(null)}
              onElegir={(modo) => {
                setPregunta(null);
                hacerUbicar(pregunta.persona, pregunta.nodo, modo, pregunta.desdeOcupante);
              }}
            />
          );
        })()}
      {pregunta?.tipo === "tacho" &&
        (() => {
          const nodo = nodoDe(nodos, pregunta.clave);
          if (!nodo) return null;
          return (
            <DialogoTacho
              nodo={nodo}
              padre={nodoDe(nodos, nodo.dependeDe)}
              debajo={descendientes(nodos, nodo.clave).length}
              onCerrar={() => setPregunta(null)}
              onSubir={() => {
                setPregunta(null);
                eliminarYa(pregunta.clave, "subir");
              }}
              onRama={() => {
                setPregunta(null);
                eliminarYa(pregunta.clave, "rama");
              }}
            />
          );
        })()}
      {atajos && <DialogoAtajos onCerrar={() => setAtajos(false)} />}
    </AccionesCtx.Provider>
  );
}
