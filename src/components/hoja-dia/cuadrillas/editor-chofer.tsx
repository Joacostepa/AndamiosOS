"use client";

// El editor del chofer de una tarjeta (chofEditorHTML): Sin chofer / Lleva y trae / Todo
// el día, el chofer y el vehículo, las horas del lleva y del busca ("Vuelven por su
// cuenta"), los "mueve" entre obras. Y el del encuentro (hora y lugar).
// Cada cambio es un gesto con Deshacer; lo que pasa con el encuentro y los viajes lo
// decide el servidor con las mismas funciones de estado.ts (planModo, planSoltarChofer).

import { useEffect, useRef, useState } from "react";
import { encTxt, hojaDeCuadrilla, obrasCon } from "@/lib/hoja-dia/estado";
import { MODOS, horasLlevaTrae, opcionesChofer, opcionesVehiculo } from "@/lib/hoja-dia/vista-cuadrillas";
import { useAccionHoja, useAccionViaje } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { CampoHora } from "@/components/hoja-dia/comunes/campo-hora";
import { cn } from "@/lib/utils";
import type { Control } from "./control";

const SELECT = "h-7 min-w-0 max-w-full flex-[1_1_140px] rounded-md border border-input bg-card px-1.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 max-md:text-[15px]";

export function EditorChofer({ ctl, c }: { ctl: Control; c: number }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const viaje = useAccionViaje(fecha);
  const h = hojaDeCuadrilla(dia, c)!;
  const ob = obrasCon(dia, c);
  const lt = horasLlevaTrae(dia, c);
  const caja = useRef<HTMLDivElement>(null);
  const foco = ctl.chEd?.foco;

  // Al abrir: el foco en lo que se pidió (la hora del lleva o del busca) o en el modo.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const t = foco ? el.querySelector<HTMLInputElement>(`#${foco}-${c}`) : el.querySelector<HTMLElement>('[aria-pressed="true"]');
    t?.focus();
  }, [c, foco]);

  const cerrar = () => {
    ctl.setChEd(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#card-${c} [aria-label$=": cambiar"]`)?.focus());
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
      className="grid gap-1.5 rounded-lg border border-foreground/20 bg-hd-card2 p-2"
    >
      <div role="group" aria-label="Modo del chofer" className="inline-flex justify-self-start overflow-hidden rounded-[7px] border border-foreground/20">
        {MODOS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={h.modo === k}
            onClick={() => h.modo !== k && hoja.mutate({ accion: "modo", fecha, cuadrilla: c, modo: k })}
            className={cn(
              "border-foreground/20 px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground outline-none not-first:border-l focus-visible:ring-3 focus-visible:ring-ring/50 max-md:px-3 max-md:py-2.5 max-md:text-sm",
              h.modo === k && "bg-foreground text-background",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {h.modo === "sin" ? (
        <p className="text-[13px] text-muted-foreground">Van por su cuenta a la obra. Encuentro {encTxt(dia, c)}.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <select
            id={`ch-${c}`}
            aria-label="Chofer"
            className={SELECT}
            value={h.choferId ?? ""}
            onChange={(e) => hoja.mutate({ accion: "chofer", fecha, cuadrilla: c, choferId: e.target.value || null })}
          >
            <option value="">Elegir chofer…</option>
            {opcionesChofer(dia, c).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            id={`vh-${c}`}
            aria-label="Vehículo"
            className={SELECT}
            value={h.vehiculoId ?? ""}
            onChange={(e) => hoja.mutate({ accion: "vehiculo", fecha, cuadrilla: c, vehiculoId: e.target.value || null })}
          >
            <option value="">Elegir vehículo…</option>
            {opcionesVehiculo(dia, c).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {h.modo === "lleva_trae" && (
        <>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <CampoHora id={`lleva-${c}`} label="Lleva" valor={lt.lleva} onCambiar={(hora) => hoja.mutate({ accion: "lleva", fecha, cuadrilla: c, hora })} />
            {lt.busca != null && <CampoHora id={`busca-${c}`} label="Busca" valor={lt.busca} onCambiar={(hora) => hoja.mutate({ accion: "busca", fecha, cuadrilla: c, hora })} />}
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground max-md:min-h-10 max-md:text-sm">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={lt.busca == null}
                onChange={(e) => hoja.mutate({ accion: "busca", fecha, cuadrilla: c, hora: e.target.checked ? null : dia.parametros.finJornada })}
              />
              Vuelven por su cuenta
            </label>
          </div>
          {lt.hayLleva && <CargaLleva key={lt.carga ?? ""} c={c} carga={lt.carga} onGuardar={(carga) => hoja.mutate({ accion: "carga_lleva", fecha, cuadrilla: c, carga })} />}
          {ob.length > 1 && (
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
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Los lleva y busca son viajes del camión: se ven igual en Camiones.</span>
        <Button size="sm" variant="outline" onClick={cerrar}>Listo</Button>
      </div>
    </div>
  );
}

/** "Lleva: 20 tablones y 2 escaleras": lo que va en el camión con la cuadrilla (sale en la lista de carga). Se guarda al salir o con Enter. */
function CargaLleva({ c, carga, onGuardar }: { c: number; carga: string | null; onGuardar: (carga: string | null) => void }) {
  const [texto, setTexto] = useState(carga ?? "");
  const guardar = () => {
    const t = texto.trim();
    if (t !== (carga ?? "")) onGuardar(t || null);
  };
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Lleva</span>
      <input
        id={`carga-${c}`}
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
