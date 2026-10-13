"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisorFotos } from "@/components/mapa-obras/visor-fotos";
import type { FotoObra, ObraMapa } from "@/lib/mapa-obras/tipos";
import {
  categoriaCalle, COLOR_CATEGORIA, diasEntre, fmtFecha, fmtMetros, resumenFotos,
  TIPO_TEXTO, tieneUbicacion,
} from "@/lib/mapa-obras/categorias";
import { accion, accionPrincipal, foco, vidrio } from "./estilos";

// La ficha de la derecha. Lo más importante después de la dirección son las FOTOS de los
// partes: es lo que dice cómo está la obra hoy sin ir. Nada de plata (decisión del dueño).

const MINIATURAS = 8;

export function FichaObra({
  obra,
  hoy,
  onCerrar,
  onIrALaObra,
  className,
}: {
  obra: ObraMapa;
  hoy: string;
  onCerrar: () => void;
  onIrALaObra: (o: ObraMapa) => void;
  className?: string;
}) {
  const [visor, setVisor] = useState<{ fotos: FotoObra[]; i: number } | null>(null);

  const des = obra.estado === "desarmada";
  const pend = obra.estado === "pendiente_desarme";
  const color = des ? COLOR_CATEGORIA.desarmada : COLOR_CATEGORIA[categoriaCalle(obra)];
  const estado = des
    ? "Desarmada"
    : pend
      ? "Pendiente de desarme"
      : obra.diasArmado != null
        ? `${obra.diasArmado} días armada`
        : "Sin fecha de armado";
  const ubicada = tieneUbicacion(obra);
  const hayCoords = obra.lat != null && obra.lng != null && obra.ubicacion !== "lejos";
  const gm = hayCoords ? `https://www.google.com/maps/search/?api=1&query=${obra.lat},${obra.lng}` : null;
  const sv = hayCoords ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${obra.lat},${obra.lng}` : null;
  const m = obra.medidas;
  const fotosPartes = obra.fotos.filter((f) => f.origen === "parte");
  const fotosTelegram = obra.fotos.filter((f) => f.origen === "telegram");

  return (
    <aside aria-label={`Ficha de ${obra.direccionCorta}`} aria-live="polite" className={cn(vidrio, "overflow-y-auto", className)}>
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="text-[23px] font-bold leading-[1.05] tracking-tight">{obra.direccionCorta}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {obra.direccion}
              {obra.referencia ? ` · ${obra.referencia}` : ""} · <span className="font-mono">{obra.venta}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ficha"
            className={cn("grid size-[30px] shrink-0 place-items-center rounded-full border border-white/12 hover:border-white/35", foco)}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <span
          className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-[5px] text-xs font-semibold uppercase leading-none tracking-wide"
          style={{ background: `${color}26`, color }}
        >
          <span aria-hidden>●</span> {estado}
        </span>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Dato l="Armada el" v={fmtFecha(obra.fechaArmado)} />
          {des ? (
            <Dato l="Desarmada el" v={fmtFecha(obra.fechaDesarme)} />
          ) : pend ? (
            <Dato
              l="Desarme programado"
              v={obra.desarmeProgramado ? fmtFecha(obra.desarmeProgramado) : "sin fecha"}
              aviso={!obra.desarmeProgramado}
            />
          ) : (
            <Dato
              l="Fin estimado"
              v={
                obra.finEstimado
                  ? obra.vencida
                    ? `pasó hace ${diasEntre(obra.finEstimado, hoy)} d`
                    : fmtFecha(obra.finEstimado)
                  : "—"
              }
              aviso={obra.vencida}
            />
          )}
          <Dato l="Tipo" v={obra.tipo ? TIPO_TEXTO[obra.tipo] : "Sin tipo cargado"} />
          <Dato
            l={`Largo × ancho × alto${m.estimadas ? " (estimado)" : ""}`}
            v={`${fmtMetros(m.largo)} × ${fmtMetros(m.ancho)} × ${fmtMetros(m.alto)} m`}
            aviso={m.estimadas}
          />
          {des && obra.fechaArmado && obra.fechaDesarme && (
            <Dato l="Estuvo armada" v={`${diasEntre(obra.fechaArmado, obra.fechaDesarme)} días`} />
          )}
          {obra.fachada?.calle && (
            <Dato
              l={obra.fachada.coincideCalle ? "Calle en el mapa" : "Calle en el mapa (la más cercana)"}
              v={obra.fachada.calle}
            />
          )}
        </dl>

        {obra.fechaDeImportacion && (
          <Caja titulo="FECHA DUDOSA" aviso>
            El 24/03/2026 es la fecha de la importación. Los días reales pueden ser más.
          </Caja>
        )}
        {obra.ubicacion === "sin_altura" && (
          <Caja titulo="DIRECCIÓN SIN ALTURA" aviso>
            En Odoo la dirección no tiene calle y número, así que el punto cae en el centro de la localidad y no en
            la obra. Hay que completarla.
          </Caja>
        )}
        {obra.ubicacion === "lejos" && (
          <Caja titulo="UBICACIÓN EQUIVOCADA" aviso>
            Google ubicó esta dirección a más de 70 km de CABA. No se dibuja en el mapa hasta corregirla.
          </Caja>
        )}
        {obra.ubicacion === "sin_ubicacion" && (
          <Caja titulo="SIN UBICACIÓN" aviso>
            Esta obra no tiene coordenadas en Odoo. Se ubica sola cuando corra el proceso que ubica direcciones.
          </Caja>
        )}

        {fotosPartes.length > 0 ? (
          <GrupoFotos titulo="FOTOS DE LOS PARTES" fotos={fotosPartes} unidad="partes" onAbrir={(i) => setVisor({ fotos: fotosPartes, i })} />
        ) : (
          <Caja titulo="FOTOS DE LOS PARTES">
            Todavía no hay fotos de partes para esta obra.
            {!des && " Se suman solas cuando el capataz cierre el próximo parte con fotos."}
          </Caja>
        )}
        {fotosTelegram.length > 0 && (
          <GrupoFotos titulo="FOTOS DE TELEGRAM" fotos={fotosTelegram} onAbrir={(i) => setVisor({ fotos: fotosTelegram, i })} />
        )}

        <Caja
          titulo={`QUÉ ESTÁ ARMADO · ${
            obra.queEstaArmado
              ? obra.queEstaArmadoFuente === "obra"
                ? `confirmado en obra${obra.queEstaArmadoFecha ? ` el ${fmtFecha(obra.queEstaArmadoFecha)}` : ""}`
                : "según la OT de armado (previsto)"
              : "sin dato"
          }`}
        >
          {obra.queEstaArmado ?? "Nadie cargó todavía qué quedó armado en esta obra."}
        </Caja>

        <div className="flex flex-wrap gap-1.5">
          {pend && !obra.desarmeProgramado && (
            // No hay un link directo al tablero con el desarme de esta venta: se programa en Odoo.
            <a className={accionPrincipal} href={obra.url} target="_blank" rel="noopener noreferrer">
              Programar desarme
            </a>
          )}
          {pend && obra.desarmeProgramado && (
            <Link className={accion} href="/planificacion">
              Ver en el tablero
            </Link>
          )}
          {sv && gm && (
            <>
              <a className={accion} href={sv} target="_blank" rel="noopener noreferrer">
                Street View
              </a>
              <a className={accion} href={gm} target="_blank" rel="noopener noreferrer">
                Google Maps
              </a>
            </>
          )}
          {ubicada && (
            <button type="button" className={accion} onClick={() => onIrALaObra(obra)}>
              Ir a la obra
            </button>
          )}
          <a className={accion} href={obra.url} target="_blank" rel="noopener noreferrer">
            Abrir en Odoo <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>

      {visor && (
        <VisorFotos
          fotos={visor.fotos}
          indiceInicial={visor.i}
          titulo={obra.direccionCorta}
          onCerrar={() => setVisor(null)}
        />
      )}
    </aside>
  );
}

function Dato({ l, v, aviso }: { l: string; v: string; aviso?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <dt className="text-[11.5px] text-muted-foreground">{l}</dt>
      <dd className={cn("text-base font-semibold leading-tight tabular-nums", aviso && "text-amber-300")}>{v}</dd>
    </div>
  );
}

function Caja({ titulo, aviso, children }: { titulo: string; aviso?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "whitespace-pre-line rounded-lg px-3 py-2.5 text-[13px] leading-[1.45] [overflow-wrap:anywhere]",
        aviso ? "bg-amber-300/10" : "bg-white/[0.045]",
      )}
    >
      <span className="mb-1 block whitespace-normal font-mono text-[10.5px] leading-snug text-muted-foreground">{titulo}</span>
      {children}
    </div>
  );
}

function GrupoFotos({
  titulo,
  fotos,
  unidad,
  onAbrir,
}: {
  titulo: string;
  fotos: FotoObra[];
  /** "partes" cuenta en cuántos partes están; Telegram no tiene partes. */
  unidad?: "partes";
  onAbrir: (i: number) => void;
}) {
  const r = resumenFotos(fotos);
  const muestra = fotos.slice(0, MINIATURAS);
  const resto = fotos.length - MINIATURAS;
  const encabezado = [
    titulo,
    `${r.n} foto${r.n === 1 ? "" : "s"}${unidad && r.partes ? ` en ${r.partes} parte${r.partes === 1 ? "" : "s"}` : ""}`,
    r.ultima ? `última ${fmtFecha(r.ultima).slice(0, 5)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rounded-lg bg-white/[0.045] px-3 py-2.5">
      <span className="mb-1.5 block font-mono text-[10.5px] leading-snug text-muted-foreground">{encabezado}</span>
      <div className="grid grid-cols-4 gap-[5px]">
        {muestra.map((f, i) => {
          const ultimaConResto = i === muestra.length - 1 && resto > 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onAbrir(i)}
              aria-label={ultimaConResto ? `Ver las ${fotos.length} fotos` : `Ver foto ${i + 1}${f.fecha ? ` del ${fmtFecha(f.fecha)}` : ""}`}
              title={[f.descripcion, f.fecha ? fmtFecha(f.fecha) : null].filter(Boolean).join(" · ") || undefined}
              className={cn("group relative aspect-square overflow-hidden rounded-md bg-white/5", foco)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={f.descripcion ?? "Foto de la obra"}
                loading="lazy"
                className="size-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              {ultimaConResto && (
                <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-semibold text-white">
                  +{resto + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
