"use client";

// Las fichas del Pizarrón (maqueta: personChip, truckChip, ctChips): persona (apellido, ★ a
// cargo tocable, volante si maneja), camión (marca + patente, color fijo, chofer arrastrable
// adentro, horario editable en el lugar, "Recorrido") y contratista ("+3 de Quintana" con − / +).
// En una columna, el ⋯ de la persona y el nombre del contratista abren su menú.
//
// Toda ficha se arrastra (dnd-kit: mouse, dedo con 200 ms de espera, teclado con Espacio) y
// se elige con un toque (después se toca el destino). Con foco, 1–5 la manda a esa cuadrilla y
// B a "Sin asignar". Los botones de adentro (`data-no-drag`) no arrancan un arrastre.

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Clock, Minus, MoreVertical, Plus, Route, Star } from "lucide-react";
import { IconoVehiculo } from "./icono-vehiculo";
import type { Destino, Origen } from "@/lib/hoja-dia/gestos-pizarron";
import type { FichaCamion, FichaContratista, FichaPersona, FormaVehiculo } from "@/lib/hoja-dia/pizarron";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { cn } from "@/lib/utils";
import { MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";
import { mismoDestino, useFicha, usePizarron } from "./contexto";

/** El volante de la maqueta (lucide no tiene uno). */
export function IconoVolante({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3.5 shrink-0 fill-none stroke-current", className)} strokeWidth={1.7} strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M2.3 7h4.1M9.6 7h4.1M8 9.6V14" />
    </svg>
  );
}

export const colorCamion = (i: number) => colorCuadrilla(i + 3).borde;

const BASE =
  "relative flex min-h-9 cursor-grab touch-manipulation items-center gap-1.5 rounded-md border border-foreground/25 bg-card px-2 text-left shadow-xs outline-none transition-[border-color,box-shadow,background-color] select-none [-webkit-touch-callout:none] hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50";
const ELEGIDA = "outline-[2.5px] outline-offset-1 outline-primary outline shadow-lg";

/** Une el onKeyDown propio (teclas 1–5 / D / B, Enter = tocar) con el del sensor de teclado. */
function teclas(propio: (e: ReactKeyboardEvent) => void, deDnd: ((e: ReactKeyboardEvent) => void) | undefined) {
  return (e: ReactKeyboardEvent) => {
    propio(e);
    if (!e.defaultPrevented) deDnd?.(e);
  };
}

/** Lo común de una ficha: arrastrar, tocar (elegir o soltar acá lo elegido) y las teclas. */
function useComportamiento(id: string, origen: Origen, destino: Destino | null, destinoToque: Destino | null) {
  const ctx = usePizarron();
  const { ref, attributes, listeners: escuchas, arrastrando, encima } = useFicha(id, origen, destino, ctx.soloLectura);
  const elegida = ctx.sel?.k === id;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ctx.soloLectura) return;
    if (ctx.sel && ctx.sel.k !== id && destinoToque && ctx.tocar(destinoToque)) return;
    ctx.elegir(origen, id);
  };
  const listeners = escuchas as Record<string, (e: never) => void> | undefined;
  const onKeyDown = teclas((e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
      return;
    }
    ctx.teclear(origen, id, e);
  }, listeners?.onKeyDown as ((e: ReactKeyboardEvent) => void) | undefined);
  return { ref, arrastrando, encima, ctx, elegida, props: { ...attributes, ...escuchas, onKeyDown, onClick, "data-arrastrable": "" } };
}

// ─── Persona ────────────────────────────────────────────────────────────────

export function FichaPersonaUI({ f, c, donde, motivo, ausenciaId }: {
  f: FichaPersona;
  /** La columna donde está (si está en una). */
  c?: number;
  donde: "col" | "sin" | "no";
  motivo?: string;
  ausenciaId?: string | null;
}) {
  const origen: Origen = { k: "persona", pid: f.pid };
  const id = `p:${f.pid}`;
  const destino: Destino | null = donde === "col" && c != null ? { k: "gente", c, sobre: f.pid } : null;
  const toque: Destino = donde === "col" && c != null ? { k: "gente", c, sobre: f.pid } : donde === "sin" ? { k: "sin" } : { k: "no" };
  const { ref, props, ctx, elegida, arrastrando, encima } = useComportamiento(id, origen, destino, toque);
  const a = ctx.arrastre?.origen;
  const reemplaza = encima && a && (a.k === "persona" || a.k === "chofer") && a.pid !== f.pid;
  return (
    <div
      ref={ref}
      {...props}
      data-flip={id}
      title={f.completo}
      aria-label={`${f.completo}${f.aCargo ? ", a cargo" : ""}${f.maneja ? ", maneja" : ""}${f.ausente ? ", no viene" : ""}. Arrastrá o tocá para mover`}
      className={cn(
        BASE,
        donde !== "col" && "min-h-[34px]",
        f.aCargo && "border-[1.5px] border-foreground",
        donde === "no" && "border-dashed bg-muted",
        elegida && ELEGIDA,
        arrastrando && "opacity-30",
        reemplaza && "border-primary bg-primary/10",
      )}
    >
      {donde === "col" && c != null && (
        <button
          type="button"
          data-no-drag=""
          disabled={ctx.soloLectura || f.aCargo}
          onClick={(e) => {
            e.stopPropagation();
            ctx.hoja({ accion: "a_cargo", fecha: ctx.dia.fecha, cuadrilla: c, personaId: f.pid });
          }}
          aria-label={f.aCargo ? `${f.nombre} está a cargo` : `Poner a ${f.nombre} a cargo`}
          title={f.aCargo ? "A cargo" : "Poner a cargo"}
          className={cn("-ml-1 grid size-[26px] shrink-0 place-items-center rounded text-foreground/30 hover:text-primary disabled:cursor-default", f.aCargo && "text-primary disabled:opacity-100")}
        >
          <Star className={cn("size-4", f.aCargo && "fill-current")} />
        </button>
      )}
      <span className={cn("text-sm font-semibold", donde === "col" ? "min-w-0 flex-1 truncate" : "whitespace-nowrap", (donde === "no" || f.ausente) && "text-muted-foreground line-through decoration-muted-foreground")}>{f.nombre}</span>
      {reemplaza && <span className="text-[11px] font-semibold text-primary">reemplaza</span>}
      {f.chofer && <span className="text-[11px] text-muted-foreground">chofer</span>}
      {motivo && (
        <button
          type="button"
          data-no-drag=""
          disabled={ctx.soloLectura || !ausenciaId}
          onClick={(e) => {
            e.stopPropagation();
            ctx.menuMotivo(f.pid, e.currentTarget, ausenciaId ?? null);
          }}
          title={ausenciaId ? "Cambiar motivo" : "Según la asistencia"}
          className="rounded border bg-muted px-1.5 py-0.5 text-[11.5px] font-semibold text-muted-foreground disabled:cursor-default"
        >
          {motivo}
        </button>
      )}
      {f.maneja && <span title="Maneja" className="text-muted-foreground"><IconoVolante /></span>}
      {donde === "col" && c != null && !ctx.soloLectura && (
        <button
          type="button"
          data-no-drag=""
          onClick={(e) => {
            e.stopPropagation();
            ctx.menuPersona(c, f.pid, e.currentTarget);
          }}
          aria-label={`Opciones de ${f.nombre}`}
          aria-haspopup="menu"
          title="Pasar a…, No viene…, Nota, Sacar"
          className="-mr-1.5 grid h-[26px] w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Camión ─────────────────────────────────────────────────────────────────

function FichaChofer({ f }: { f: FichaCamion }) {
  const pid = f.choferId!;
  const origen: Origen = { k: "chofer", pid, veh: f.veh, filaId: f.filaId, c: f.c };
  const id = `d:${f.k}`;
  const toque: Destino = { k: "camion", veh: f.veh, filaId: f.filaId, c: f.c };
  const { ref, props, ctx, elegida, arrastrando } = useComportamiento(id, origen, null, toque);
  const nombre = ctx.dia.personas.find((p) => p.id === pid)?.nombre ?? "";
  return (
    <div
      ref={ref}
      {...props}
      data-flip={`p:${pid}`}
      aria-label={`Chofer ${nombre}${f.choferDe === "viajes" ? " (por sus viajes)" : ""}. Arrastrá para sacarlo o pasarlo a otro camión`}
      title={f.choferDe === "viajes" ? "El que maneja sus viajes" : f.choferDe === "dia" ? "Chofer del camión hoy" : undefined}
      className={cn(
        "flex min-h-[30px] cursor-grab touch-manipulation items-center gap-1.5 rounded-[5px] border bg-muted px-1.5 text-[13px] font-semibold outline-none select-none hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        f.choque && "border-hd-ambar bg-hd-ambar-bg text-hd-ambar",
        f.choferDe === "viajes" && "border-dashed",
        elegida && ELEGIDA,
        arrastrando && "opacity-30",
      )}
    >
      <IconoVolante />
      <span className="truncate">{nombre}</span>
    </div>
  );
}

const HORAS = Array.from({ length: 27 }, (_, i) => 360 + i * 30).map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

function Horario({ f }: { f: FichaCamion }) {
  const ctx = usePizarron();
  const [abierto, setAbierto] = useState(false);
  const [menu, setMenu] = useState<{ cual: "lleva" | "busca"; el: HTMLElement } | null>(null);
  const c = f.c!;
  const fecha = ctx.dia.fecha;
  const todo = f.modo === "todo_el_dia";
  const ponerModo = (modo: "todo_el_dia" | "lleva_trae") => {
    if (f.filaId && modo !== f.modo) ctx.hoja({ accion: "vehiculo_cambiar", fecha, cuadrilla: c, filaId: f.filaId, modo });
  };
  const ponerHora = (cual: "lleva" | "busca", hora: string) => {
    ponerModo("lleva_trae");
    if (cual === "lleva") ctx.hoja({ accion: "lleva", fecha, cuadrilla: c, hora, filaId: f.filaId });
    else ctx.hoja({ accion: "busca", fecha, cuadrilla: c, hora });
  };
  if (!abierto) {
    return (
      <button
        type="button"
        data-no-drag=""
        disabled={ctx.soloLectura || !f.filaId}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        aria-label={`Cambiar horario: ${todo ? "todo el día" : `lleva ${f.lleva ?? ""}, busca ${f.busca ?? "nadie"}`}`}
        className="flex items-center gap-1.5 rounded text-left text-[12.5px] font-semibold hover:underline disabled:cursor-default disabled:no-underline"
      >
        <Clock className="size-3.5 text-muted-foreground" />
        {todo ? <span>Todo el día</span> : (
          <span className="flex flex-wrap gap-x-2">
            <span>Lleva <b className="font-mono font-semibold">{f.lleva ?? "—"}</b></span>
            <span>Busca <b className="font-mono font-semibold">{f.busca ?? "—"}</b></span>
          </span>
        )}
      </button>
    );
  }
  const pill = (cual: "lleva" | "busca", v: string | null) => (
    <button
      type="button"
      data-no-drag=""
      onClick={(e) => {
        e.stopPropagation();
        setMenu({ cual, el: e.currentTarget });
      }}
      className="rounded border border-foreground/25 bg-card px-1.5 py-0.5 font-mono text-[12.5px] font-semibold hover:border-primary"
    >
      {v ?? "—"}
    </button>
  );
  return (
    <div data-no-drag="" className="grid cursor-default gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-pressed={todo} onClick={() => ponerModo("todo_el_dia")} className={cn("rounded-md border-[1.5px] border-foreground/25 bg-card px-2 py-1.5 text-left text-[12.5px] font-bold", todo && "border-primary bg-primary/10")}>
        Todo el día
      </button>
      <div role="group" aria-label="Lleva y busca" className={cn("grid gap-1 rounded-md border-[1.5px] border-foreground/25 bg-card px-2 py-1.5 text-[12.5px] font-semibold", !todo && "border-primary bg-primary/10")}>
        <div className="flex items-center justify-between gap-1">Lleva {pill("lleva", todo ? null : f.lleva)}</div>
        <div className="flex items-center justify-between gap-1">Busca {pill("busca", todo ? null : f.busca)}</div>
      </div>
      <button type="button" onClick={() => setAbierto(false)} className="rounded-md bg-foreground py-1.5 text-[12.5px] font-bold text-background">Listo</button>
      {menu && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Elegir hora" encabezado={<b className="font-semibold">{menu.cual === "lleva" ? "Lleva a las" : "Busca a las"}</b>}>
          <div className="grid grid-cols-4 gap-1 p-0.5">
            {HORAS.map((h) => (
              <button
                key={h}
                type="button"
                data-mi=""
                aria-pressed={(menu.cual === "lleva" ? f.lleva : f.busca) === h}
                onClick={() => {
                  setMenu(null);
                  ponerHora(menu.cual, h);
                }}
                className="rounded border py-1.5 font-mono text-[13px] font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {h}
              </button>
            ))}
          </div>
        </MenuFlotante>
      )}
    </div>
  );
}

export function FichaCamionUI({ f }: { f: FichaCamion }) {
  const origen: Origen = { k: "camion", veh: f.veh, filaId: f.filaId, c: f.c };
  const id = `t:${f.k}`;
  const destino: Destino = { k: "camion", veh: f.veh, filaId: f.filaId, c: f.c };
  const { ref, props, ctx, elegida, arrastrando, encima } = useComportamiento(id, origen, destino, destino);
  const a = ctx.arrastre?.origen;
  const recibe = encima && a && (a.k === "persona" || a.k === "pedido" || (a.k === "chofer" && a.veh !== f.veh));
  const color = colorCamion(f.color);
  return (
    <div
      ref={ref}
      {...props}
      data-flip={`t:${f.veh ?? f.k}`}
      data-camion={f.veh ?? ""}
      aria-label={`${f.nombre || "Falta el camión"}${f.choferId ? "" : ", sin chofer"}. Arrastrá o tocá para moverlo`}
      className={cn(
        BASE,
        "flex-col items-stretch gap-1.5 overflow-hidden py-2 pr-2 pl-3",
        f.c == null && "w-[calc(50%-3px)] min-w-[150px] gap-1 py-1.5 sm:w-[190px]",
        elegida && ELEGIDA,
        arrastrando && "opacity-30",
        (recibe || (ctx.sel && ctx.sel.k !== id && mismoDestino(ctx.sobre, destino))) && "border-primary bg-primary/10",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ background: color }} />
      <div className="flex min-w-0 items-center gap-1.5">
        <IconoVehiculo forma={f.forma} style={{ color }} />
        {f.veh ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {f.marca && <span className="text-[13px] font-bold">{f.marca}</span>}
            <span className="rounded-[3px] border border-foreground/25 bg-muted px-1 py-0.5 font-mono text-[11.5px] leading-none font-semibold whitespace-nowrap">{f.patente}</span>
          </span>
        ) : <span className="text-[13px] font-bold text-hd-ambar">Falta el camión</span>}
      </div>
      {f.choferId ? <FichaChofer f={f} /> : (
        <button
          type="button"
          data-no-drag=""
          disabled={ctx.soloLectura || !f.veh}
          onClick={(e) => {
            e.stopPropagation();
            if (ctx.sel && ctx.tocar(destino)) return;
            ctx.menuChofer(f, e.currentTarget);
          }}
          className={cn(
            "flex min-h-[30px] w-full items-center justify-center gap-1 rounded-[5px] border-[1.5px] border-dashed text-[12.5px] font-bold disabled:opacity-60",
            // En una cuadrilla, un camión sin chofer es un problema; libre, no.
            f.c != null ? "border-hd-ambar bg-hd-ambar-bg text-hd-ambar" : "min-h-7 border-foreground/25 text-muted-foreground hover:border-foreground",
          )}
        >
          <Plus className="size-3.5" /> Chofer
        </button>
      )}
      {f.c != null && <Horario f={f} />}
      {f.c == null && (f.viajes > 0 || f.estado) && (
        <span className="text-xs text-muted-foreground">{[f.viajes ? `${f.viajes} ${f.viajes === 1 ? "viaje" : "viajes"}` : null, f.estado].filter(Boolean).join(" · ")}</span>
      )}
      {f.veh && (f.c != null || f.viajes > 0) && (
        <button
          type="button"
          data-no-drag=""
          onClick={(e) => {
            e.stopPropagation();
            if (f.veh) ctx.recorrido(f.veh);
          }}
          className="flex min-h-7 w-full items-center gap-1.5 rounded-[5px] border border-dashed border-foreground/25 bg-card px-1.5 text-left text-xs font-semibold hover:border-foreground"
        >
          <Route className="size-3.5" style={{ color }} />
          <span>Recorrido{f.viajes ? ` · ${f.viajes} ${f.viajes === 1 ? "parada" : "paradas"}` : ""}</span>
        </button>
      )}
    </div>
  );
}

// ─── Contratistas ───────────────────────────────────────────────────────────

/** "+3 de Quintana" con − / + en la columna. */
export function FichaContratistaColumna({ f, c }: { f: FichaContratista; c: number }) {
  const ctx = usePizarron();
  const fecha = ctx.dia.fecha;
  const paso = (n: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (n < 0 && f.cantidad <= 1) ctx.hoja({ accion: "contratista_quitar", fecha, cuadrilla: c, contratistaId: f.kid });
    else ctx.hoja({ accion: "contratista_sumar", fecha, cuadrilla: c, contratistaId: f.kid, n });
  };
  const boton = "grid h-7 w-[26px] shrink-0 place-items-center rounded border border-foreground/25 bg-card hover:border-foreground disabled:opacity-40";
  return (
    <div data-flip={`k:${c}:${f.kid}`} aria-label={`${f.cantidad} de ${f.nombre}, contratista`} className="flex min-h-9 items-center gap-1 rounded-md border-[1.5px] border-dashed border-foreground/25 bg-muted px-[3px] py-0.5">
      <button type="button" data-no-drag="" disabled={ctx.soloLectura} onClick={paso(-1)} aria-label={`Uno menos de ${f.nombre}`} className={boton}><Minus className="size-3.5" /></button>
      <button
        type="button"
        data-no-drag=""
        disabled={ctx.soloLectura}
        onClick={(e) => {
          e.stopPropagation();
          ctx.menuContratistaCol(c, f.kid, e.currentTarget);
        }}
        aria-haspopup="menu"
        title="Contratista · a cargo, nota, quitar"
        className="min-w-0 flex-1 rounded text-center text-[13px] leading-tight font-semibold hover:underline disabled:no-underline"
      >
        <b className="font-mono text-[15px]">+{f.cantidad}</b> de {f.nombre}{f.aCargo ? " · a cargo" : ""}
      </button>
      <button type="button" data-no-drag="" disabled={ctx.soloLectura} onClick={paso(1)} aria-label={`Uno más de ${f.nombre}`} className={boton}><Plus className="size-3.5" /></button>
    </div>
  );
}

/** Un contratista en la bandeja: arrastrarlo suma 1; tocarlo pregunta cuántos y para qué cuadrilla. */
export function FichaContratistaBandeja({ kid, nombre, puestos }: { kid: string; nombre: string; puestos: number }) {
  const ctx = usePizarron();
  const id = `k:${kid}`;
  const origen: Origen = { k: "contratista", kid };
  const { ref, attributes, listeners: escuchas, arrastrando } = useFicha(id, origen, null, ctx.soloLectura);
  const listeners = escuchas as Record<string, (e: never) => void> | undefined;
  return (
    <div
      ref={ref}
      {...attributes}
      {...escuchas}
      data-arrastrable=""
      data-flip={`kc:${kid}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!ctx.soloLectura) ctx.menuContratista(kid, e.currentTarget);
      }}
      onKeyDown={teclas((e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
          return;
        }
        ctx.teclear(origen, id, e);
      }, listeners?.onKeyDown as ((e: ReactKeyboardEvent) => void) | undefined)}
      aria-label={`Contratista ${nombre}. Arrastralo a una cuadrilla o tocá para elegir cuántos`}
      className={cn(BASE, "min-h-[34px] border-dashed bg-muted", arrastrando && "opacity-30")}
    >
      <span className="text-sm font-semibold">{nombre}</span>
      {puestos > 0 && <small className="text-[11.5px] font-semibold whitespace-nowrap text-muted-foreground">{puestos} {puestos === 1 ? "puesto" : "puestos"}</small>}
    </div>
  );
}

/** El fantasma del arrastre (DragOverlay): una ficha "levantada". */
export function Fantasma({ texto, camion, color, forma = "camion" }: { texto: string; camion?: boolean; color?: string; forma?: FormaVehiculo }) {
  return (
    <div className="pointer-events-none flex min-h-9 scale-105 -rotate-[1.5deg] cursor-grabbing items-center gap-1.5 rounded-md border border-foreground/40 bg-card px-2.5 text-sm font-semibold shadow-2xl motion-reduce:scale-100 motion-reduce:rotate-0">
      {camion && <IconoVehiculo forma={forma} className="h-4" style={{ color }} />}
      {texto}
    </div>
  );
}
