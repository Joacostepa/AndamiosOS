"use client";

// La tarjeta de una cuadrilla (cardHTML de la maqueta), compacta: estado, problemas arriba
// con su botón, las obras del tablero con su hora, quiénes van, el chofer en una línea
// (que se abre en el editor de tres modos), el encuentro y las instrucciones.

import { useState } from "react";
import { ArrowDown, ArrowUp, Circle, MoreHorizontal } from "lucide-react";
import {
  aCargoContratista, cNombre, estadoHoja, esHoy, frJ, hojaDeCuadrilla, nombreDe, obrasCon, problemas, recibeDe, suspendida,
} from "@/lib/hoja-dia/estado";
import { chipsDe, instruccionesDe, materialDe, quienesVan, resumenChofer, encuentroTxt } from "@/lib/hoja-dia/vista-cuadrillas";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BotonesDe } from "@/components/hoja-dia/comunes/linea-bandeja";
import { AgregarPersona } from "./agregar-persona";
import { EditorChofer, EditorEncuentro } from "./editor-chofer";
import { TIPO_ARRASTRE, type Control } from "./control";
import { JornadaCerrada } from "./cerrar-jornada";
import { ChipsContratistas, NotasContratistas } from "./contratistas";

const TONO_ESTADO: Record<string, string> = {
  recibida: "font-semibold text-hd-verde",
  cambiada: "font-semibold text-hd-ambar",
  enviada: "text-foreground",
  abierta: "text-foreground",
  rojo: "font-semibold text-hd-rojo",
  sinavisar: "font-semibold text-muted-foreground",
  suspendida: "font-semibold text-hd-ambar",
  borrador: "text-muted-foreground",
};

function TipoObra({ tipo, fraccion }: { tipo: string; fraccion: number }) {
  const t = tipo.toLowerCase();
  const armado = t.includes("armado") && !t.includes("desarm");
  const desarme = t.includes("desarm");
  return (
    <span
      aria-label={tipo}
      title={tipo}
      className={cn(
        "inline-flex items-center gap-[3px] rounded-[5px] py-px pr-1.5 pl-1 text-xs font-medium whitespace-nowrap",
        armado ? "bg-[var(--tb-azul-bg)] text-[var(--tb-azul-text)]" : desarme ? "bg-[var(--tb-ambar-bg)] text-[var(--tb-ambar-text)]" : "bg-[var(--tb-neutro-bg)] text-[var(--tb-neutro-text)]",
      )}
    >
      {armado ? <ArrowUp className="size-3" /> : desarme ? <ArrowDown className="size-3" /> : <Circle className="size-3" />}
      <span className="tabular-nums">{frJ(fraccion)}</span>
    </span>
  );
}

export function Tarjeta({ ctl, c, indice }: { ctl: Control; c: number; indice: number }) {
  const { dia, ahora, pasado } = ctl;
  const h = hojaDeCuadrilla(dia, c)!;
  const ob = obrasCon(dia, c);
  const st = estadoHoja(dia, c, ahora);
  const probs = problemas(dia, c, ahora);
  const bloq = probs.filter((p) => p.nivel === "bloq");
  const avisos = probs.filter((p) => p.nivel !== "bloq");
  const r = recibeDe(dia, c);
  const chips = chipsDe(dia, c);
  const qv = quienesVan(dia, c);
  const mat = materialDe(dia, c);
  const ins = instruccionesDe(dia, c);
  const resumen = resumenChofer(dia, c);
  const tarde = esHoy(ahora) && ahora >= 16 * 60;
  // B1: las obras que ya tienen parte NO ofrecen "Cerrar jornada": muestran el parte.
  const conParte = ob.filter((x) => x.o.parteId != null);
  const sinParte = ob.filter((x) => x.o.parteId == null);
  const ofrecerCierre = tarde && !pasado && sinParte.length > 0;
  const sus = suspendida(dia, c);
  const nombre = cNombre(dia, c);
  const color = colorCuadrilla(indice).borde;
  const [dropEn, setDropEn] = useState(false);
  const [dropNombre, setDropNombre] = useState<string | null>(null);
  const editando = ctl.chEd?.c === c && !pasado;
  // El que está a cargo va primero: si es un contratista, su chip antes que los nombres.
  const kPrimero = !!aCargoContratista(h);

  const soltar = (e: React.DragEvent, sobre: string | null) => {
    const a = ctl.arrastre;
    setDropEn(false);
    setDropNombre(null);
    if (!a || pasado) return;
    e.preventDefault();
    e.stopPropagation();
    ctl.setArrastre(null);
    if (a.contratista) ctl.sumarContratista(c, a.pid, 1);
    else if (a.esChofer) ctl.soltarChofer(c, a.pid);
    else if (sobre && sobre !== a.pid) ctl.agregar(c, a.pid, { reemplaza: sobre });
    else if (a.from !== c) ctl.agregar(c, a.pid);
  };

  return (
    <article
      id={`card-${c}`}
      aria-label={nombre}
      onDragOver={(e) => {
        if (!ctl.arrastre || pasado || !e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = ctl.arrastre.contratista ? "copy" : "move";
        if (!dropEn) setDropEn(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropEn(false);
          setDropNombre(null);
        }
      }}
      onDrop={(e) => soltar(e, null)}
      className={cn(
        "flex min-w-0 scroll-mt-24 flex-col rounded-[11px] border bg-card transition-[box-shadow,border-color] duration-200",
        st.k === "cambiada" && "border-hd-ambar/55",
        dropEn && "border-primary ring-1 ring-primary ring-inset",
        ctl.flash === c && "ring-2 ring-primary",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 pt-2 pr-2 pb-1 pl-3">
        <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
        <h2 className="text-[15px] font-semibold whitespace-nowrap max-md:text-base">{nombre}</h2>
        {r && !pasado ? (
          <button
            type="button"
            onClick={() => ctl.verComo(c, r)}
            title={`Ver como ${nombreDe(dia, r)}`}
            className={cn("min-w-0 truncate text-left text-xs underline-offset-[3px] outline-none hover:underline focus-visible:underline", TONO_ESTADO[st.k])}
          >
            {st.txt}
          </button>
        ) : (
          <span className={cn("min-w-0 truncate text-xs", TONO_ESTADO[st.k])}>{st.txt}</span>
        )}
        <span className="flex-1" />
        {!pasado && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Más opciones de la ${nombre}`}
            aria-haspopup="menu"
            onClick={(e) => ctl.abrirMenuTarjeta(c, e.currentTarget)}
            className="text-muted-foreground"
          >
            <MoreHorizontal />
          </Button>
        )}
      </div>

      {(st.k === "cambiada" || probs.length > 0) && (
        <div className="mx-2 mt-0.5 mb-1 grid gap-[3px]">
          {st.k === "cambiada" && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[7px] bg-hd-ambar-bg py-[3px] pr-1 pl-1.5 text-[13px] max-md:text-sm">
              <span className="min-w-0 flex-[1_1_150px] leading-snug">
                <b className="font-semibold">Cambió después de enviar:</b> {(st.ds ?? []).map((x) => x.t).join(", ")}
              </span>
              <Button variant="outline" size="xs" className="h-6 max-md:h-9 max-md:px-3 max-md:text-sm" onClick={() => ctl.abrirEnvio(r)}>
                Avisar a {nombreDe(dia, r) || "quien recibe"}
              </Button>
            </div>
          )}
          {[...bloq, ...avisos].map((p) => (
            <div key={p.k} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[7px] bg-hd-card2 py-[3px] pr-1 pl-1.5 text-[13px] max-md:text-sm">
              <span className={cn("min-w-0 flex-[1_1_150px] leading-snug", p.rojo ? "text-hd-rojo" : p.nivel === "aviso" ? "text-hd-ambar" : "")}>{p.card}</span>
              <span className="flex flex-wrap gap-1">
                <BotonesDe bs={p.bs} onBoton={ctl.boton} grande />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid px-1.5 pb-1">
        {ob.map((x, i) => (
          <button
            key={x.o.otId}
            type="button"
            onClick={(e) => ctl.abrirObra(x.o.otId, e.currentTarget)}
            title={`${x.o.tipo} · OT ${x.o.otId}`}
            className="grid min-h-6 w-full grid-cols-[14px_minmax(0,1fr)_auto_40px] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
          >
            <span className="text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 text-[13px] leading-tight font-medium">
              {x.o.corto}
              {x.o.dia != null && x.o.totalDias != null && x.o.totalDias > 1 && (
                <small className="text-xs font-normal whitespace-nowrap text-muted-foreground"> · día {x.o.dia} de {x.o.totalDias}</small>
              )}
            </span>
            <TipoObra tipo={x.o.tipo} fraccion={x.o.fraccion} />
            <span className={cn("text-right text-[13px] tabular-nums", x.est && "text-muted-foreground")}>
              {x.est ? "~" : ""}
              {x.hora}
            </span>
          </button>
        ))}
      </div>
      {mat && <div className="px-3 pb-1 pl-8 text-xs leading-snug text-muted-foreground">{mat}</div>}

      <div className="grid gap-1 px-3 pt-1 pb-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            Quiénes van <b className="font-semibold text-foreground">{qv.van} de {qv.prevista}</b>
            {(qv.contratistas || qv.con) && ` (${[qv.contratistas, qv.con && `con ${qv.con}`].filter(Boolean).join(", ")})`}
          </span>
          {kPrimero && <ChipsContratistas ctl={ctl} c={c} />}
          {chips.map((x) => (
            <button
              key={x.pid}
              type="button"
              id={`nm-${c}-${x.pid}`}
              draggable={!pasado}
              aria-haspopup={pasado ? undefined : "menu"}
              title={pasado ? undefined : "Arrastralo a otra cuadrilla o tocá para ver opciones"}
              onClick={(e) => !pasado && ctl.abrirMenuPersona(c, x.pid, e.currentTarget)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(TIPO_ARRASTRE, x.pid);
                ctl.setArrastre({ pid: x.pid, from: c, esChofer: false });
              }}
              onDragEnd={() => ctl.setArrastre(null)}
              onDragOver={() => {
                if (ctl.arrastre && !ctl.arrastre.esChofer && !ctl.arrastre.contratista && ctl.arrastre.pid !== x.pid && dropNombre !== x.pid) setDropNombre(x.pid);
              }}
              onDrop={(e) => soltar(e, x.pid)}
              className={cn(
                "inline-flex min-h-6 cursor-grab items-baseline gap-[5px] rounded-md border bg-muted px-[7px] py-0.5 text-[13px] font-medium outline-none hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-9 max-md:items-center max-md:px-2.5 max-md:text-[15px]",
                x.aCargo && "border-foreground/20 bg-accent",
                x.ausente && "border-hd-rojo/50 bg-hd-rojo-bg text-hd-rojo",
                dropNombre === x.pid && "outline-2 outline-offset-1 outline-primary outline-dashed",
              )}
            >
              <span className={cn(x.ausente && "line-through")}>{x.nombre}</span>
              {x.tag && (
                <span className={cn("text-[11.5px] font-medium text-muted-foreground", x.aCargo && "text-foreground", x.ausente && "text-hd-rojo", x.nuevo && !x.ausente && "text-hd-ambar")}>{x.tag}</span>
              )}
            </button>
          ))}
          {!kPrimero && <ChipsContratistas ctl={ctl} c={c} />}
          {h.modo === "todo_el_dia" && h.choferId && (
            <span title="Chofer todo el día" className="inline-flex min-h-6 items-baseline gap-[5px] rounded-md border border-dashed px-[7px] py-0.5 text-[13px] font-medium max-md:min-h-9 max-md:items-center max-md:text-[15px]">
              {nombreDe(dia, h.choferId)}
              <span className="text-[11.5px] text-muted-foreground">chofer</span>
            </span>
          )}
          {!pasado && <AgregarPersona ctl={ctl} c={c} />}
        </div>
        {(h.integrantes.some((i) => i.nota) || h.contratistas.some((x) => x.nota)) && (
          <div className="grid gap-px text-xs text-muted-foreground">
            {h.integrantes.filter((i) => i.nota).map((i) => (
              <div key={i.id}>
                <b className="font-medium text-foreground">{nombreDe(dia, i.personaId)}</b> {i.nota}
              </div>
            ))}
            <NotasContratistas ctl={ctl} c={c} />
          </div>
        )}
      </div>

      <div className="grid gap-1 border-t px-3 pt-1 pb-1.5">
        {editando ? (
          <EditorChofer ctl={ctl} c={c} />
        ) : (
          <button
            type="button"
            disabled={pasado}
            onClick={() => ctl.setChEd({ c })}
            aria-label={`Chofer de la ${nombre}: cambiar`}
            className="-mx-1 min-w-0 rounded-md px-1 py-0.5 text-left text-[13px] leading-snug outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:bg-transparent max-md:py-1.5 max-md:text-sm"
          >
            <span className="text-muted-foreground">{resumen.k}</span>
            {resumen.resto.map((t, i) => (
              <span key={i} className={cn(t.mono && "font-mono text-xs tracking-tight")}>{t.t}</span>
            ))}
            {!pasado && <span className="ml-1 text-xs text-muted-foreground underline underline-offset-[3px]">cambiar</span>}
          </button>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px]">
          <span className="text-xs text-muted-foreground">Encuentro</span>
          {ctl.editEnc === c && !pasado ? (
            <EditorEncuentro ctl={ctl} c={c} />
          ) : (
            <button
              type="button"
              disabled={pasado}
              onClick={() => ctl.setEditEnc(c)}
              className="text-left underline decoration-foreground/25 underline-offset-[3px] outline-none hover:decoration-current focus-visible:ring-3 focus-visible:ring-ring/50 disabled:no-underline"
            >
              {encuentroTxt(dia, c)}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => ctl.abrirInstrucciones(c)}
            className="text-left text-muted-foreground underline decoration-foreground/25 underline-offset-[3px] outline-none hover:decoration-current focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {ins.n ? `Instrucciones (${ins.n})` : "+ Instrucciones"}
          </button>
        </div>
        {ins.lineas.length > 0 && (
          <div className="grid gap-px text-[12.5px] text-muted-foreground">
            {ins.lineas.map((l, i) => (
              <div key={i} className="truncate">
                {l.k && <b className="font-medium text-foreground">{l.k} </b>}
                {l.t}
              </div>
            ))}
          </div>
        )}
      </div>

      {sus ? null : conParte.length > 0 || ofrecerCierre ? (
        <div className="grid gap-1.5 border-t px-3 pt-1.5 pb-2 text-[13px]">
          {conParte.map((x) => (
            <JornadaCerrada key={x.o.otId} o={x.o} fecha={dia.fecha} conObra={ob.length > 1} onVer={() => ctl.cerrarJornada(c, x.o.otId)} />
          ))}
          {ofrecerCierre && (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="min-w-0 flex-1 text-muted-foreground">
                Terminó la jornada{conParte.length > 0 ? ` en ${sinParte.map((x) => x.o.corto).join(", ")}` : ""}.
              </span>
              <Button size="sm" variant="outline" onClick={() => ctl.cerrarJornada(c)}>Cerrar jornada</Button>
            </div>
          )}
        </div>
      ) : st.k === "borrador" && !bloq.length && !pasado ? (
        <div className="border-t px-3 pt-1 pb-2 text-xs text-muted-foreground">
          Lista para mandar{r ? ` · le llega a ${nombreDe(dia, r)}` : ""}
        </div>
      ) : null}
    </article>
  );
}
