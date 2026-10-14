"use client";

// El editor de los vehículos de una tarjeta (chofEditorHTML): un renglón por vehículo, cada
// uno con su modo (Lleva y trae / Todo el día), su chofer, su camión y, si los lleva, la hora
// del "lleva" y si después vuelve al depósito (y a qué hora llega). "+ Otro vehículo" suma
// uno; sin ninguno, van por su cuenta. Abajo, quién los busca: el mismo que los llevó, otro
// camión u otro chofer, a definir, o vuelven solos (se puede cambiar en cualquier momento).
// Y el del encuentro (hora y lugar).
//
// Cada cambio es un gesto con Deshacer. Lo que pasa con el encuentro y los viajes lo decide
// vehiculos.ts (la misma regla en el navegador, al instante, y en el servidor). Son los
// mismos viajes de la vista Camiones: se ven igual allá.

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { encTxt, hojaDeCuadrilla, obrasCon, vehiculosDe, filaQueLleva, choferesParaVehiculo, choferSugerido, nombreDe, normHora, vehTxt, nombreVehiculo, lowFirst, toMin } from "@/lib/hoja-dia/estado";
import { horasDeFila, horasLlevaTrae, opcionesChofer, opcionesVehiculo } from "@/lib/hoja-dia/vista-cuadrillas";
import { quienBusca } from "@/lib/hoja-dia/vehiculos";
import { esTemporal } from "@/lib/hoja-dia/optimista";
import type { ModoVehiculo, VehiculoHoja } from "@/lib/hoja-dia/tipos";
import { useAccionHoja, useAccionViaje } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { CampoHora } from "@/components/hoja-dia/comunes/campo-hora";
import { cn } from "@/lib/utils";
import type { Control } from "./control";

const SELECT = "h-7 min-w-0 max-w-full flex-[1_1_140px] rounded-md border border-input bg-card px-1.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 max-md:h-10 max-md:text-[15px]";
const MODOS_V: [ModoVehiculo, string][] = [["lleva_trae", "Lleva y trae"], ["todo_el_dia", "Todo el día"]];

/** Un selector de dos o tres opciones (los modos). */
function Segmentos<T extends string>({ label, opciones, valor, onElegir, disabled }: { label: string; opciones: [T, string][]; valor: T | null; onElegir: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="inline-flex justify-self-start overflow-hidden rounded-[7px] border border-foreground/20">
      {opciones.map(([k, l]) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          aria-pressed={valor === k}
          onClick={() => valor !== k && onElegir(k)}
          className={cn(
            "border-foreground/20 px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground outline-none not-first:border-l focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 max-md:px-3 max-md:py-2.5 max-md:text-sm",
            valor === k && "bg-foreground text-background",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function EditorChofer({ ctl, c }: { ctl: Control; c: number }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const viaje = useAccionViaje(fecha);
  const h = hojaDeCuadrilla(dia, c)!;
  const filas = vehiculosDe(h);
  const fl = filaQueLleva(h);
  const ob = obrasCon(dia, c);
  const lt = horasLlevaTrae(dia, c);
  const caja = useRef<HTMLDivElement>(null);
  const foco = ctl.chEd?.foco;

  // Al abrir: el foco en lo que se pidió (la hora del lleva o del busca) o en el primer modo.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const t = foco ? el.querySelector<HTMLElement>(`#${foco}-${c}`) : el.querySelector<HTMLElement>('[aria-pressed="true"], button');
    t?.focus();
  }, [c, foco]);

  const cerrar = () => {
    ctl.setChEd(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#card-${c} [data-vehiculos]`)?.focus());
  };

  return (
    <div
      ref={caja}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar();
        }
      }}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-foreground/20 bg-hd-card2 p-2"
    >
      {!filas.length ? (
        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">Sin chofer: van por su cuenta a la obra. Encuentro {encTxt(dia, c)}.</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={() => hoja.mutate({ accion: "vehiculo_sumar", fecha, cuadrilla: c, modo: "lleva_trae" })}>+ Lleva y trae</Button>
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={() => hoja.mutate({ accion: "vehiculo_sumar", fecha, cuadrilla: c, modo: "todo_el_dia" })}>+ Todo el día</Button>
          </div>
        </div>
      ) : (
        <>
          {filas.map((f, i) => (
            <RenglonVehiculo key={f.id} ctl={ctl} c={c} f={f} n={i + 1} varias={filas.length > 1} principal={f.id === fl?.id} />
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" className="max-md:h-10" onClick={() => hoja.mutate({ accion: "vehiculo_sumar", fecha, cuadrilla: c, modo: "lleva_trae", choferId: null, vehiculoId: null })}>
              + Otro vehículo
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground max-md:h-10" onClick={() => hoja.mutate({ accion: "modo", fecha, cuadrilla: c, modo: "sin" })}>
              Van por su cuenta
            </Button>
          </div>
        </>
      )}

      {fl && <EditorBusca ctl={ctl} c={c} />}

      {fl && ob.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
          {lt.mueve.map((m) => (
            <span key={m.v.id} className="inline-flex items-center gap-1.5">
              Mueve a {m.dir} a las {m.hora}
              <Button size="xs" variant="ghost" onClick={() => viaje.mutate({ accion: "anular", viajeId: m.v.id, motivo: "Ya no hace falta" })}>
                Sacar
              </Button>
            </span>
          ))}
          {lt.mueve.length < ob.length - 1 && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const sig = ob[lt.mueve.length + 1];
                if (sig) hoja.mutate({ accion: "mueve", fecha, cuadrilla: c, otId: sig.o.otId, hora: sig.hora });
              }}
            >
              + Mueve a la {lt.mueve.length + 2}.ª obra
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Los lleva y busca son viajes del camión: se ven igual en Camiones.</span>
        <Button size="sm" variant="outline" onClick={cerrar}>Listo</Button>
      </div>
    </div>
  );
}

/** Un vehículo de la tarjeta: modo, chofer, camión y, si los lleva, la hora del lleva y la vuelta al depósito. */
function RenglonVehiculo({ ctl, c, f, n, varias, principal }: { ctl: Control; c: number; f: VehiculoHoja; n: number; varias: boolean; principal: boolean }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const hf = horasDeFila(dia, c, f.id);
  // Un renglón recién sumado tiene id provisorio hasta que contesta el servidor (un segundo).
  const espera = esTemporal(f.id);
  const cambiar = (x: { modo?: ModoVehiculo; choferId?: string | null; vehiculoId?: string | null }) => hoja.mutate({ accion: "vehiculo_cambiar", fecha, cuadrilla: c, filaId: f.id, ...x });
  const nombre = varias ? `Vehículo ${n}${f.vehiculoId ? ` (${vehTxt(dia, f.vehiculoId)})` : ""}` : "Vehículo";
  return (
    <section aria-label={nombre} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5", varias && "rounded-md border border-foreground/10 bg-card/60 p-1.5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Segmentos label={`Modo del ${lowFirst(nombre)}`} opciones={MODOS_V} valor={f.modo} disabled={espera} onElegir={(modo) => cambiar({ modo })} />
        <span className="flex-1" />
        {varias && (
          <Button size="icon-sm" variant="ghost" disabled={espera} aria-label={`Quitar el ${lowFirst(nombre)}`} title="Quitar este vehículo" className="text-muted-foreground max-md:size-10" onClick={() => hoja.mutate({ accion: "vehiculo_quitar", fecha, cuadrilla: c, filaId: f.id })}>
            <X />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <select id={n === 1 ? `ch-${c}` : undefined} aria-label={`Chofer del ${lowFirst(nombre)}`} className={SELECT} disabled={espera} value={f.choferId ?? ""} onChange={(e) => cambiar({ choferId: e.target.value || null })}>
          <option value="">Elegir chofer…</option>
          {opcionesChofer(dia, c, f.id).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select id={n === 1 ? `vh-${c}` : undefined} aria-label={`Camión del ${lowFirst(nombre)}`} className={SELECT} disabled={espera} value={f.vehiculoId ?? ""} onChange={(e) => cambiar({ vehiculoId: e.target.value || null })}>
          <option value="">Elegir vehículo…</option>
          {opcionesVehiculo(dia, c, f.id).map((o) => (
            <option key={o.value} value={o.value} disabled={o.deshabilitada}>{o.label}</option>
          ))}
        </select>
      </div>
      {f.modo === "lleva_trae" && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <CampoHora id={principal ? `lleva-${c}` : undefined} label="Lleva" valor={hf.lleva} disabled={espera} onCambiar={(hora) => hoja.mutate({ accion: "lleva", fecha, cuadrilla: c, filaId: f.id, hora })} />
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground max-md:min-h-10 max-md:text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              disabled={espera || !hf.hayLleva}
              checked={hf.vuelta}
              onChange={(e) => hoja.mutate({ accion: "vuelta", fecha, cuadrilla: c, filaId: f.id, vuelve: e.target.checked })}
            />
            Después vuelve al depósito
          </label>
          {hf.vuelta && (
            <span className="inline-flex items-center gap-1.5">
              <CampoHora label="Llega" valor={hf.llega} disabled={espera} onCambiar={(llega) => hoja.mutate({ accion: "vuelta", fecha, cuadrilla: c, filaId: f.id, vuelve: true, llega })} />
              {hf.llegaEst && <span className="text-xs text-muted-foreground">estimada</span>}
            </span>
          )}
        </div>
      )}
      {f.modo === "lleva_trae" && hf.hayLleva && (
        <CargaLleva key={hf.carga ?? ""} id={principal ? `carga-${c}` : undefined} carga={hf.carga} onGuardar={(carga) => hoja.mutate({ accion: "carga_lleva", fecha, cuadrilla: c, filaId: f.id, carga })} />
      )}
    </section>
  );
}

/**
 * Quién los busca: el mismo vehículo que los llevó (o cualquiera de la hoja), otro camión
 * (con su chofer), a definir o vuelven solos. Se puede pasar de una a otra en cualquier
 * momento del día: son el mismo viaje "busca" de la vista Camiones.
 */
function EditorBusca({ ctl, c }: { ctl: Control; c: number }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const h = hojaDeCuadrilla(dia, c)!;
  const filas = vehiculosDe(h);
  const q = quienBusca(dia, h);
  // "Otro camión…" elegido, todavía sin camión: se muestra el selector.
  const [eligiendoOtro, setEligiendoOtro] = useState(false);
  const valor = eligiendoOtro ? "otro" : q.k === "fila" ? `fila:${q.fila.id}` : q.k;
  const lt = horasLlevaTrae(dia, c);
  const elegir = (v: string) => {
    setEligiendoOtro(false);
    if (v === "solos") hoja.mutate({ accion: "busca", fecha, cuadrilla: c, hora: null });
    else if (v === "definir") hoja.mutate({ accion: "busca_con", fecha, cuadrilla: c, vehiculoId: null });
    else if (v === "otro") setEligiendoOtro(true);
    else if (v.startsWith("fila:")) hoja.mutate({ accion: "busca_con", fecha, cuadrilla: c, filaId: v.slice(5) });
  };
  const etiqueta = (f: VehiculoHoja) => `${nombreDe(dia, f.choferId) || "sin chofer"}${f.vehiculoId ? ` · ${vehTxt(dia, f.vehiculoId)}` : ""}`;
  const veh = q.k === "otro" ? q.v.vehiculoId : null;
  // Otro camión: lo hace el chofer de ese tramo de su fila. Se resuelve acá y se manda, así el
  // servidor escribe el mismo chofer que se ve al instante.
  const conCamion = (v: string | null) => {
    const t = toMin(normHora(q.k !== "solos" ? q.v.hora : null) ?? dia.parametros.finJornada);
    hoja.mutate({ accion: "busca_con", fecha, cuadrilla: c, vehiculoId: v, choferId: v ? choferSugerido(dia, v, t) : null });
  };
  return (
    <section aria-label="El busca" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 border-t border-foreground/10 pt-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <label className="inline-flex min-w-0 flex-[1_1_220px] items-center gap-1.5 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">Los busca</span>
          <select id={`busca-con-${c}`} aria-label="Quién los busca" className={SELECT} value={valor} onChange={(e) => elegir(e.target.value)}>
            {filas.map((f) => (
              <option key={f.id} value={`fila:${f.id}`} disabled={esTemporal(f.id)}>{filas.length > 1 ? etiqueta(f) : `El mismo (${etiqueta(f)})`}</option>
            ))}
            <option value="otro">Otro camión u otro chofer…</option>
            <option value="definir">A definir (todavía nadie)</option>
            <option value="solos">Vuelven solos</option>
          </select>
        </label>
        {q.k !== "solos" && <CampoHora id={`busca-${c}`} label="a las" valor={lt.busca} onCambiar={(hora) => hoja.mutate({ accion: "busca", fecha, cuadrilla: c, hora })} />}
      </div>
      {(q.k === "otro" || eligiendoOtro) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <select aria-label="Camión que los busca" className={SELECT} value={veh ?? ""} onChange={(e) => { setEligiendoOtro(false); conCamion(e.target.value || null); }}>
            <option value="">Elegir camión…</option>
            {dia.vehiculos.map((v) => <option key={v.id} value={v.id}>{nombreVehiculo(v)}</option>)}
          </select>
          {q.k === "otro" && (
            <select aria-label="Chofer que los busca" className={SELECT} value={q.v.choferId ?? ""} onChange={(e) => hoja.mutate({ accion: "busca_con", fecha, cuadrilla: c, vehiculoId: veh, choferId: e.target.value || null })}>
              <option value="">Elegir chofer…</option>
              {choferesParaVehiculo(dia, veh).map(({ id: ch, habitual }) => <option key={ch} value={ch}>{nombreDe(dia, ch)}{habitual ? " · habitual" : ""}</option>)}
            </select>
          )}
        </div>
      )}
    </section>
  );
}

/** "Lleva: 20 tablones y 2 escaleras": lo que va en el camión con la cuadrilla (sale en la lista de carga). Se guarda al salir o con Enter. */
function CargaLleva({ id, carga, onGuardar }: { id?: string; carga: string | null; onGuardar: (carga: string | null) => void }) {
  const [texto, setTexto] = useState(carga ?? "");
  const guardar = () => {
    const t = texto.trim();
    if (t !== (carga ?? "")) onGuardar(t || null);
  };
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Carga</span>
      <input
        id={id}
        value={texto}
        maxLength={300}
        placeholder="material que va con la cuadrilla (opcional)"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); guardar(); }
          else if (e.key === "Escape" && texto !== (carga ?? "")) { e.stopPropagation(); setTexto(carga ?? ""); }
        }}
        className="h-7 min-w-0 flex-[1_1_220px] rounded-md border border-input bg-card px-1.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 max-md:text-[15px]"
      />
    </label>
  );
}

export function EditorEncuentro({ ctl, c }: { ctl: Control; c: number }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const h = hojaDeCuadrilla(dia, c)!;
  const caja = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    caja.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const lugar = h.encuentro.lugar;
  return (
    <span
      ref={caja}
      className="inline-flex flex-wrap items-center gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          ctl.setEditEnc(null);
        }
      }}
    >
      <CampoHora
        ocultarLabel
        label="Hora del encuentro"
        valor={h.encuentro.hora}
        onCambiar={(hora) => hoja.mutate({ accion: "encuentro", fecha, cuadrilla: c, lugar, hora, texto: h.encuentro.texto })}
      />
      <select
        aria-label="Lugar del encuentro"
        value={lugar}
        className="h-7 rounded-md border border-input bg-card px-1.5 text-[13px] max-md:h-10 max-md:text-[15px]"
        onChange={(e) => {
          const l = e.target.value as "deposito" | "obra" | "otro";
          hoja.mutate({ accion: "encuentro", fecha, cuadrilla: c, lugar: l, hora: h.encuentro.hora, texto: l === "otro" ? h.encuentro.texto : null });
        }}
      >
        <option value="deposito">en el depósito</option>
        <option value="obra">en la obra</option>
        {lugar === "otro" && <option value="otro">{h.encuentro.texto ?? "otro lugar"}</option>}
      </select>
      <Button size="sm" variant="outline" onClick={() => ctl.setEditEnc(null)}>Listo</Button>
    </span>
  );
}
