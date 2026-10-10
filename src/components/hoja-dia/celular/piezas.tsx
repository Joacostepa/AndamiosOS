"use client";

import { useState } from "react";
import type { ArchivoPublico, CoordinadorPublico, LineaObra, ObraPublica, Trozo } from "@/lib/hoja-dia/vista";
import { telHref } from "./aplicar";
import { esPdf } from "./visor";
import s from "./celular.module.css";

// Las piezas que comparten la hoja del capataz y la del chofer: Llamar, las obras con
// "Para tu obra", Observaciones con "Ver más", las miniaturas de los planos.

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

/** "Llamar" (`tel:`). Sin número, el botón se ve pero no llama, y lo dice. */
export function Llamar({ nombre, telefono, texto, full, className }: { nombre: string; telefono: string | null; texto?: string; full?: boolean; className?: string }) {
  const label = texto ?? `Llamar a ${nombre}`;
  // "Llamar" solo (contacto, cada persona): el lector de pantalla dice a quién.
  const aria = label === "Llamar" ? `Llamar a ${nombre}` : undefined;
  if (!telefono) {
    return (
      <span className={cx(s.tbtn, s.sub, full && s.full, className)} aria-disabled="true" role="link" aria-label={`${aria ?? label}: no tiene el celular cargado`}>
        {label}
      </span>
    );
  }
  return <a className={cx(s.tbtn, s.sub, full && s.full, className)} href={telHref(telefono)} aria-label={aria}>{label}</a>;
}

export function LlamarCoordinador({ coordinador }: { coordinador: CoordinadorPublico }) {
  return (
    <>
      <Llamar nombre={coordinador.nombre} telefono={coordinador.telefono} full />
      {!coordinador.telefono && <span className={s.sinNum}>Todavía no está cargado el celular de {coordinador.nombre}.</span>}
    </>
  );
}

export function Trozos({ l }: { l: Trozo[] }) {
  return <>{l.map((x, i) => (x.b ? <b key={i}>{x.t}</b> : <span key={i}>{x.t}</span>))}</>;
}

export function LineaPtObra({ l }: { l: LineaObra }) {
  const tono = l.tono === "ok" ? s.okTx : l.tono === "no" ? s.noTx : undefined;
  return (
    <div>
      {l.b && <b>{l.b}</b>}
      {l.t}
      {l.estado && <span className={tono}>{l.estado}</span>}
    </div>
  );
}

const Flecha = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
function Tipo({ tipo, txt }: { tipo: string; txt: string }) {
  const cls = tipo === "armado" ? s.armado : tipo === "desarme" ? s.desarme : s.otro;
  const ic = tipo === "armado" ? "M8 13V3M4 7l4-4 4 4" : tipo === "desarme" ? "M8 3v10M4 9l4 4 4-4" : "M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z";
  return <span className={cx(s.tipo, cls)}><Flecha d={ic} />{txt}</span>;
}

function Miniatura({ a, n, total, onAbrir }: { a: ArchivoPublico; n: number; total: number; onAbrir: () => void }) {
  const [fallo, setFallo] = useState(false);
  if (esPdf(a)) {
    return (
      <a className={s.thumb} href={a.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${a.nombre} (PDF)`}>
        <span className={s.pdf}><b>PDF</b><span>{a.nombre}</span></span>
      </a>
    );
  }
  return (
    <button type="button" className={s.thumb} onClick={onAbrir} aria-label={`Abrir plano o foto ${n} de ${total}: ${a.nombre}`}>
      {fallo ? <span>Sin señal</span> : (
        // eslint-disable-next-line @next/next/no-img-element -- archivo de Odoo servido por la app, sin optimizar
        <img src={a.url} alt="" loading="lazy" decoding="async" onError={() => setFallo(true)} />
      )}
    </button>
  );
}

/**
 * Una obra (maqueta obraTel). La primera va abierta; las demás plegadas con su hora a la
 * vista. El cuerpo de una plegada no se dibuja (ni carga sus miniaturas) hasta que se abre.
 */
export function Obra({ o, abierta, onVisor }: { o: ObraPublica; abierta: boolean; onVisor: (archivos: ArchivoPublico[], i: number, titulo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const obsLarga = (o.observaciones?.length ?? 0) > 110;
  const head = (
    <>
      <div className={s.tobH}>
        <span className={s.n}>{o.n}</span>
        <span className={s.hr}>{o.hora}</span>
        <h3>{o.direccion}</h3>
        {!abierta && <span className={s.mas} aria-hidden>{open ? "cerrar" : "ver"}</span>}
      </div>
      <div className={s.tp}><Tipo tipo={o.tipo} txt={o.tipoTxt} /> {o.detalle}</div>
    </>
  );
  const body = (
    <div className={s.bd}>
      {o.hoy && <div className={s.hoy}>Hoy: {o.hoy}</div>}
      {o.chips.length > 0 && <ul>{o.chips.map((c) => <li key={c}>{c}</li>)}</ul>}
      {o.paraTuObra.length > 0 && (
        <div className={s.ptobra}>
          <span className={s.tk}>Para tu obra</span>
          {o.paraTuObra.map((l, i) => <LineaPtObra key={i} l={l} />)}
        </div>
      )}
      {o.queHacer && <div><span className={s.tk}>Qué hay que hacer</span><br /><span className={cx(s.mono, s.queHacer)}>{o.queHacer}</span></div>}
      {o.observaciones && (
        <div>
          <span className={s.tk}>Observaciones</span>
          <div className={verMas || !obsLarga ? undefined : s.clamp}>{o.observaciones}</div>
          {obsLarga && !verMas && <button type="button" className={cx(s.tbtn, s.full, s.sub, s.m48)} onClick={() => setVerMas(true)}>Ver más</button>}
        </div>
      )}
      {o.archivos.length > 0 && (
        <div>
          <span className={s.tk}>Planos y fotos</span>
          <div className={s.thumbs}>
            {o.archivos.slice(0, 3).map((a, i) => (
              <Miniatura key={a.id} a={a} n={i + 1} total={o.archivos.length} onAbrir={() => onVisor(o.archivos, i, o.direccion)} />
            ))}
          </div>
          {o.archivos.length > 3 && (
            <button type="button" className={cx(s.tbtn, s.full, s.sub, s.m52)} onClick={() => onVisor(o.archivos, 0, o.direccion)}>
              Ver los {o.archivos.length} planos y fotos
            </button>
          )}
        </div>
      )}
      {o.contacto && (
        <div className={s.cont}>
          <span className={s.t}><span className={s.tk}>Contacto en obra</span><br />{o.contacto}</span>
          <Llamar nombre={o.contacto} telefono={o.telefono} texto="Llamar" />
        </div>
      )}
      <a className={cx(s.tbtn, s.full, s.sub)} href={o.mapsUrl} target="_blank" rel="noreferrer">Cómo llegar</a>
    </div>
  );
  if (abierta) return <section className={s.tob} aria-label={`Obra ${o.n}: ${o.direccion}`}>{head}{body}</section>;
  return (
    <details className={s.tob} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{head}</summary>
      {open && body}
    </details>
  );
}
