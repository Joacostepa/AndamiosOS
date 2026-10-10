"use client";

// Elegir la obra (OT de Odoo) de un vale. La obra NO es obligatoria (docs §3): "Sin obra"
// va a Taller/Depósito. Se propone primero lo más probable —la OT de la cuadrilla hoy según
// Planificación, la última que usó esa persona, o (al devolver un sobrante) la de su
// último retiro— y el resto se busca.

import { useState } from "react";
import { normalizarNombre } from "@/lib/panol/kiosco";
import type { DatosKiosco } from "@/hooks/use-panol-kiosco";
import { Buscador, Opcion } from "./ui";

export type Propuesta = { otId: number; sub: string };

export function ListaObras({ valor, onChange, propuestas, datos, subSinObra = "Si no es para una obra" }: {
  valor: number | null;
  onChange: (ot: number | null) => void;
  propuestas: Propuesta[];
  datos: Pick<DatosKiosco, "ots" | "tituloOt">;
  subSinObra?: string;
}) {
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState(false);
  const propuestos = new Set(propuestas.map((p) => p.otId));
  const filtro = normalizarNombre(q);
  const otras = datos.ots
    .filter((o) => !propuestos.has(o.id))
    .filter((o) => !filtro || normalizarNombre(`${o.titulo} ${o.direccion ?? ""} ${o.id}`).includes(filtro))
    .slice(0, 40);
  // Si la elegida no está entre las propuestas (se buscó), se muestra arriba igual.
  const elegidaSuelta = valor !== null && !propuestos.has(valor);

  return (
    <div className="flex flex-col gap-2">
      {propuestas.map((p) => (
        <Opcion key={p.otId} titulo={datos.tituloOt(p.otId)} sub={p.sub} seleccionada={valor === p.otId} onClick={() => onChange(p.otId)} />
      ))}
      {elegidaSuelta && !buscar && <Opcion titulo={datos.tituloOt(valor)} sub="La que elegiste" seleccionada onClick={() => onChange(valor)} />}
      <Opcion titulo="Sin obra · Taller/Depósito" sub={subSinObra} seleccionada={valor === null} onClick={() => onChange(null)} />
      {buscar ? (
        <div className="mt-2 flex flex-col gap-2">
          <Buscador valor={q} onChange={setQ} etiqueta="Buscar la obra (número o dirección)" autoFocus />
          {otras.map((o) => (
            <Opcion
              key={o.id}
              titulo={o.titulo}
              sub={o.direccion ?? undefined}
              seleccionada={valor === o.id}
              onClick={() => {
                onChange(o.id);
                setBuscar(false);
                setQ("");
              }}
            />
          ))}
          {otras.length === 0 && <p className="px-1 text-base text-muted-foreground">No encuentro una obra activa con «{q}».</p>}
        </div>
      ) : (
        datos.ots.length > 0 && (
          <button type="button" onClick={() => setBuscar(true)} className="h-14 rounded-xl text-lg font-semibold underline underline-offset-4">
            Otra obra…
          </button>
        )
      )}
    </div>
  );
}

/** La obra elegida, con "Cambiar" que abre la lista. Para el pie del vale. */
export function SelectorObra(props: Parameters<typeof ListaObras>[0] & { titulo?: string }) {
  const [abierto, setAbierto] = useState(false);
  const { valor, propuestas, datos, titulo = "Para la obra" } = props;
  const sub = valor === null ? "Taller/Depósito" : propuestas.find((p) => p.otId === valor)?.sub;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
          <p className="text-lg font-semibold leading-snug">{datos.tituloOt(valor)}</p>
          {sub && valor !== null && <p className="text-base text-muted-foreground">{sub}</p>}
        </div>
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)} className="h-14 shrink-0 rounded-xl border-2 border-input px-4 text-lg font-semibold">
          {abierto ? "Listo" : "Cambiar"}
        </button>
      </div>
      {abierto && (
        <ListaObras
          {...props}
          onChange={(ot) => {
            props.onChange(ot);
            setAbierto(false);
          }}
        />
      )}
    </section>
  );
}
