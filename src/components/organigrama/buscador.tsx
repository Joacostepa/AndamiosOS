"use client";

// «¿A quién le pregunto por…?» (docs/organigrama/propuesta.md § 3.8). La pregunta manda sobre el
// dibujo: con texto, los resultados reemplazan al mapa; Esc o borrar el texto vuelven al mapa.
//
// RESPUESTA ÚTIL SIEMPRE: si el puesto que contesta está vacante o su ocupante está dado de
// baja, el resultado sube un nivel y dice a quién preguntarle en su lugar (quienResponde).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Chip } from "@/components/permisos-via-publica/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { areaDe, buscar, nombreCompleto, puestosDePersona, quienResponde, tramosCoincidencia, type UsoDoc } from "@/lib/organigrama/arbol";
import type { RolDoc } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { BotonLlamar, GrupoAvatares, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";

export function CampoBusqueda({ className }: { className?: string }) {
  const { busqueda, setBusqueda } = useOrg();
  const ref = useRef<HTMLInputElement>(null);

  // El atajo «/» le da foco (salvo que ya se esté escribiendo en otro campo).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setBusqueda("");
        }}
        placeholder="¿A quién le pregunto por…?"
        aria-label="¿A quién le pregunto por…? Buscá una tarea, un documento, un puesto o una persona"
        className="h-11 bg-card pr-10 pl-9 text-[14px] md:text-[14px] [&::-webkit-search-cancel-button]:hidden"
      />
      {busqueda ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 max-sm:size-9"
          onClick={() => {
            setBusqueda("");
            ref.current?.focus();
          }}
          aria-label="Borrar la búsqueda"
        >
          <X aria-hidden />
        </Button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[11px] text-muted-foreground sm:block">/</kbd>
      )}
    </div>
  );
}

/** El texto con las coincidencias resaltadas: fondo ámbar suave Y negrita (no depende del color). */
export function Resaltado({ texto, q }: { texto: string; q: string }) {
  const tramos = tramosCoincidencia(texto, q);
  if (!tramos.length) return <>{texto}</>;
  const partes: React.ReactNode[] = [];
  let i = 0;
  tramos.forEach(([a, b], k) => {
    if (a > i) partes.push(texto.slice(i, a));
    partes.push(
      <mark key={k} className="rounded-sm bg-amber-500/20 px-0.5 font-semibold text-foreground">
        {texto.slice(a, b)}
      </mark>,
    );
    i = b;
  });
  if (i < texto.length) partes.push(texto.slice(i));
  return <>{partes}</>;
}

/** Quién contesta por un puesto, con el botón de llamar. Si subió un nivel, lo dice. */
function Responde({ clave }: { clave: string }) {
  const { datos } = useOrg();
  const enlaces = useEnlaces();
  const r = quienResponde(datos, clave);
  if (!r) return null;
  if (!r.personas.length) return <span className="text-muted-foreground">Nadie asignado todavía.</span>;
  const nombres = r.personas.slice(0, 3).map(nombreCompleto).join(", ") + (r.personas.length > 3 ? ` y ${r.personas.length - 3} más` : "");
  return (
    <span className="relative z-10 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {r.subio && (
        <Chip tono={r.motivo === "baja" ? "bloqueo" : "aviso"}>{r.motivo === "baja" ? "Ocupante dado de baja" : "Vacante"}</Chip>
      )}
      <span>
        {r.subio && "preguntá a "}
        {r.personas.length === 1 ? (
          <Link href={enlaces.persona(r.personas[0].id)} scroll={false} className="font-medium underline-offset-2 hover:underline">
            {nombres}
          </Link>
        ) : (
          <span className="font-medium">{nombres}</span>
        )}
        {r.subio && <span className="text-muted-foreground"> ({r.nodo.titulo})</span>}
      </span>
      {r.personas.length === 1 && <BotonLlamar persona={r.personas[0]} />}
    </span>
  );
}

const TITULO_ROL: Record<RolDoc, string> = { emite: "Emite", firma: "Firma", recibe: "Recibe", usa: "Usa" };

function Grupo<T>({ titulo, items, render }: { titulo: string; items: T[]; render: (x: T, i: number) => React.ReactNode }) {
  const [todos, setTodos] = useState(false);
  if (!items.length) return null;
  const visibles = todos ? items : items.slice(0, 5);
  return (
    <section className="grid gap-2">
      <h2 className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo} ({items.length})
      </h2>
      <div className="overflow-hidden rounded-md border bg-card">{visibles.map(render)}</div>
      {items.length > 5 && (
        <Button variant="ghost" className="h-9 justify-self-start text-[13px] max-sm:h-10" onClick={() => setTodos((x) => !x)}>
          {todos ? "Ver menos" : `Ver los ${items.length}`}
        </Button>
      )}
    </section>
  );
}

export function ResultadosBusqueda() {
  const { datos, documentos, busqueda } = useOrg();
  const enlaces = useEnlaces();
  const q = busqueda.trim();
  const r = buscar(datos, documentos, q);

  if (!r.total) {
    return (
      <div className="rounded-md border border-dashed bg-card px-4 py-8 text-center text-[13.5px] text-muted-foreground">
        No encontramos «{q}». Probá con otra palabra (p. ej. «stock», «factura», «SOL»).
      </div>
    );
  }

  const fila = "relative border-b px-3 py-2.5 text-[13.5px] last:border-b-0 has-[a[data-estirado]:focus-visible]:ring-2 has-[a[data-estirado]:focus-visible]:ring-ring has-[a[data-estirado]:focus-visible]:ring-inset";

  return (
    <div className="grid gap-5" aria-live="polite">
      <p className="sr-only">{r.total} resultados</p>
      <Grupo
        titulo="Documentos"
        items={r.documentos}
        render={({ doc, usos }) => {
          const porRol = new Map<RolDoc, UsoDoc[]>();
          for (const u of usos) porRol.set(u.rol, [...(porRol.get(u.rol) ?? []), u]);
          return (
            <div key={doc.codigo} className="border-b px-3 py-3 last:border-b-0">
              <p className="text-[14px] font-semibold">
                <span className="font-mono">{doc.codigo}</span> · <Resaltado texto={doc.nombre} q={q} />
              </p>
              {usos.length === 0 && <p className="text-[13px] text-muted-foreground">Ninguna tarea lo menciona todavía.</p>}
              <dl className="mt-1.5 grid gap-1.5 text-[13px]">
                {[...porRol.entries()].map(([rol, us]) => (
                  <div key={rol} className="grid gap-1 sm:grid-cols-[4.5rem_1fr]">
                    <dt className="text-muted-foreground">{TITULO_ROL[rol]}:</dt>
                    <dd className="grid gap-1.5">
                      {us.map((u) => (
                        <div key={`${u.nodo.clave}-${u.tarea.texto}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={enlaces.puesto(u.nodo.clave)} scroll={false} className="font-medium underline-offset-2 hover:underline">
                            {u.nodo.titulo}
                          </Link>
                          <span aria-hidden className="text-muted-foreground">→</span>
                          <Responde clave={u.nodo.clave} />
                        </div>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        }}
      />
      <Grupo
        titulo="Tareas"
        items={r.tareas}
        render={({ nodo, tarea, indice }) => (
          <div key={`${nodo.clave}-${indice}`} className={cn(fila, "flex min-h-12 items-center gap-2")}>
            <div className="min-w-0 flex-1">
              <p>
                «<Resaltado texto={tarea.texto} q={q} />»
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                <Link href={enlaces.puesto(nodo.clave)} scroll={false} data-estirado className="outline-none after:absolute after:inset-0">
                  {nodo.titulo}
                </Link>
                <span aria-hidden>·</span>
                <Responde clave={nodo.clave} />
              </p>
            </div>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </div>
        )}
      />
      <Grupo
        titulo="Puestos"
        items={r.puestos}
        render={(nodo) => (
          <div key={nodo.clave} className={cn(fila, "flex min-h-12 items-center gap-2")}>
            <div className="min-w-0 flex-1">
              <Link href={enlaces.puesto(nodo.clave)} scroll={false} data-estirado className="font-medium outline-none after:absolute after:inset-0">
                <Resaltado texto={nodo.titulo} q={q} />
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                {nodo.tipo === "puesto" ? areaDe(datos.nodos, nodo.clave)?.titulo : nodo.rol}
                <span aria-hidden>·</span>
                <Responde clave={nodo.clave} />
              </p>
            </div>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </div>
        )}
      />
      <Grupo
        titulo="Personas"
        items={r.personas}
        render={(p) => {
          const puestos = puestosDePersona(datos, p.id);
          return (
            <div key={p.id} className={cn(fila, "flex min-h-12 items-center gap-3")}>
              <GrupoAvatares personas={[p]} enlazar={false} />
              <div className="min-w-0 flex-1">
                <Link href={enlaces.persona(p.id)} scroll={false} data-estirado className="font-medium outline-none after:absolute after:inset-0">
                  <Resaltado texto={nombreCompleto(p)} q={q} />
                </Link>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {!p.activo ? "Dado de baja" : puestos.length ? puestos.map((x) => x.detalle ?? x.nodo.titulo).join(" · ") : "Sin puesto"}
                </p>
              </div>
              {p.activo && (
                <span className="relative z-10">
                  <BotonLlamar persona={p} />
                </span>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
