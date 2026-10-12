"use client";

// El Pizarrón del día (/planificacion/hoja/pizarron?dia=…): la Hoja del día como pizarrón de
// obra (docs/equipos-del-dia/rediseno-plan.md; la especificación es maqueta/pizarron.html).
// Columnas = cuadrillas con su gente, sus contratistas y sus camiones; abajo la bandeja (sin
// asignar, contratistas, camiones libres, no vienen); a la derecha los pedidos y el mini-mapa.
//
// TODA LA CUENTA ES DE pizarron.ts (que usa estado.ts) Y TODO GESTO ES UNA ACCIÓN DE SIEMPRE
// (gestos-pizarron.ts → use-hoja-dia): se ve al instante (optimista.ts) y el servidor confirma
// con su texto y su Deshacer. Lo mismo que hace la vista clásica, con otra cara.
//
// Tres maneras de mover una ficha: arrastrarla (dnd-kit: mouse, dedo con 200 ms de espera,
// teclado con Espacio + flechas), tocarla y tocar el destino (barra de ayuda, Esc cancela),
// o con foco apretar 1–5 (esa cuadrilla) o B ("Sin asignar" / "Camiones libres").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type KeyboardSensorOptions, type MouseSensorOptions,
  type TouchSensorOptions,
} from "@dnd-kit/core";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AccionHoja, Resultado } from "@/lib/hoja-dia/acciones";
import { ausenciaDe, cap, choferesParaVehiculo, diaSemana, hojaDe, nombreDe, persona, vehTxt, type Boton } from "@/lib/hoja-dia/estado";
import { TIPOS_AUSENCIA, type TipoAusencia } from "@/lib/hoja-dia/tipos";
import { cuadrillaDeNumero, soltar, textoAyuda, type Destino, type Gesto, type Origen } from "@/lib/hoja-dia/gestos-pizarron";
import { estadoMandar, pizarron, type FichaCamion } from "@/lib/hoja-dia/pizarron";
import { nivelEn } from "@/lib/auth/acceso";
import { useAcceso } from "@/components/providers/acceso-provider";
import {
  useAccionAusencia, useAccionHoja, useAccionViaje, useAhora, useAvisosHojaDia, useDeshacer, useHojaDia, usePrecarga,
} from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuFlotante, ItemMenu, MenuCabeza } from "@/components/hoja-dia/comunes/menu-flotante";
import { ListaEnvio } from "@/components/hoja-dia/comunes/lista-envio";
import { useDiaHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { diaCorto } from "@/components/hoja-dia/comunes/encabezado-hoja";
import { DialogoCelular } from "@/components/hoja-dia/cuadrillas/dialogos";
import { HojaContratistas } from "@/components/hoja-dia/cuadrillas/hoja-contratistas";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { PizarronCtx, prioridadDe, type Ctx } from "./contexto";
import { BarraDia } from "./barra-dia";
import { ColumnaUI } from "./columna";
import { Bandeja } from "./bandeja";
import { Fantasma, colorCamion } from "./fichas";
import { Mandar } from "./mandar";
import { PanelLateral } from "./pedidos";
import { useFlip } from "./use-flip";

const RUTA_CAMIONES = "/planificacion/hoja/camiones";

// ─── Sensores: los de dnd-kit, salvo que no arrancan desde un botón de adentro de la ficha ───

const libre = (e: { target: EventTarget | null }) => !(e.target instanceof Element && e.target.closest("[data-no-drag]"));
class Raton extends MouseSensor {
  static activators = MouseSensor.activators.map((x) => ({ ...x, handler: (e: React.MouseEvent, o: MouseSensorOptions) => libre(e) && x.handler(e, o) }));
}
class Dedo extends TouchSensor {
  static activators = TouchSensor.activators.map((x) => ({ ...x, handler: (e: React.TouchEvent, o: TouchSensorOptions) => libre(e) && x.handler(e, o) }));
}
class Teclado extends KeyboardSensor {
  static activators = KeyboardSensor.activators.map((x) => ({
    ...x,
    handler: (e: React.KeyboardEvent, o: KeyboardSensorOptions, c: Parameters<typeof x.handler>[2]) => libre(e) && x.handler(e, o, c),
  }));
}

/** Debajo del puntero puede haber varios destinos (la ficha, la lista, la columna): gana el más específico. */
const detectar: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  const lista = (p.length ? p : rectIntersection(args)).filter((c) => String(c.id) !== `sobre:${String(args.active.id)}`);
  const prio = (c: (typeof lista)[number]) => {
    const d = (c.data?.droppableContainer?.data?.current as { destino?: Destino } | undefined)?.destino;
    return d ? prioridadDe(d) : -1;
  };
  return [...lista].sort((a, b) => prio(b) - prio(a));
};

/** La clave de animación de lo que se suelta (dónde aterriza). */
function claveFlip(o: Origen, d: Destino): string {
  if (o.k === "persona" || o.k === "chofer") return `p:${o.pid}`;
  if (o.k === "camion") return `t:${o.veh ?? ""}`;
  return "c" in d ? `k:${d.c}:${o.kid}` : `kc:${o.kid}`;
}

type Rect = { left: number; top: number };
type Grupo = { fecha: string; ids: string[] };

export function Pizarron() {
  const router = useRouter();
  const { fecha, hoy, manana, irA, montado } = useDiaHoja();
  const q = useHojaDia(fecha);
  const dia = q.data && q.data.fecha === fecha ? q.data : null;
  const ahora = useAhora(fecha);
  useAvisosHojaDia(fecha);
  const editor = nivelEn(useAcceso(), "hoja-dia") === "editar";

  // Sin el toast de cada uno: el pizarrón junta las acciones de un gesto en un solo aviso.
  const hojaM = useAccionHoja(fecha, { aviso: false });
  const viajeM = useAccionViaje(fecha, { aviso: false });
  const ausM = useAccionAusencia(fecha, { aviso: false });
  const deshacerM = useDeshacer(fecha);
  const precarga = usePrecarga(fecha);

  const raiz = useRef<HTMLDivElement>(null);
  const tablero = useRef<HTMLElement>(null);
  const flip = useFlip(raiz, fecha);

  const [sel, setSel] = useState<Ctx["sel"]>(null);
  const [arrastre, setArrastre] = useState<Ctx["arrastre"]>(null);
  const [sobre, setSobre] = useState<Destino | null>(null);
  const [resaltar, setResaltar] = useState(false);
  const [foco, setFoco] = useState<number | null>(null);
  const [pila, setPila] = useState<Grupo[]>([]);
  const [menu, setMenu] = useState<
    | { t: "motivo"; pid: string; origen: Origen; el: HTMLElement }
    | { t: "cambiarMotivo"; pid: string; ausenciaId: string; el: HTMLElement }
    | { t: "chofer"; f: FichaCamion; el: HTMLElement }
    | { t: "contratista"; kid: string; el: HTMLElement }
    | null
  >(null);
  const [cuantos, setCuantos] = useState(1);
  const [hojaLat, setHojaLat] = useState<"mandar" | "envio" | "contratistas" | null>(null);
  const [celular, setCelular] = useState<string | null>(null);

  const vista = useMemo(() => (dia ? pizarron(dia, ahora) : null), [dia, ahora]);
  const soloLectura = !editor || !!vista?.pasado;

  // Al cambiar de día: se suelta lo elegido y la franja entra deslizándose (maqueta: goDay).
  const [fechaVista, setFechaVista] = useState(fecha);
  if (fechaVista !== fecha) {
    setFechaVista(fecha);
    setSel(null);
    setMenu(null);
  }
  const fechaAntes = useRef(fecha);
  useEffect(() => {
    const antes = fechaAntes.current;
    fechaAntes.current = fecha;
    if (antes === fecha || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    tablero.current?.animate([{ opacity: 0, transform: `translateX(${fecha > antes ? 18 : -18}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [fecha]);

  // ─── Mandar acciones ──────────────────────────────────────────────────────

  const deshacerGrupo = useCallback(async (g: Grupo) => {
    setPila((p) => p.filter((x) => x !== g));
    for (const id of [...g.ids].reverse()) {
      try {
        await deshacerM.mutateAsync(id);
      } catch {
        return; // el error ya lo mostró useDeshacer
      }
    }
  }, [deshacerM]);

  /** Manda las acciones de un gesto (todas a la vez: cada una se ve al instante) y avisa una vez. */
  const ejecutar = useCallback((gs: Gesto[]) => {
    const proms: Promise<Resultado>[] = gs.map((g) =>
      g.k === "hoja" ? hojaM.mutateAsync(g.a) : g.k === "viaje" ? viajeM.mutateAsync(g.a) : ausM.mutateAsync({ ...g.a, fechaVista: fecha }));
    void Promise.allSettled(proms).then((rs) => {
      const ok = rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (!ok.length) return;
      const ids = ok.map((r) => r.historialId).filter((x): x is string => !!x);
      const g: Grupo = { fecha, ids };
      if (ids.length) setPila((p) => [...p.slice(-29), g]);
      toast(ok.map((r) => r.texto).join(" · "), ids.length ? { duration: 9000, action: { label: "Deshacer", onClick: () => void deshacerGrupo(g) } } : undefined);
    });
  }, [ausM, deshacerGrupo, fecha, hojaM, viajeM]);

  const hoja = useCallback((a: AccionHoja) => ejecutar([{ k: "hoja", a }]), [ejecutar]);

  const deshacerUltimo = useCallback(() => {
    const g = [...pila].reverse().find((x) => x.fecha === fecha);
    if (g) void deshacerGrupo(g);
  }, [deshacerGrupo, fecha, pila]);

  /** Lo que pasa al soltar (o tocar) `o` en `d`. true si hizo algo (o pidió el motivo). */
  const resolver = useCallback((o: Origen, d: Destino, desde?: Rect | null): boolean => {
    if (!dia) return false;
    const r = soltar(dia, o, d, ahora);
    if (r.k === "nada") return false;
    if (r.k === "rechazo") {
      flip.sacudir(claveFlip(o, d));
      toast(r.motivo);
      return false;
    }
    if (r.k === "pedirMotivo") {
      const el = document.querySelector<HTMLElement>('[data-caja="no"]');
      if (el) setMenu({ t: "motivo", pid: r.pid, origen: o, el });
      return true;
    }
    flip.aterrizar(claveFlip(o, d), desde);
    ejecutar(r.gestos);
    return true;
  }, [ahora, dia, ejecutar, flip]);

  // ─── Botones de los avisos (los mismos de la vista clásica) ───────────────

  const irCamiones = useCallback((extra = "") => router.push(`${RUTA_CAMIONES}?dia=${fecha}${extra}`), [fecha, router]);
  const pedirFoco = useCallback((c: number) => {
    setFoco(c);
    document.querySelector(`[data-col="${c}"]`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
    setTimeout(() => setFoco((x) => (x === c ? null : x)), 1600);
  }, []);

  const boton = useCallback((b: Boton, el: HTMLElement) => {
    if (!dia || !vista) return;
    const c = b.c ?? null;
    const f = fecha;
    switch (b.a) {
      case "sacar": if (b.p) hoja({ accion: "sacar", fecha: f, personaId: b.p }); return;
      case "usarCargo": if (c != null && b.p) hoja({ accion: "a_cargo", fecha: f, cuadrilla: c, personaId: b.p }); return;
      case "agregar": if (c != null && b.p) hoja({ accion: "agregar", fecha: f, cuadrilla: c, personaId: b.p }); return;
      case "sumarContratista": if (c != null && b.p) hoja({ accion: "contratista_sumar", fecha: f, cuadrilla: c, contratistaId: b.p, n: b.n ?? 1 }); return;
      case "pasarChofer": if (c != null && b.from != null) hoja({ accion: "pasar_chofer", fecha: f, cuadrilla: c, desde: b.from, choferId: b.p ?? null }); return;
      case "liberar": if (c != null) hoja({ accion: "liberar", fecha: f, cuadrilla: c }); return;
      case "vuelvenSolos": if (c != null) ejecutar([{ k: "viaje", a: { accion: "vuelven_solos", fecha: f, cuadrilla: c } }]); return;
      case "okTodo": if (b.id) ejecutar([{ k: "viaje", a: { accion: "ok_todo_el_dia", viajeId: b.id } }]); return;
      case "volverCola": if (b.id) ejecutar([{ k: "viaje", a: { accion: "volver_a_cola", viajeId: b.id } }]); return;
      case "conLleva": if (b.id && b.con) ejecutar([{ k: "viaje", a: { accion: "con_lleva", viajeId: b.id, llevaId: b.con } }]); return;
      case "pasarA": if (b.id && b.veh) ejecutar([{ k: "viaje", a: { accion: "mover", viajeId: b.id, vehiculoId: b.veh } }]); return;
      case "marcarHecho": if (b.id) ejecutar([{ k: "viaje", a: { accion: "hecho", viajeId: b.id } }]); return;
      case "chEd": {
        // "Elegir chofer" de la columna: el menú del primer camión sin chofer (o del primero).
        const col = vista.columnas.find((x) => x.c === c);
        const k = col?.camiones.find((x) => !x.choferId) ?? col?.camiones[0];
        if (k) setMenu({ t: "chofer", f: k, el });
        else toast("Arrastrá un camión de «Camiones libres» a la columna");
        return;
      }
      case "focoAgregar":
        document.querySelector('[data-caja="sin"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        toast("Arrastrá a alguien de «Sin asignar» a la columna");
        return;
      case "irA": if (c != null) pedirFoco(c); return;
      case "tablero": router.push("/planificacion"); return;
      case "dlgCel": if (b.p) setCelular(b.p); return;
      case "llamar": {
        const tel = persona(dia, b.p)?.celular;
        if (tel) window.location.href = `tel:${tel.replace(/[^\d+]/g, "")}`;
        else toast.error(`${nombreDe(dia, b.p) || "Esa persona"} no tiene celular cargado`);
        return;
      }
      case "avisarChofer": case "abrirEnvio": case "avisarTarde": case "reenviar": setHojaLat("envio"); return;
      case "verCamion": irCamiones(b.veh ? `&veh=${b.veh}` : ""); return;
      case "verViaje": case "choferViaje": case "elegirChoferViaje": case "noSeHizo": irCamiones(b.id ? `&viaje=${b.id}` : ""); return;
      case "irCamiones": irCamiones(b.id ? `&pedido=${b.id}` : ""); return;
      case "esperar": case "poner": case "fleteDe": irCamiones(b.id ? `&pedido=${b.id}&hacer=${b.a === "fleteDe" ? "flete" : b.a}` : ""); return;
      default: toast(`«${b.l}» se hace desde la vista Cuadrillas por ahora`);
    }
  }, [dia, ejecutar, fecha, hoja, irCamiones, pedirFoco, router, vista]);

  // ─── Teclado ──────────────────────────────────────────────────────────────

  const teclear = useCallback((o: Origen, k: string, e: React.KeyboardEvent) => {
    if (!dia || !vista || soloLectura || arrastre || e.metaKey || e.ctrlKey || e.altKey) return;
    let d: Destino | null = null;
    if (/^[1-9]$/.test(e.key)) {
      const c = cuadrillaDeNumero(dia, Number(e.key), vista.columnas.map((x) => x.c));
      if (c != null) d = { k: "columna", c };
    } else if (e.key === "b" || e.key === "B") d = o.k === "camion" ? { k: "libres" } : { k: "sin" };
    if (!d) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSel(null);
    if (resolver(o, d, r)) {
      const clave = claveFlip(o, d);
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(clave)}"][tabindex]`)?.focus({ preventScroll: true })));
    }
  }, [arrastre, dia, resolver, soloLectura, vista]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !enCampo) {
        e.preventDefault();
        deshacerUltimo();
        return;
      }
      if (e.key === "Escape" && sel && !menu) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deshacerUltimo, menu, sel]);

  // ─── Arrastre ─────────────────────────────────────────────────────────────

  const sensores = useSensors(
    useSensor(Raton, { activationConstraint: { distance: 5 } }),
    useSensor(Dedo, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Espacio levanta y suelta; Enter queda para "tocar" (elegir la ficha).
    useSensor(Teclado, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  // Auto-scroll sólo en la franja de columnas (horizontal) y en la página (para bajar a la
  // bandeja). En el tablero se apagó entero porque recorría todos los ancestros con scroll y
  // corría la vista sola; acá se le dice cuáles puede mover.
  const autoScroll = useMemo(() => ({
    threshold: { x: 0.12, y: 0.12 },
    canScroll: (el: Element) => el.hasAttribute("data-pizarron-scroll") || el.tagName === "MAIN" || el === document.scrollingElement,
  }), []);

  const alEmpezar = (e: DragStartEvent) => {
    const origen = (e.active.data.current as { origen?: Origen } | undefined)?.origen;
    if (!origen) return;
    setSel(null);
    setMenu(null);
    setArrastre({ origen, k: String(e.active.id) });
  };
  const alPasar = (e: DragOverEvent) => setSobre((e.over?.data.current as { destino?: Destino } | undefined)?.destino ?? null);
  const alSoltar = (e: DragEndEvent) => {
    const origen = (e.active.data.current as { origen?: Origen } | undefined)?.origen;
    const d = (e.over?.data.current as { destino?: Destino } | undefined)?.destino;
    const r = e.active.rect.current.translated;
    setArrastre(null);
    setSobre(null);
    if (origen && d) resolver(origen, d, r ? { left: r.left, top: r.top } : null);
  };
  const alCancelar = () => {
    setArrastre(null);
    setSobre(null);
  };

  // ─── Contexto para las partes ─────────────────────────────────────────────

  const ctx: Ctx | null = dia && vista ? {
    dia, vista, ahora, soloLectura, sel,
    elegir: (origen, k) => setSel((s) => (s?.k === k ? null : { origen, k })),
    tocar: (d) => {
      if (!sel) return false;
      const s = sel;
      setSel(null);
      resolver(s.origen, d);
      return true;
    },
    teclear, arrastre, sobre, hoja, boton,
    menuChofer: (f, el) => setMenu({ t: "chofer", f, el }),
    menuContratista: (kid, el) => {
      setCuantos(1);
      setMenu({ t: "contratista", kid, el });
    },
    menuMotivo: (pid, el, ausenciaId) => ausenciaId && setMenu({ t: "cambiarMotivo", pid, ausenciaId, el }),
    recorrido: (veh) => irCamiones(veh ? `&veh=${veh}` : ""),
    resaltar, foco,
  } : null;

  // ─── Pantalla ─────────────────────────────────────────────────────────────

  if (q.isError && !dia) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-8">
        <h2 className="text-lg font-semibold">No se pudo leer la hoja del día.</h2>
        <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
        <Button variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
      </div>
    );
  }
  if (!dia || !vista || !ctx) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Cargando el pizarrón">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-72 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const n = vista.columnas.length;
  const copiarDe = dia.anterior?.fecha ?? null;
  const copiar = (modo: "hoy" | "plantel" = "hoy") =>
    precarga.mutate({ fecha, modo }, {
      onSuccess: (r) => {
        const g: Grupo = { fecha, ids: r.historialId ? [r.historialId] : [] };
        if (g.ids.length) setPila((p) => [...p, g]);
        const extra = Array.isArray(r.avisos) && r.avisos.length ? ` · ${(r.avisos as string[]).join(" · ")}` : "";
        toast(`${r.texto}${extra}`, g.ids.length ? { duration: 9000, action: { label: "Deshacer", onClick: () => void deshacerGrupo(g) } } : undefined);
      },
    });
  const resaltarAvisos = () => {
    setResaltar(true);
    const c = vista.columnas.find((x) => x.avisos.length);
    if (c) document.querySelector(`[data-col="${c.c}"]`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
    setTimeout(() => setResaltar(false), 2600);
  };
  const rotulo = fecha === hoy ? "hoy" : fecha === manana ? "mañana" : `el ${diaCorto(fecha)}`;
  const fantasma = arrastre ? (() => {
    const o = arrastre.origen;
    if (o.k === "persona" || o.k === "chofer") return <Fantasma texto={nombreDe(dia, o.pid)} />;
    if (o.k === "contratista") return <Fantasma texto={`+1 de ${nombreDe(dia, o.kid)}`} />;
    const k = [...vista.camionesLibres, ...vista.columnas.flatMap((x) => x.camiones)].find((x) => `t:${x.k}` === arrastre.k);
    return <Fantasma camion color={k ? colorCamion(k.color) : undefined} texto={vehTxt(dia, o.veh) || "Camión"} />;
  })() : null;
  const menuChofer = menu?.t === "chofer" ? menu : null;

  return (
    <PizarronCtx.Provider value={ctx}>
      <DndContext sensors={sensores} collisionDetection={detectar} autoScroll={autoScroll} onDragStart={alEmpezar} onDragOver={alPasar} onDragEnd={alSoltar} onDragCancel={alCancelar}>
        <div ref={raiz} className="@container grid min-w-0 gap-3.5" onClick={() => sel && setSel(null)}>
          <BarraDia
            fecha={fecha} hoy={hoy} manana={manana} montado={montado} irA={irA}
            avisos={vista.avisos} vacio={vista.vacio} onResaltar={resaltarAvisos}
            puedeDeshacer={pila.some((g) => g.fecha === fecha)} onDeshacer={deshacerUltimo}
            copiarDe={copiarDe} onCopiar={() => copiar("hoy")} copiando={precarga.isPending}
            mandar={estadoMandar(dia)} onMandar={() => setHojaLat("mandar")} soloLectura={soloLectura}
          />
          {vista.pasado && (
            <div className="rounded-lg border bg-hd-card2 px-3.5 py-1.5 text-[13px] text-muted-foreground">
              <b className="font-semibold text-foreground">{cap(diaSemana(fecha))} {Number(fecha.slice(8))}: sólo lectura.</b> Lo que pasó lo dicen los partes y la asistencia.
            </div>
          )}
          <div className="grid items-start gap-3.5 @min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
            <section ref={tablero} aria-label="Pizarrón" className="@container flex min-w-0 flex-col gap-3">
              {vista.vacio && !soloLectura && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg border-[1.5px] border-dashed border-foreground/30 bg-card px-4 py-4">
                  <div className="min-w-[200px] flex-1">
                    <b className="block text-[19px] leading-tight font-bold">El {diaSemana(fecha)} {Number(fecha.slice(8))} todavía no está armado</b>
                    <span className="text-[13px] text-muted-foreground">Copiá el día anterior y cambiá sólo lo que haga falta. Las obras ya vienen del tablero.</span>
                  </div>
                  <Button className="h-11 bg-hd-boton px-4 text-[15px] font-semibold text-white hover:bg-hd-boton-hover" disabled={precarga.isPending} onClick={() => copiar(copiarDe ? "hoy" : "plantel")}>
                    {precarga.isPending ? <Loader2 className="animate-spin" /> : <Copy />}
                    {copiarDe ? `Copiar de ${diaCorto(copiarDe)}` : "Empezar con el plantel base"}
                  </Button>
                </div>
              )}
              <div data-pizarron-scroll="" className="overflow-x-auto overscroll-x-contain pb-1">
                <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(168px, 1fr))`, minWidth: n * 178 }}>
                  {vista.columnas.map((col) => <ColumnaUI key={col.c} col={col} />)}
                </div>
              </div>
              <Bandeja onNuevoContratista={() => setHojaLat("contratistas")} />
            </section>
            <PanelLateral dia={dia} vista={vista} rotulo={rotulo} onFoco={pedirFoco} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>{fantasma}</DragOverlay>
      </DndContext>

      {sel && (
        <div role="status" className="fixed bottom-[calc(18px+env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded-full bg-primary py-2 pr-2 pl-4 text-[13.5px] font-bold text-primary-foreground shadow-xl">
          <span>{textoAyuda(dia, sel.origen)}</span>
          <button type="button" onClick={() => setSel(null)} className="rounded-full bg-black/20 px-2.5 py-1 font-bold">Cancelar</button>
        </div>
      )}

      {menu?.t === "motivo" && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Por qué no viene" encabezado={<MenuCabeza titulo={`${nombreDe(dia, menu.pid)} no viene el ${diaSemana(fecha)}`} sub="Queda cargado sólo para ese día" />}>
          {TIPOS_AUSENCIA.map(([t, l]) => (
            <ItemMenu
              key={t}
              onClick={() => {
                const o = menu.origen;
                setMenu(null);
                resolver(o, { k: "no", tipo: t as TipoAusencia });
              }}
            >
              {l}
            </ItemMenu>
          ))}
        </MenuFlotante>
      )}
      {menu?.t === "cambiarMotivo" && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Cambiar motivo" encabezado={<b className="font-semibold">¿Por qué no viene {nombreDe(dia, menu.pid)}?</b>}>
          {TIPOS_AUSENCIA.map(([t, l]) => (
            <ItemMenu
              key={t}
              disabled={ausenciaDe(dia, menu.pid)?.tipo === t}
              onClick={() => {
                const id = menu.ausenciaId;
                setMenu(null);
                ejecutar([{ k: "ausencia", a: { accion: "editar", ausenciaId: id, tipo: t } }]);
              }}
            >
              {l}
            </ItemMenu>
          ))}
        </MenuFlotante>
      )}
      {menuChofer && (
        <MenuFlotante anchor={menuChofer.el} onCerrar={() => setMenu(null)} label="Elegir chofer" encabezado={<b className="font-semibold">Chofer {menuChofer.f.nombre ? `del ${menuChofer.f.nombre}` : ""}</b>}>
          {/* El habitual primero, marcado: es sólo la sugerencia (nunca se pone solo). */}
          {choferesParaVehiculo(dia, menuChofer.f.veh).filter(({ id }) => !ausenciaDe(dia, id) && id !== menuChofer.f.choferId).map(({ id, habitual }) => {
            const c = hojaDe(dia, id);
            const enCamion = vista.columnas.flatMap((x) => x.camiones).concat(vista.camionesLibres).find((x) => x.choferId === id);
            const donde = enCamion ? `en el ${enCamion.nombre}` : c != null ? `en la ${vista.columnas.find((x) => x.c === c)?.rotulo ?? ""}` : "libre";
            return (
              <ItemMenu
                key={id}
                detalle={habitual ? `habitual · ${donde}` : donde}
                onClick={() => {
                  const f = menuChofer.f;
                  setMenu(null);
                  resolver({ k: "persona", pid: id }, { k: "camion", veh: f.veh, filaId: f.filaId, c: f.c });
                }}
              >
                {nombreDe(dia, id)}
              </ItemMenu>
            );
          })}
          {menuChofer.f.choferId && (
            <ItemMenu
              onClick={() => {
                const f = menuChofer.f;
                setMenu(null);
                resolver({ k: "chofer", pid: f.choferId!, veh: f.veh, filaId: f.filaId, c: f.c }, { k: "sin" });
              }}
            >
              Sacar a {nombreDe(dia, menuChofer.f.choferId)}
            </ItemMenu>
          )}
        </MenuFlotante>
      )}
      {menu?.t === "contratista" && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Sumar contratistas" ancho={280} encabezado={<b className="font-semibold">{nombreDe(dia, menu.kid)} · ¿cuántos?</b>}>
          <div className="grid grid-cols-4 gap-1 p-0.5">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((x) => (
              <button key={x} type="button" data-mi="" aria-pressed={cuantos === x} onClick={() => setCuantos(x)} className="rounded border py-1.5 font-mono text-[13px] font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                {x}
              </button>
            ))}
          </div>
          <div className="px-1.5 pt-2 pb-1 text-[11px] font-bold tracking-[.08em] text-muted-foreground uppercase">¿Para qué cuadrilla?</div>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {vista.columnas.filter((x) => x.acepta).map((x) => (
              <button
                key={x.c}
                type="button"
                data-mi=""
                aria-label={x.nombre}
                onClick={() => {
                  const kid = menu.kid;
                  setMenu(null);
                  hoja({ accion: "contratista_sumar", fecha, cuadrilla: x.c, contratistaId: kid, n: cuantos });
                }}
                className="h-[30px] min-w-[30px] rounded-[5px] border-[1.5px] border-foreground/30 bg-card text-[13px] font-extrabold"
                style={{ color: colorCuadrilla(x.color).borde }}
              >
                {x.rotulo}
              </button>
            ))}
          </div>
        </MenuFlotante>
      )}

      <Mandar
        abierta={hojaLat === "mandar"}
        onCerrar={() => setHojaLat(null)}
        dia={dia}
        avisos={vista.avisos}
        onRevisar={() => {
          setHojaLat(null);
          resaltarAvisos();
        }}
        onUnoPorUno={() => setHojaLat("envio")}
      />
      <ListaEnvio abierta={hojaLat === "envio"} onCerrar={() => setHojaLat(null)} dia={dia} ahora={ahora} onCargarCelular={setCelular} />
      {hojaLat === "contratistas" && <HojaContratistas abierta onCerrar={() => setHojaLat(null)} dia={dia} foco={null} />}
      <DialogoCelular key={`celular-${celular ?? ""}`} dia={dia} pid={celular} onCerrar={() => setCelular(null)} />
    </PizarronCtx.Provider>
  );
}
