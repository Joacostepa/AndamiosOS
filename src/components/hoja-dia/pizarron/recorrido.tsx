"use client";

// El recorrido de un camión (rediseño F3; maqueta: drawRec / stopHtml): la hoja lateral
// "Recorrido · Iveco AB 799 CA" con sus paradas en orden. Cada parada es un viaje del camión
// (lib/hoja-dia/recorrido.ts); la salida y la vuelta al depósito se muestran en gris.
//
// Por parada: el lugar (no en las de la cuadrilla: van a la obra del tablero), la hora (una
// pista por defecto; el candado la vuelve fija y ahí sí avisa si no llega), qué hace, la nota
// y quitarla. Se reordenan arrastrando el agarre (dnd-kit: mouse, dedo o teclado con Espacio y
// flechas). "+ Parada" pregunta adónde va. Los atajos (Todo el día / Lleva y busca) son el modo
// del renglón del camión en su cuadrilla.
//
// Todo gesto es una acción de siempre (parada_editar, reordenar, crear, anular, volver_a_cola,
// vehiculo_cambiar) con historial y Deshacer; editar, reordenar y quitar se ven al instante
// (optimista.ts).

import { useMemo, useState } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Clock, GripVertical, Lock, MapPin, Package, Plus, X } from "lucide-react";
import { ACCIONES_PARADA, type AccionParada, type DiaHoja, type Punto } from "@/lib/hoja-dia/tipos";
import { cNombre, desvioTxt, hm, lugar, tipoDeAccion, toMin, vehiculosDe, vehTxt } from "@/lib/hoja-dia/estado";
import {
  accionPorDefecto, choferDelRecorrido, ordenAlFinal, paradasDe, pedidosParaSumar, resumenRecorrido, type Parada,
} from "@/lib/hoja-dia/recorrido";
import type { Gesto } from "@/lib/hoja-dia/gestos-pizarron";
import { cn } from "@/lib/utils";
import { HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { ItemMenu, MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";
import { Button } from "@/components/ui/button";
import { ElegirLugar } from "./elegir-lugar";

const HORAS = Array.from({ length: 27 }, (_, i) => 360 + i * 30).map((m) => hm(m));

type ParadaViaje = Extract<Parada, { k: "viaje" }>;
type Menu =
  | { t: "lugar"; id: string | "nueva"; el: HTMLElement }
  | { t: "hora"; p: ParadaViaje; el: HTMLElement }
  | { t: "accion"; p: ParadaViaje; el: HTMLElement }
  | null;

export function Recorrido({ dia, veh, ahora, abierta, onCerrar, soloLectura, ejecutar }: {
  dia: DiaHoja;
  veh: string | null;
  ahora: number;
  abierta: boolean;
  onCerrar: () => void;
  soloLectura: boolean;
  ejecutar: (gs: Gesto[]) => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const paradas = useMemo(() => (veh ? paradasDe(dia, veh) : []), [dia, veh]);
  // F4: los pedidos sin camión que le quedan cerca (maqueta: "tocá para sumarlos donde menos se desvía").
  const sugeridos = useMemo(() => (veh && !soloLectura ? pedidosParaSumar(dia, veh, ahora).slice(0, 4) : []), [dia, veh, ahora, soloLectura]);
  const sensores = useSensoresLista();
  if (!veh) return null;
  const fecha = dia.fecha;
  const viajeG = (a: Extract<Gesto, { k: "viaje" }>["a"]): Gesto => ({ k: "viaje", a });
  const editar = (id: string, cambios: Omit<Extract<Extract<Gesto, { k: "viaje" }>["a"], { accion: "parada_editar" }>, "accion" | "viajeId">) =>
    ejecutar([viajeG({ accion: "parada_editar", viajeId: id, ...cambios })]);

  // El renglón del camión en una cuadrilla (los atajos son su modo).
  const renglon = dia.hojas.flatMap((h) => vehiculosDe(h).filter((f) => f.vehiculoId === veh).map((f) => ({ h, f })))[0] ?? null;
  const ch = choferDelRecorrido(dia, veh);
  const resumen = resumenRecorrido(dia, veh);
  const sub = [ch ?? "Sin chofer", renglon ? `con la ${cNombre(dia, renglon.h.cuadrillaOdooId)}` : "libre", resumen].filter(Boolean).join(" · ");

  const quitar = (p: ParadaViaje) => {
    // Una de la cuadrilla (lleva/busca) vuelve a "nadie los lleva/busca"; una suelta se anula (al
    // chofer le llega "te saqué un viaje" y su pedido, si tenía, vuelve a la cola).
    if (p.deCuadrilla) ejecutar([viajeG({ accion: "volver_a_cola", viajeId: p.id })]);
    else ejecutar([viajeG({ accion: "anular", viajeId: p.id, motivo: "se sacó del recorrido" })]);
  };
  const nueva = (hacia: Punto) => {
    const haySalida = paradas.some((p) => p.k === "viaje");
    const queHace = accionPorDefecto(dia, hacia, haySalida);
    const salida = toMin(dia.parametros.encuentroDeposito) ?? 420;
    ejecutar([viajeG({ accion: "crear", fecha, vehiculoId: veh, tipo: tipoDeAccion(dia, queHace, hacia), hacia, queHace, horaAprox: true, orden: ordenAlFinal(dia, veh, salida) })]);
  };

  const vivos = paradas.filter((p): p is ParadaViaje => p.k === "viaje" && p.editable.mover);
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = vivos.map((p) => p.id);
    const de = ids.indexOf(String(e.active.id)), a = ids.indexOf(String(e.over.id));
    if (de < 0 || a < 0) return;
    ejecutar([viajeG({ accion: "reordenar", fecha, vehiculoId: veh, ids: arrayMove(ids, de, a) })]);
  };

  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={`Recorrido · ${vehTxt(dia, veh)}`}
      sub={sub}
      pie={
        <>
          <span className="mr-auto text-xs text-muted-foreground">Se manda al chofer en este orden</span>
          <Button onClick={onCerrar}><Check /> Listo</Button>
        </>
      }
    >
      {renglon && !soloLectura && (
        <div role="group" aria-label="Atajo" className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/50 p-2 text-[13px]">
          <span className="mr-1 text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">Atajo</span>
          {(["todo_el_dia", "lleva_trae"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={renglon.f.modo === m}
              onClick={() => renglon.f.modo !== m && ejecutar([{ k: "hoja", a: { accion: "vehiculo_cambiar", fecha, cuadrilla: renglon.h.cuadrillaOdooId, filaId: renglon.f.id, modo: m } }])}
              className="rounded-md border-[1.5px] border-foreground/25 bg-card px-2.5 py-1 font-semibold aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              {m === "todo_el_dia" ? "Todo el día" : "Lleva y busca"}
            </button>
          ))}
          <small className="basis-full text-xs text-muted-foreground">Las paradas de la cuadrilla salen del atajo; las demás las sumás vos.</small>
        </div>
      )}

      {paradas.length ? (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
          <SortableContext items={vivos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ol aria-label="Paradas" className="grid gap-1.5">
              {paradas.map((p, i) => (p.k === "viaje"
                ? <FilaParada key={p.id} p={p} n={paradas.slice(0, i + 1).filter((x) => x.k === "viaje").length} soloLectura={soloLectura} onMenu={setMenu} onNota={(t) => editar(p.id, { carga: t })} onQuitar={() => quitar(p)} />
                : <FilaVirtual key={p.id} p={p} />))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-md border-[1.5px] border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Sin paradas todavía. Agregá la primera.</div>
      )}

      {!soloLectura && (
        <div>
          <Button variant="outline" onClick={(e) => setMenu({ t: "lugar", id: "nueva", el: e.currentTarget })}><Plus /> Parada</Button>
        </div>
      )}

      {sugeridos.length > 0 && (
        <section aria-label="Pedidos sin camión" className="grid gap-1.5 rounded-lg border bg-muted/40 p-2">
          <span className="text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">Pedidos sin camión · tocá para sumarlos donde menos se desvía</span>
          {sugeridos.map(({ p, hueco }) => (
            <button
              key={p.id}
              type="button"
              onClick={() => ejecutar([{ k: "viaje", a: { accion: "poner_pedido", pedidoId: p.id, vehiculoId: veh } }])}
              title={`Parada ${hueco.n} · ${hueco.viaTxt}`}
              className="flex min-h-9 items-center gap-2 rounded-md border bg-card px-2 text-left text-[13px] hover:border-foreground"
            >
              <Package className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{p.que}</b> → {lugar(dia, p.hacia).n}</span>
              <span className="shrink-0 font-mono text-xs font-semibold text-hd-verde">{desvioTxt(hueco.min)}</span>
            </button>
          ))}
        </section>
      )}

      {menu?.t === "lugar" && (
        <ElegirLugar
          dia={dia}
          anchor={menu.el}
          onCerrar={() => setMenu(null)}
          onElegir={(hacia) => {
            const id = menu.id;
            setMenu(null);
            if (id === "nueva") nueva(hacia);
            else editar(id, { hacia });
          }}
        />
      )}
      {menu?.t === "hora" && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Hora de la parada" ancho={290} encabezado={<b className="font-semibold">{menu.p.fija ? "Hora fija" : "Hora aprox."}</b>}>
          <div className="grid grid-cols-4 gap-1 p-0.5">
            {HORAS.map((h) => (
              <button
                key={h}
                type="button"
                data-mi=""
                aria-pressed={menu.p.v.hora === h}
                onClick={() => {
                  const p = menu.p;
                  setMenu(null);
                  editar(p.id, { hora: h, horaAprox: !p.fija });
                }}
                className="rounded border py-1.5 font-mono text-[13px] font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {h}
              </button>
            ))}
          </div>
          <ItemMenu
            detalle={menu.p.fija ? "se usa como pista" : "alguien espera: avisa si no llega"}
            disabled={!menu.p.v.hora}
            onClick={() => {
              const p = menu.p;
              setMenu(null);
              editar(p.id, { horaAprox: p.fija });
            }}
          >
            {menu.p.fija ? "Pasar a aproximada" : "Fijar la hora (candado)"}
          </ItemMenu>
          <ItemMenu
            detalle="se calcula con el orden"
            disabled={!menu.p.v.hora}
            onClick={() => {
              const p = menu.p;
              setMenu(null);
              editar(p.id, { hora: null, horaAprox: false });
            }}
          >
            Sin hora
          </ItemMenu>
        </MenuFlotante>
      )}
      {menu?.t === "accion" && (
        <MenuFlotante anchor={menu.el} onCerrar={() => setMenu(null)} label="Qué hace" encabezado={<b className="font-semibold">¿Qué hace ahí?</b>}>
          {ACCIONES_PARADA.filter(([a]) => a !== "lleva_gente" && a !== "busca_gente").map(([a, l]) => (
            <ItemMenu
              key={a}
              detalle={menu.p.accion === a ? "✓" : undefined}
              onClick={() => {
                const p = menu.p;
                setMenu(null);
                if (p.accion !== a) editar(p.id, { queHace: a as AccionParada });
              }}
            >
              {l}
            </ItemMenu>
          ))}
        </MenuFlotante>
      )}
    </HojaLateral>
  );
}

function useSensoresLista() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function FilaVirtual({ p }: { p: Extract<Parada, { k: "salida" | "vuelta" }> }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-[13px] text-muted-foreground">
      <span className="grid size-6 shrink-0 place-items-center rounded bg-muted font-mono text-[11px] font-bold">D</span>
      <span className="min-w-0 flex-1">{p.texto}</span>
      {p.hora && <span className="font-mono text-xs">{p.hora}</span>}
    </li>
  );
}

function FilaParada({ p, n, soloLectura, onMenu, onNota, onQuitar }: {
  p: ParadaViaje;
  n: number;
  soloLectura: boolean;
  onMenu: (m: Menu) => void;
  onNota: (t: string | null) => void;
  onQuitar: () => void;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: p.id, disabled: soloLectura || !p.editable.mover });
  const [nota, setNota] = useState(p.nota ?? "");
  const [notaDe, setNotaDe] = useState(p.nota);
  if (notaDe !== p.nota) {
    setNotaDe(p.nota);
    setNota(p.nota ?? "");
  }
  const hecha = p.estado === "hecho";
  const pill = "inline-flex min-h-7 items-center gap-1 rounded-md border border-foreground/25 bg-card px-2 text-[12.5px] font-semibold hover:border-foreground disabled:cursor-default disabled:hover:border-foreground/25";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-parada={p.id}
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border bg-card px-2 py-2 shadow-xs",
        isDragging && "z-10 shadow-lg ring-2 ring-primary",
        (hecha || p.estado === "no_pudo") && "bg-muted/60",
      )}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        {!soloLectura && p.editable.mover ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Mover la parada ${n} (arrastrá, o Espacio y flechas)`}
            className="grid size-6 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted"
          >
            <GripVertical className="size-4" />
          </button>
        ) : <span className="size-6" aria-hidden />}
        <span className="font-mono text-[11px] font-bold text-muted-foreground" aria-hidden>{n}</span>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <button
          type="button"
          disabled={soloLectura || !p.editable.lugar}
          onClick={(e) => onMenu({ t: "lugar", id: p.id, el: e.currentTarget })}
          aria-label={`Lugar de la parada ${n}: ${p.lugar}`}
          title={p.deCuadrilla ? "Es de la cuadrilla: va a la obra del tablero" : "Cambiar el lugar"}
          className="flex min-w-0 items-start gap-1.5 rounded text-left hover:underline disabled:cursor-default disabled:no-underline"
        >
          {p.tag ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded bg-muted px-1 font-mono text-[11px] font-bold">{p.tag}</span> : <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 text-[13.5px] leading-tight font-semibold [overflow-wrap:anywhere]">
            {p.lugar}
            {p.sub && <small className="block text-xs font-normal text-muted-foreground">{p.sub}</small>}
          </span>
        </button>
        {p.pedido && <div className="text-xs text-muted-foreground"><b className="font-semibold text-foreground">Pedido:</b> {p.pedido}</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={pill} disabled={soloLectura || !p.editable.hora} onClick={(e) => onMenu({ t: "hora", p, el: e.currentTarget })} aria-label={`Hora de la parada ${n}: ${p.hora}${p.fija ? ", fija" : ", aproximada"}`}>
            {p.fija ? <Lock className="size-3.5" /> : <Clock className="size-3.5 text-muted-foreground" />}
            <span className="font-mono">{p.hora}</span>
          </button>
          <button type="button" className={pill} disabled={soloLectura || !p.editable.accion} onClick={(e) => onMenu({ t: "accion", p, el: e.currentTarget })} aria-label={`Qué hace en la parada ${n}: ${p.accionTxt}`}>
            {p.accionTxt}
          </button>
          {hecha && <span className="inline-flex items-center gap-1 text-xs font-semibold text-hd-verde"><Check className="size-3.5" /> hecha</span>}
          {p.estado === "no_pudo" && <span className="text-xs font-semibold text-hd-rojo">no se pudo</span>}
          {p.v.conflicto && <span className="text-xs font-semibold text-hd-ambar">llega ~{hm(p.v.conflicto.llega)}</span>}
          {p.chofer == null && p.estado === "planeado" && <span className="text-xs font-semibold text-hd-ambar">sin chofer</span>}
        </div>
        <label className="sr-only" htmlFor={`nota-${p.id}`}>Nota de la parada {n}</label>
        <input
          id={`nota-${p.id}`}
          value={nota}
          disabled={soloLectura || p.estado !== "planeado"}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => { const t = nota.trim() || null; if (t !== (p.nota ?? null)) onNota(t); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
          placeholder="Nota (ej. lo desarmado)"
          maxLength={120}
          className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-[13px] disabled:opacity-70"
        />
      </div>
      {!soloLectura && p.editable.quitar ? (
        <button type="button" onClick={onQuitar} aria-label={`Quitar la parada ${n}`} title={p.deCuadrilla ? "Que no los lleve/busque este camión" : "Quitar la parada"} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-hd-rojo">
          <X className="size-4" />
        </button>
      ) : <span className="size-7" aria-hidden />}
    </li>
  );
}
