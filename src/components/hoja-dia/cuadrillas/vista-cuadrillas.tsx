"use client";

// La vista Cuadrillas de la Hoja del día (/planificacion/hoja?dia=…): la línea "Falta para
// mandar", una tarjeta por cuadrilla y el panel Gente. Es la maqueta aprobada (renderEsc +
// cuadrillasHTML) con los componentes de la app.
//
// TODA LA CUENTA ES DE estado.ts (y los textos de vista-cuadrillas.ts); TODO GESTO VA POR
// LOS HOOKS (use-hoja-dia), que muestran el aviso con "Deshacer" y refrescan el día. Esta
// pantalla sólo decide qué se abre y adónde va el foco.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  bandeja, cap, cola, cuadrillasActivas, cuadrillasConObras, diaSemana, esPasado, filasCamiones, hojaDe, hojaDeCuadrilla,
  nombreDe, patente, pendientesEnvio, persona, choferDelCamion, cNombre, type Boton, type ItemBandeja, type ModoPrecarga,
} from "@/lib/hoja-dia/estado";
import { cuadrillaDeTecla } from "@/lib/hoja-dia/vista-cuadrillas";
import {
  useAccionHoja, useAccionPedido, useAccionViaje, useAhora, useAvisosHojaDia, useDeshacer, useEnviar, useHojaDia, usePrecarga,
} from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AccionesHoja } from "@/components/hoja-dia/comunes/acciones-hoja";
import { BotonCoral } from "@/components/hoja-dia/comunes/boton-coral";
import { LineaBandeja, type ItemLinea } from "@/components/hoja-dia/comunes/linea-bandeja";
import { ListaEnvio } from "@/components/hoja-dia/comunes/lista-envio";
import { Historial } from "@/components/hoja-dia/comunes/historial";
import { ItemMenu, MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";
import { useDiaHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { Tarjeta } from "./tarjeta";
import { PanelGente } from "./panel-gente";
import { MenuPersona } from "./menu-persona";
import { MenuTarjeta } from "./menu-tarjeta";
import { HojaAusencias } from "./hoja-ausencias";
import { HojaInstrucciones } from "./hoja-instrucciones";
import { VerComo } from "./ver-como";
import { CerrarJornada, type PedidoCierre } from "./cerrar-jornada";
import { AvisoPrecarga, EstadoVacio } from "./estado-vacio";
import { DialogoCelular, DialogoMover, DialogoObra, type Mover } from "./dialogos";
import type { Arrastre, Control } from "./control";

type Hoja =
  | { t: "envio"; resaltar?: string | null }
  | { t: "aus" }
  | { t: "instr"; c: number }
  | { t: "ver"; c: number; p: string }
  | { t: "historial"; c: number };
type Menu =
  | { t: "persona"; c: number; p: string; el: HTMLElement }
  | { t: "tarjeta"; c: number; el: HTMLElement }
  | { t: "camion"; viajeId: string; el: HTMLElement | null };

const RUTA_CAMIONES = "/planificacion/hoja/camiones";

function aLinea(x: ItemBandeja): ItemLinea {
  return { k: x.k, t: x.t, corto: x.corto, bs: x.bs, c: x.c ?? null, tono: x.rojo ? "rojo" : x.gris ? "gris" : x.nivel === "aviso" || x.nivel === "amb" ? "amb" : "" };
}

export function VistaCuadrillas() {
  const router = useRouter();
  const { fecha } = useDiaHoja();
  const q = useHojaDia(fecha);
  const dia = q.data && q.data.fecha === fecha ? q.data : null;
  const ahora = useAhora(fecha);
  useAvisosHojaDia(fecha);

  const hoja = useAccionHoja(fecha);
  const viaje = useAccionViaje(fecha);
  const pedido = useAccionPedido(fecha);
  const enviar = useEnviar(fecha);
  const deshacer = useDeshacer(fecha);
  const precarga = usePrecarga(fecha);

  const [chEd, setChEd] = useState<Control["chEd"]>(null);
  const [editEnc, setEditEnc] = useState<number | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [faltaAbierta, setFaltaAbierta] = useState(false);
  const [hojaLat, setHojaLat] = useState<Hoja | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [mover, setMover] = useState<Mover | null>(null);
  const [celular, setCelular] = useState<string | null>(null);
  const [obra, setObra] = useState<number | null>(null);
  const [cierre, setCierre] = useState<PedidoCierre | null>(null);
  const [avisos, setAvisos] = useState<{ fecha: string; modo: ModoPrecarga; lista: string[] } | null>(null);
  const [precargando, setPrecargando] = useState<ModoPrecarga | null>(null);
  const timerFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pasado = esPasado(ahora);

  const llamarAtencion = useCallback((c: number, foco?: string) => {
    const el = document.getElementById(`card-${c}`);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    setFlash(c);
    if (timerFlash.current) clearTimeout(timerFlash.current);
    timerFlash.current = setTimeout(() => setFlash(null), 1200);
    if (foco) requestAnimationFrame(() => document.getElementById(foco)?.focus({ preventScroll: true }));
  }, []);

  const agregar = useCallback(
    (c: number, pid: string, opts?: { reemplaza?: string | null }) => {
      if (!dia) return;
      const de = hojaDe(dia, pid);
      if (de === c && !opts?.reemplaza) return;
      if (de != null && de !== c) {
        setMover({ pid, de, c, reemplaza: opts?.reemplaza ?? null });
        return;
      }
      hoja.mutate({ accion: "agregar", fecha, cuadrilla: c, personaId: pid, reemplaza: opts?.reemplaza ?? null });
    },
    [dia, fecha, hoja],
  );
  const soltarChofer = useCallback((c: number, ch: string) => hoja.mutate({ accion: "chofer", fecha, cuadrilla: c, choferId: ch }), [fecha, hoja]);

  const irCamiones = useCallback((extra = "") => router.push(`${RUTA_CAMIONES}?dia=${fecha}${extra}`), [fecha, router]);

  const boton = useCallback(
    (b: Boton) => {
      if (!dia) return;
      const c = b.c ?? null;
      switch (b.a) {
        case "sacar": if (b.p) hoja.mutate({ accion: "sacar", fecha, personaId: b.p }); return;
        case "usarCargo": if (c != null && b.p) hoja.mutate({ accion: "a_cargo", fecha, cuadrilla: c, personaId: b.p }); return;
        case "agregar": if (c != null && b.p) agregar(c, b.p); return;
        case "focoAgregar": if (c != null) llamarAtencion(c, `ag-${c}`); return;
        case "chEd": if (c != null) { setChEd({ c, foco: b.foco }); llamarAtencion(c); } return;
        case "pasarChofer": if (c != null && b.from != null) hoja.mutate({ accion: "pasar_chofer", fecha, cuadrilla: c, desde: b.from }); return;
        case "irA": if (c != null) llamarAtencion(c); else if (b.veh) irCamiones(`&veh=${b.veh}`); else setFaltaAbierta(true); return;
        case "verCamion": irCamiones(b.veh ? `&veh=${b.veh}` : ""); return;
        case "verViaje": irCamiones(b.id ? `&viaje=${b.id}` : ""); return;
        case "irCamiones": case "esperar": case "poner": case "fleteDe": irCamiones(b.id ? `&pedido=${b.id}` : ""); return;
        case "tablero": router.push(`/planificacion`); return;
        case "elegirChoferViaje": if (b.id) setMenu({ t: "camion", viajeId: b.id, el: document.activeElement as HTMLElement | null }); return;
        case "vuelvenSolos": if (c != null) viaje.mutate({ accion: "vuelven_solos", fecha, cuadrilla: c }); return;
        case "okTodo": if (b.id) viaje.mutate({ accion: "ok_todo_el_dia", viajeId: b.id }); return;
        case "volverCola": if (b.id) viaje.mutate({ accion: "volver_a_cola", viajeId: b.id }); return;
        case "marcarHecho": if (b.id) viaje.mutate({ accion: "hecho", viajeId: b.id }); return;
        case "pasarManana": if (b.id) pedido.mutate({ accion: "pasar_a_manana", pedidoId: b.id }); return;
        case "avisarChofer": case "abrirEnvio": case "avisarTarde": setHojaLat({ t: "envio", resaltar: b.p ?? null }); return;
        case "reenviar": {
          if (!b.p) return;
          const tg = !!persona(dia, b.p)?.telegram && dia.telegram.configurado;
          if (!tg) { setHojaLat({ t: "envio", resaltar: b.p }); return; }
          enviar.mutate({ accion: "reenviar", fecha, personaId: b.p, canal: "telegram" }, {
            onSuccess: (r) => toast(r.texto, r.historialId ? { duration: 9000, action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) } } : undefined),
          });
          return;
        }
        case "llamar": {
          const tel = persona(dia, b.p)?.celular;
          if (tel) window.location.href = `tel:${tel.replace(/[^\d+]/g, "")}`;
          else toast.error(`${nombreDe(dia, b.p) || "Esa persona"} no tiene celular cargado`);
          return;
        }
        case "dlgCel": if (b.p) setCelular(b.p); return;
        case "liberar": if (c != null) hoja.mutate({ accion: "liberar", fecha, cuadrilla: c }); return;
        default: toast.error(`No sé hacer «${b.l}» desde acá`);
      }
    },
    [agregar, deshacer, dia, enviar, fecha, hoja, irCamiones, llamarAtencion, pedido, router, viaje],
  );

  // Teclado: G enfoca el buscador de Gente; con un nombre elegido, 1–5 lo manda a esa
  // cuadrilla (un chofer entra como chofer). No con un campo, un menú o una hoja abiertos.
  const algoAbierto = !!(hojaLat || menu || mover || celular || obra != null || cierre);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!dia || algoAbierto || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (ev.key === "g" || ev.key === "G") {
        ev.preventDefault();
        document.getElementById("g-buscar")?.focus();
        return;
      }
      if (ev.key === "Escape" && sel) {
        setSel(null);
        return;
      }
      if (/^[1-9]$/.test(ev.key) && !pasado) {
        const pid = sel ?? (t?.id?.startsWith("pp-") ? t.id.slice(3) : null);
        const c = cuadrillaDeTecla(dia, Number(ev.key));
        if (!pid || c == null) return;
        ev.preventDefault();
        setSel(null);
        if (persona(dia, pid)?.esChofer) soltarChofer(c, pid);
        else agregar(c, pid);
        requestAnimationFrame(() => document.getElementById(`pp-${pid}`)?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agregar, algoAbierto, dia, pasado, sel, soltarChofer]);

  // Al cambiar de día se cierra lo abierto.
  const [fechaVista, setFechaVista] = useState(fecha);
  if (fechaVista !== fecha) {
    setFechaVista(fecha);
    setChEd(null);
    setEditEnc(null);
    setSel(null);
    setHojaLat(null);
    setMenu(null);
  }

  if (q.isError && !dia) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-8">
        <h2 className="text-lg font-semibold">No se pudo leer la hoja del día.</h2>
        <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
        <Button variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
      </div>
    );
  }
  if (!dia) {
    return (
      <div className="grid gap-2.5" aria-busy="true" aria-label="Cargando la hoja del día">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-[11px]" />
          ))}
        </div>
      </div>
    );
  }

  const ctl: Control = {
    dia, ahora, pasado, boton, agregar, soltarChofer,
    abrirMenuPersona: (c, p, el) => setMenu({ t: "persona", c, p, el }),
    abrirMenuTarjeta: (c, el) => setMenu({ t: "tarjeta", c, el }),
    abrirObra: (otId) => setObra(otId),
    abrirInstrucciones: (c) => setHojaLat({ t: "instr", c }),
    abrirEnvio: (p) => setHojaLat({ t: "envio", resaltar: p ?? null }),
    verComo: (c, p) => setHojaLat({ t: "ver", c, p }),
    cerrarJornada: (c, otId) => setCierre({ c, otId: otId ?? null }),
    chEd, setChEd, editEnc, setEditEnc, arrastre, setArrastre, sel, setSel, flash,
  };

  const hayHojas = cuadrillasActivas(dia).length > 0;
  const b = hayHojas ? bandeja(dia, ahora) : null;
  const pend = hayHojas && !pasado ? pendientesEnvio(dia) : { sinEnv: 0, cambios: 0 };
  const colaVos = !pasado ? cola(dia, ahora).vos : [];
  const frena = colaVos.some((x) => x.p.urgencia === "frena");
  const sinObras = cuadrillasConObras(dia).length ? dia.cuadrillas.filter((x) => !cuadrillasConObras(dia).includes(x.odooId) && !x.tercerizada) : [];

  const precargar = (modo: ModoPrecarga) => {
    setPrecargando(modo);
    precarga.mutate(
      { fecha, modo },
      {
        onSettled: () => setPrecargando(null),
        onSuccess: (r) => {
          const lista = Array.isArray(r.avisos) ? (r.avisos as string[]) : [];
          setAvisos({ fecha, modo, lista });
          toast(r.texto, r.historialId ? { duration: 9000, action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) } } : undefined);
        },
      },
    );
  };

  // La línea de la bandeja.
  let linea: React.ReactNode = null;
  if (b && !pasado) {
    const etiqueta = b.algunaEnviada ? `${cap(diaSemana(fecha))} ${Number(fecha.slice(8))}:` : "Falta para mandar:";
    const rojosEsp = b.esp.filter((x) => x.rojo);
    const MAX = 3;
    let resumen: React.ReactNode = null;
    let chips: { it: ItemLinea; bmax?: number }[] = [];
    let mas = 0;
    let ok: React.ReactNode = null;
    if (b.vos.length) {
      const items = [...b.vos, ...rojosEsp].map(aLinea);
      resumen = <><b>{b.vos.length}</b> para hacer vos{b.esp.length ? ` · ${b.esp.length} esperando` : ""}</>;
      chips = items.slice(0, MAX).map((it) => ({ it }));
      mas = Math.max(0, items.length - MAX);
    } else if (b.esp.length) {
      resumen = <>Nada para hacer vos{b.listas.length ? <> · <b>{b.listas.length}</b> recibidas</> : ""}</>;
      chips = [...rojosEsp.map((x) => ({ it: aLinea(x), bmax: 2 })), ...b.esp.filter((x) => !x.rojo).map((x) => ({ it: { ...aLinea(x), bs: [] }, bmax: 0 }))];
    } else ok = <span className="font-semibold text-hd-verde">{b.algunaEnviada ? "todas recibidas" : "Todo listo para mandar"}</span>;
    const alarma = dia.parametros.horaAlarmaNoAbierta;
    linea = (
      <LineaBandeja
        etiqueta={etiqueta}
        ariaLabel="Bandeja del día"
        resumen={resumen}
        chips={chips}
        mas={mas}
        ok={ok}
        abierta={faltaAbierta}
        onToggle={() => setFaltaAbierta((v) => !v)}
        onIr={(it) => (it.c != null ? llamarAtencion(it.c) : setFaltaAbierta(true))}
        onBoton={boton}
        grupos={[
          { titulo: "Para hacer vos", items: b.vos.map(aLinea), vacio: "Nada." },
          { titulo: "Esperando al capataz o al chofer", items: b.esp.map((x) => ({ ...aLinea(x), sub: x.rojo && x.k.startsWith("na-") ? `· pasó la hora de alarma (${alarma})` : undefined })), vacio: "Nadie." },
          { titulo: "Listas", items: b.listas.map((x, i) => ({ k: `l${i}`, t: x.t, bs: [] })), vacio: "Todavía ninguna recibida.", soloTexto: true },
        ]}
      />
    );
  }

  const coral = pend.sinEnv ? "Enviar a los capataces" : pend.cambios ? `Avisar cambios (${pend.cambios})` : null;
  const menuCamion = menu?.t === "camion" ? menu : null;

  return (
    <div className="@container grid min-w-0 gap-2.5">
      <AccionesHoja>
        {b && (
          <span className="text-[13px] whitespace-nowrap text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
            <b>{b.listasN} de {b.total}</b> listas · <b>{b.enviadas}</b> enviadas
            {!pasado && (
              <>
                {" "}· Pedidos:{" "}
                <button type="button" onClick={() => irCamiones()} className={cn("underline decoration-foreground/30 underline-offset-[3px] hover:decoration-current", frena ? "font-semibold text-hd-rojo" : "text-foreground")}>
                  {colaVos.length ? `${colaVos.length} sin camión` : "ninguno sin camión"}
                </button>
              </>
            )}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2 md:ml-auto max-md:w-full">
          <Button variant="outline" className="h-8 max-md:h-10 max-md:flex-1" onClick={() => setHojaLat({ t: "aus" })}>Ausencias</Button>
          {hayHojas && !coral && <Button variant="outline" className="h-8 max-md:h-10 max-md:flex-1" onClick={() => setHojaLat({ t: "envio" })}>Ver envíos</Button>}
          {coral && <BotonCoral onClick={() => setHojaLat({ t: "envio" })}>{coral}</BotonCoral>}
        </span>
      </AccionesHoja>

      {linea}
      {pasado && hayHojas && (
        <div className="rounded-[10px] border bg-hd-card2 py-1.5 pr-2.5 pl-3.5 text-[13px] text-muted-foreground">
          <b className="font-semibold text-foreground">{cap(diaSemana(fecha))} {Number(fecha.slice(8))}: sólo lectura.</b> Lo que pasó lo dicen los partes y la asistencia.
        </div>
      )}
      {hayHojas && avisos?.fecha === fecha && !pasado && <AvisoPrecarga modo={avisos.modo} avisos={avisos.lista} onEntendido={() => setAvisos(null)} />}

      <div className="grid items-start gap-3.5 @min-[1000px]:grid-cols-[minmax(0,1fr)_272px]">
        <section aria-label="Hojas por cuadrilla" className="grid items-start gap-2.5 @min-[700px]:grid-cols-2 @min-[1140px]:grid-cols-3">
          {hayHojas ? (
            <>
              {cuadrillasActivas(dia).map((c, i) => (
                <Tarjeta key={c} ctl={ctl} c={c} indice={i} />
              ))}
              {cuadrillasConObras(dia).filter((c) => !hojaDeCuadrilla(dia, c)).map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-2 rounded-[11px] border border-dashed p-3 text-[13px] text-muted-foreground">
                  <span className="flex-1">La {cNombre(dia, c)} entró al tablero después de armar las hojas.</span>
                  {!pasado && <Button size="sm" variant="outline" onClick={() => hoja.mutate({ accion: "crear_hoja", fecha, cuadrilla: c })}>Armar su hoja</Button>}
                </div>
              ))}
              {sinObras.length > 0 && (
                <p className="col-span-full px-1 text-xs text-muted-foreground">
                  Sin obras el {diaSemana(fecha)}: {sinObras.map((x) => x.nombre).join(", ")} (no tiene hoja).
                </p>
              )}
            </>
          ) : (
            <EstadoVacio dia={dia} pasado={pasado} onPrecarga={precargar} cargando={precargando} />
          )}
        </section>
        <PanelGente ctl={ctl} />
      </div>

      {precargando && (
        <div role="status" className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm text-background shadow-lg">
          <Loader2 className="size-4 animate-spin" /> Armando las hojas…
        </div>
      )}

      {menu?.t === "persona" && <MenuPersona key={`${menu.c}-${menu.p}`} ctl={ctl} c={menu.c} pid={menu.p} anchor={menu.el} onCerrar={() => setMenu(null)} />}
      {menu?.t === "tarjeta" && <MenuTarjeta ctl={ctl} c={menu.c} anchor={menu.el} onCerrar={() => setMenu(null)} onHistorial={(c) => setHojaLat({ t: "historial", c })} />}
      {menuCamion && (
        <MenuFlotante abierto anchor={menuCamion.el} onCerrar={() => setMenu(null)} label="Elegir camión" encabezado={<b className="font-semibold">¿Quién lo hace?</b>}>
          {filasCamiones(dia).filter((v) => v !== "flete").map((veh) => (
            <ItemMenu
              key={veh}
              detalle={nombreDe(dia, choferDelCamion(dia, veh)) || "sin chofer"}
              onClick={() => {
                setMenu(null);
                viaje.mutate({ accion: "mover", viajeId: menuCamion.viajeId, vehiculoId: veh });
              }}
            >
              {patente(dia, veh) || veh}
            </ItemMenu>
          ))}
        </MenuFlotante>
      )}

      <ListaEnvio abierta={hojaLat?.t === "envio"} onCerrar={() => setHojaLat(null)} dia={dia} ahora={ahora} resaltar={hojaLat?.t === "envio" ? hojaLat.resaltar : null} onCargarCelular={setCelular} />
      <HojaAusencias abierta={hojaLat?.t === "aus"} onCerrar={() => setHojaLat(null)} dia={dia} />
      {hojaLat?.t === "instr" && <HojaInstrucciones abierta onCerrar={() => setHojaLat(null)} dia={dia} c={hojaLat.c} pasado={pasado} />}
      {hojaLat?.t === "ver" && <VerComo abierta onCerrar={() => setHojaLat(null)} dia={dia} ahora={ahora} pid={hojaLat.p} />}
      {hojaLat?.t === "historial" && (
        <Historial
          abierta
          onCerrar={() => setHojaLat(null)}
          titulo={`Historial · ${cNombre(dia, hojaLat.c)}`}
          fecha={fecha}
          filtro={hojaDeCuadrilla(dia, hojaLat.c) ? { hojaId: hojaDeCuadrilla(dia, hojaLat.c)!.id } : null}
        />
      )}

      <DialogoMover
        dia={dia}
        mover={mover}
        onCerrar={() => setMover(null)}
        onPasar={(m) => {
          setMover(null);
          hoja.mutate({ accion: "agregar", fecha, cuadrilla: m.c, personaId: m.pid, reemplaza: m.reemplaza });
        }}
      />
      <DialogoCelular key={celular ?? "-"} dia={dia} pid={celular} onCerrar={() => setCelular(null)} />
      <DialogoObra dia={dia} otId={obra} onCerrar={() => setObra(null)} />
      <CerrarJornada key={cierre ? `${cierre.c}-${cierre.otId ?? ""}` : "-"} dia={dia} pedido={cierre} onCerrar={() => setCierre(null)} />
    </div>
  );
}
