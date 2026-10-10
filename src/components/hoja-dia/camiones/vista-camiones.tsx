"use client";

// La vista Camiones de la Hoja del día: el despacho en vivo (§9). A la izquierda la cola de
// Pedidos, a la derecha una fila por camión; arriba la línea "Ahora:". Es la pantalla del
// coordinador de 7 a 17 y la de la tarde anterior para ordenar los viajes de mañana.
//
// Todas las cuentas salen de estado.ts / camiones.ts con el día que trae useHojaDia y la
// hora de useAhora; cada gesto es un POST de los hooks del contrato con su Deshacer. Lo de
// acá es pantalla: qué está abierto, el modo "poner en un camión" y el teclado:
//   N  Nuevo pedido · L  lista/línea de tiempo · 1–4  el camión sugerido · Esc  cancela.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAhora, useAvisosHojaDia, useEnviar, useHojaDia } from "@/hooks/use-hoja-dia";
import { camionesQueSirven, esHoy, esPasado, nombreDe, persona, recibeDe, todoVeh, type Boton } from "@/lib/hoja-dia/estado";
import { horaSoltada, ordenEnFila } from "@/lib/hoja-dia/camiones";
import type { DiaHoja, Fecha } from "@/lib/hoja-dia/tipos";
import { AccionesHoja } from "@/components/hoja-dia/comunes/acciones-hoja";
import { BotonCoral } from "@/components/hoja-dia/comunes/boton-coral";
import { useDiaHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { CamionesCtx, type Ctx, type MenuAbierto } from "./contexto";
import { useAvisar } from "./avisar";
import { useGestos } from "./gestos";
import { LineaAhora } from "./linea-ahora";
import { ColaPedidos } from "./cola-pedidos";
import { FilasCamiones } from "./filas-camiones";
import { Menus, type AbrirDialogo } from "./menus";
import { Dialogos, type Dlg } from "./dialogos";
import { NuevoPedido, type PrefPedido } from "./nuevo-pedido";
import { ListaCarga } from "./lista-carga";
import { Kbd } from "./kbd";

export function VistaCamiones() {
  const { fecha, irA } = useDiaHoja();
  const q = useHojaDia(fecha);
  const ahora = useAhora(fecha);
  useAvisosHojaDia(fecha);

  if (!q.data) {
    if (q.error) {
      return (
        <div role="alert" className="rounded-xl border p-6 text-sm">
          <p className="font-medium">No se pudo leer la hoja del día.</p>
          <p className="mt-1 text-muted-foreground">{q.error.message}</p>
          <Button className="mt-3" variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
        </div>
      );
    }
    return (
      <div className="grid gap-3.5" aria-busy>
        <Skeleton className="h-10 rounded-[10px]" />
        <div className="grid gap-3.5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }
  return <Pantalla dia={q.data} fecha={fecha} ahora={ahora} irA={irA} cargando={q.isFetching && q.data.fecha !== fecha} />;
}

export function Pantalla({ dia, fecha, ahora, irA, cargando }: { dia: DiaHoja; fecha: Fecha; ahora: number; irA: (f: Fecha) => void; cargando?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(1280);
  const [listaL, setListaL] = useState(false);
  const [ponerSel, setPonerRaw] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [volverA, setVolverA] = useState<HTMLElement | null>(null);
  const [nuevo, setNuevo] = useState<PrefPedido | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [carga, setCarga] = useState(false);
  const focoPoner = useRef(false);

  // Si el pedido elegido ya no está para poner (lo puso otro, se anuló), no hay modo "poner".
  const pSel = ponerSel ? dia.pedidos.find((x) => x.id === ponerSel) : null;
  const poner = ponerSel && !(pSel && (pSel.viajeId || pSel.estado === "anulado")) ? ponerSel : null;
  const hoy = esHoy(ahora);
  const pasado = esPasado(ahora);
  const angosta = ancho < 760;
  const dosCol = ancho >= 1060;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const avisos = useAvisar(dia, fecha, ahora);
  const g = useGestos(dia, fecha, avisos.avisar);
  const enviar = useEnviar(fecha);

  const mostrar = useCallback((domId: string) => {
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.animate?.([{ boxShadow: "0 0 0 3px var(--primary)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200, easing: "ease-out" });
  }, []);

  const setPoner = useCallback((id: string | null) => {
    setPonerRaw(id);
    focoPoner.current = !!id;
  }, []);
  // Al elegir un pedido, el foco va al primer "Poner acá" (cuando el pedido ya está en el día).
  useEffect(() => {
    if (!poner || !focoPoner.current) return;
    if (!dia.pedidos.some((p) => p.id === poner)) return;
    focoPoner.current = false;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-poner-aca][data-k="1"]')?.focus({ preventScroll: true });
      mostrar(`ped-${poner}`);
    });
  }, [poner, dia, mostrar]);

  const abrirDialogo = useCallback((d: Dlg, el?: HTMLElement | null) => {
    setVolverA(el ?? (document.activeElement as HTMLElement | null));
    setDlg(d);
  }, []);

  const ponerEn = useCallback<Ctx["ponerEn"]>((veh, orden, sobre, pedidoId) => {
    const pid = pedidoId ?? poner;
    if (!pid) return;
    const td = todoVeh(dia, veh);
    if (td != null && !sobre) {
      setPonerRaw(pid);
      abrirDialogo({ t: "todo", veh, c: td, pedidoId: pid, orden: orden ?? null }, document.getElementById(`row-${veh}`));
      return;
    }
    setPonerRaw(null);
    g.viaje({ accion: "poner_pedido", pedidoId: pid, vehiculoId: veh, sobre: sobre ?? null, orden: orden ?? null }, () => {
      requestAnimationFrame(() => mostrar(`row-${veh}`));
    });
  }, [poner, dia, g, abrirDialogo, mostrar]);

  /** "Sacarlo un rato y avisar a Sack": se pone igual, queda marcado y se avisa al capataz (Telegram o a mano). */
  const sacarUnRato = useCallback(async (viajeId: string) => {
    g.viaje({ accion: "ok_todo_el_dia", viajeId }, () => {
      avisos.avisarMensaje("sacar_rato", { viajeId }, "Avisar al capataz", "Al capataz de la cuadrilla que se queda un rato sin su camión.");
    }, false);
  }, [g, avisos]);

  const moverViaje = useCallback<Ctx["moverViaje"]>((viajeId, veh, m) => {
    const v = dia.viajes.find((x) => x.id === viajeId);
    if (!v) return;
    if (!veh) return void g.viaje({ accion: "volver_a_cola", viajeId });
    if (v.hora && m != null) g.viaje({ accion: "mover", viajeId, vehiculoId: veh, hora: horaSoltada(m) });
    else g.viaje({ accion: "mover", viajeId, vehiculoId: veh, orden: m != null ? ordenEnFila(dia, veh, m, viajeId) : null });
  }, [dia, g]);

  const llamar = useCallback((pid: string | null) => {
    const cel = persona(dia, pid)?.celular;
    if (!cel) return void toast.error(`${nombreDe(dia, pid) || "Esa persona"} no tiene celular cargado`);
    window.location.href = `tel:${cel.replace(/[^\d+]/g, "")}`;
  }, [dia]);

  const verComo = useCallback((pid: string) => {
    // La misma vista del link (§12): se abre el link de la persona en otra pestaña.
    const w = window.open("about:blank", "_blank");
    enviar.mutate({ accion: "preparar", fecha, personaId: pid }, {
      onSuccess: (r) => {
        const link = (r as unknown as { link: string | null }).link;
        if (link && w) w.location.href = link;
        else { w?.close(); toast.error("No hay link para ver todavía"); }
      },
      onError: () => w?.close(),
    });
  }, [enviar, fecha]);

  const boton = useCallback<Ctx["boton"]>((b: Boton, el) => {
    switch (b.a) {
      case "esperar":
        if (b.id) setMenu({ t: "ped", id: b.id, paso: "esperar", anchor: document.getElementById(`pm-${b.id}`) ?? el ?? document.body });
        return;
      case "llamar": return llamar(b.p ?? null);
      case "poner": if (b.id) setPoner(b.id); return;
      case "pasarManana": if (b.id) g.pedido({ accion: "pasar_a_manana", pedidoId: b.id }); return;
      case "fleteDe": return abrirDialogo({ t: "flete", pedidoId: b.id }, el);
      case "avisarChofer": case "abrirEnvio": if (b.p) avisos.avisar(b.p); return;
      case "reenviar":
        if (b.p) enviar.mutate({ accion: "reenviar", fecha, personaId: b.p, canal: persona(dia, b.p)?.telegram && dia.telegram.configurado ? "telegram" : "manual" }, { onSuccess: (r) => void toast(r.texto) });
        return;
      case "avisarTarde": {
        // Un mensaje al capataz (Telegram o a mano), no sólo llamarlo.
        if (b.id) avisos.avisarMensaje("tarde", { viajeId: b.id }, "Avisar que llega tarde");
        return;
      }
      case "marcarHecho": if (b.id) g.viaje({ accion: "hecho", viajeId: b.id }); return;
      case "okTodo": if (b.id) void sacarUnRato(b.id); return;
      case "volverCola": if (b.id) g.viaje({ accion: "volver_a_cola", viajeId: b.id }); return;
      case "verViaje": case "elegirChoferViaje": {
        if (!b.id) return;
        const f = document.getElementById(`vf-${b.id}`);
        if (f) mostrar(`vf-${b.id}`);
        setMenu({ t: "viaje", id: b.id, anchor: f && f.offsetParent ? f : el ?? document.body, paso: b.a === "elegirChoferViaje" ? "pasar" : undefined });
        return;
      }
      case "verCamion": if (b.veh) mostrar(`row-${b.veh}`); return;
      case "vuelvenSolos":
        if (b.c != null) {
          const c = b.c;
          g.viaje({ accion: "vuelven_solos", fecha, cuadrilla: c }, () => {
            if (recibeDe(dia, c)) avisos.avisarMensaje("vuelven_solos", { cuadrilla: c }, `Avisar a ${nombreDe(dia, recibeDe(dia, c))}`);
          });
        }
        return;
      case "irCamiones": return;
      case "tablero": window.location.href = "/planificacion"; return;
      default:
        // Lo de la hoja de una cuadrilla (sacar, poner a cargo, chofer…) se hace en Cuadrillas.
        window.location.href = `/planificacion/hoja?dia=${fecha}`;
    }
  }, [dia, fecha, g, avisos, enviar, llamar, mostrar, abrirDialogo, setPoner, sacarUnRato]);

  // I10: los links desde Cuadrillas (y la campanita) traen a qué ir: ?veh= (la fila del
  // camión), ?viaje= (la ficha, con su menú) o ?pedido= (resaltado; con &hacer=poner |
  // esperar | flete, lo que se pidió). Se hace una vez por link y se limpia la URL.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const focoUrl = useRef<string | null>(null);
  useEffect(() => {
    const veh = params.get("veh"), viajeId = params.get("viaje"), pedidoId = params.get("pedido"), hacer = params.get("hacer");
    if (!veh && !viajeId && !pedidoId) return;
    const k = `${dia.fecha}|${veh}|${viajeId}|${pedidoId}|${hacer}`;
    if (focoUrl.current === k) return;
    focoUrl.current = k;
    const qs = new URLSearchParams(params.toString());
    for (const x of ["veh", "viaje", "pedido", "hacer"]) qs.delete(x);
    requestAnimationFrame(() => {
      if (viajeId && dia.viajes.some((v) => v.id === viajeId)) boton({ l: "", a: "verViaje", id: viajeId }, null);
      else if (pedidoId && dia.pedidos.some((p) => p.id === pedidoId)) {
        if (hacer === "poner" && !pasado) setPoner(pedidoId);
        else if (hacer === "esperar" && !pasado) { mostrar(`ped-${pedidoId}`); boton({ l: "", a: "esperar", id: pedidoId }, document.getElementById(`ped-${pedidoId}`)); }
        else if (hacer === "flete" && !pasado) abrirDialogo({ t: "flete", pedidoId }, document.getElementById(`ped-${pedidoId}`));
        else mostrar(`ped-${pedidoId}`);
      } else if (veh) mostrar(`row-${veh}`);
      else toast("Eso ya no está en la hoja de este día.");
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    });
  }, [params, dia, pasado, boton, setPoner, mostrar, abrirDialogo, router, pathname]);

  const nuevoPedido = useCallback((pref?: PrefPedido) => {
    setVolverA(document.activeElement as HTMLElement | null);
    setNuevo(pref ?? null);
    setNuevoAbierto(true);
  }, []);

  // El teclado de la vista (fuera de campos y de lo que esté abierto).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (menu || dlg || nuevoAbierto || carga || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (e.key === "Escape" && poner) {
        e.preventDefault();
        const id = poner;
        setPonerRaw(null);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-poner="${CSS.escape(id)}"]`)?.focus());
        return;
      }
      if ((e.key === "n" || e.key === "N") && !pasado) { e.preventDefault(); nuevoPedido(); return; }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); setListaL((x) => !x); return; }
      if (/^[1-4]$/.test(e.key) && poner) {
        const p = dia.pedidos.find((x) => x.id === poner);
        if (!p) return;
        const o = camionesQueSirven(dia, p, ahora).orden[Number(e.key) - 1];
        if (o) { e.preventDefault(); ponerEn(o.veh); }
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [menu, dlg, nuevoAbierto, carga, poner, pasado, dia, ahora, ponerEn, nuevoPedido]);

  const ctx: Ctx = useMemo(() => ({
    dia, fecha, ahora, hoy, pasado, angosta, lista: listaL, poner, setPoner, ponerEn,
    abrirMenu: setMenu, boton, avisar: avisos.avisar, nuevoPedido,
    abrirFlete: (pedidoId?: string) => abrirDialogo({ t: "flete", pedidoId }),
    moverViaje, volverACola: (id: string) => g.viaje({ accion: "volver_a_cola", viajeId: id }),
    viaje: g.viaje, pedido: g.pedido, mostrar,
  }), [dia, fecha, ahora, hoy, pasado, angosta, listaL, poner, setPoner, ponerEn, boton, avisos.avisar, nuevoPedido, abrirDialogo, moverViaje, g, mostrar]);

  // La lista de carga completa al depósito (Telegram si está en los parámetros; si no, a mano).
  const avisarDepositoLista = () => avisos.avisarMensaje("lista_carga", {}, "Avisar al depósito", "La lista completa, para el que prepara la carga.");

  return (
    <CamionesCtx.Provider value={ctx}>
      <AccionesHoja>
        <span className="hidden flex-1 md:block" />
        {!pasado && dia.cajon.length > 0 && (
          <Button type="button" variant="outline" className="h-9 max-md:flex-1" aria-haspopup="menu" onClick={(e) => setMenu({ t: "cajon", anchor: e.currentTarget })}>
            Cajón del tablero ({dia.cajon.length})
          </Button>
        )}
        <Button type="button" variant="outline" className="h-9 max-md:flex-1" onClick={() => setCarga(true)}>Lista de carga</Button>
        {!angosta && (
          <Button type="button" variant="outline" className="h-9" aria-pressed={listaL} onClick={() => setListaL(!listaL)}>
            {listaL ? "Ver línea de tiempo" : "Ver como lista"} <Kbd>L</Kbd>
          </Button>
        )}
        {!pasado && (
          <BotonCoral type="button" className="max-md:basis-full" onClick={() => nuevoPedido()}>
            Nuevo pedido <Kbd>N</Kbd>
          </BotonCoral>
        )}
      </AccionesHoja>

      <div ref={root} className={cn("grid min-w-0 gap-3.5 transition-opacity", cargando && "opacity-60")} aria-busy={cargando || undefined}>
        <LineaAhora />
        <div className={cn("grid items-start gap-3.5", dosCol ? "grid-cols-[300px_minmax(0,1fr)]" : "grid-cols-1")}>
          <ColaPedidos />
          <FilasCamiones />
        </div>
      </div>

      <Menus
        m={menu}
        cerrar={() => setMenu(null)}
        dialogo={(d: AbrirDialogo, el) => abrirDialogo(d, el)}
        verComo={verComo}
        llamar={llamar}
      />
      <Dialogos
        d={dlg}
        cerrar={() => setDlg(null)}
        volverA={volverA}
        alElegirOtro={() => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-poner-aca][data-k="1"]')?.focus())}
        alSacarUnRato={(d) => {
          setPonerRaw(null);
          g.viaje({ accion: "poner_pedido", pedidoId: d.pedidoId, vehiculoId: d.veh, orden: d.orden }, (r) => {
            if (typeof r.viajeId === "string") void sacarUnRato(r.viajeId);
          });
        }}
      />
      <NuevoPedido
        abierto={nuevoAbierto}
        pref={nuevo}
        cerrar={() => setNuevoAbierto(false)}
        alGuardar={(id, f, conPoner) => {
          setNuevoAbierto(false);
          if (f !== fecha) irA(f);
          if (conPoner) setPoner(id);
          else requestAnimationFrame(() => mostrar(`ped-${id}`));
        }}
      />
      <ListaCarga abierta={carga} cerrar={() => setCarga(false)} avisarDeposito={avisarDepositoLista} />
      {avisos.dialogo}
    </CamionesCtx.Provider>
  );
}
