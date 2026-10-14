"use client";

// Personas (docs/organigrama/propuesta.md § 3.9): todos, con sus puestos y su CARGA. Con 1
// puesto no se marca nada; con 2, el número en gris; con 3 o más, un chip de aviso: quien
// acumula puestos es lo que más le sirve ver al dueño.
//
// La agrupación (por área o plana) se recuerda en localStorage, con try/catch como en permisos.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Chip } from "@/components/permisos-via-publica/ui";
import { Input } from "@/components/ui/input";
import {
  areaDe,
  cargaPorPersona,
  jefesDe,
  nombreCompleto,
  normalizar,
  puestosDePersona,
  UMBRAL_SOBRECARGA,
  type PuestoDePersona,
} from "@/lib/organigrama/arbol";
import type { DatosOrg, Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { AvatarPersona, useEnlaces } from "./fila-ocupante";
import { useOrg } from "./proveedor";

type FiltroPersonas = "todas" | "sinPuesto" | "varios" | "bajas";
type Agrupar = "area" | "plana";
const CLAVE_AGRUPAR = "organigrama.personas.agrupar";

const ORIGEN: Record<Persona["origen"], string> = { legajo: "Legajo", usuario: "Usuario", externo: "Externo" };

function FilaPersona({ persona, puestos, datos }: { persona: Persona; puestos: PuestoDePersona[]; datos: DatosOrg }) {
  const enlaces = useEnlaces();
  const carga = new Set(puestos.map((p) => p.nodo.clave)).size;
  const jefes = jefesDe(datos, persona.id);
  return (
    <li className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2.5 last:border-b-0 has-[a[data-estirado]:focus-visible]:ring-2 has-[a[data-estirado]:focus-visible]:ring-ring has-[a[data-estirado]:focus-visible]:ring-inset hover:bg-muted/40">
      <AvatarPersona persona={persona} />
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={enlaces.persona(persona.id)}
          scroll={false}
          data-estirado
          className={cn("text-[13.5px] font-medium outline-none after:absolute after:inset-0", !persona.activo && "text-muted-foreground line-through")}
        >
          {nombreCompleto(persona)}
        </Link>
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Chip tono="neutro" sinIcono>
            {ORIGEN[persona.origen]}
            {persona.empresa ? ` · ${persona.empresa}` : ""}
          </Chip>
          {!persona.activo ? (
            <Chip tono="bloqueo">Dado de baja</Chip>
          ) : carga === 0 ? (
            <span>Sin puesto · {persona.origen === "legajo" ? "legajo activo" : "activo"}</span>
          ) : jefes.length ? (
            <span>reporta a {jefes.map(nombreCompleto).join(", ")}</span>
          ) : null}
        </p>
      </div>
      {puestos.length > 0 && (
        <ul className="flex max-w-full gap-1.5 overflow-x-auto max-sm:order-last max-sm:w-full sm:flex-wrap sm:justify-end">
          {puestos.map((p) => (
            <li key={`${p.nodo.clave}-${p.detalle ?? ""}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px]">
              <span aria-hidden className={cn("size-2 rounded-full", clasesArea(areaDe(datos.nodos, p.nodo.clave)?.color).punto)} />
              {p.detalle ?? p.nodo.titulo}
              {p.modalidad === "interino" && <span className="text-muted-foreground">(interino)</span>}
            </li>
          ))}
        </ul>
      )}
      {carga >= UMBRAL_SOBRECARGA ? (
        <Chip tono="aviso">{carga} puestos</Chip>
      ) : carga === 2 ? (
        <span className="w-5 text-right text-[12.5px] text-muted-foreground tabular-nums" title="2 puestos">
          2
        </span>
      ) : null}
    </li>
  );
}

export function ListaPersonas() {
  const { datos } = useOrg();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroPersonas>("todas");
  const [agrupar, setAgrupar] = useState<Agrupar>(() => {
    if (typeof window === "undefined") return "area";
    try {
      return window.localStorage.getItem(CLAVE_AGRUPAR) === "plana" ? "plana" : "area";
    } catch {
      return "area"; // sin almacenamiento: queda el de por defecto
    }
  });

  function elegirAgrupar(a: Agrupar) {
    setAgrupar(a);
    try {
      window.localStorage.setItem(CLAVE_AGRUPAR, a);
    } catch {
      /* sin almacenamiento */
    }
  }

  const carga = useMemo(() => cargaPorPersona(datos), [datos]);
  // Laura Paz solo existe como ocupante histórico: no se lista como persona del organigrama.
  const todas = useMemo(
    () =>
      datos.personas
        .filter((p) => p.activo || carga.has(p.id))
        .sort((a, b) => (a.apellido || a.nombre).localeCompare(b.apellido || b.nombre)),
    [datos.personas, carga],
  );
  const cuenta = {
    todas: todas.length,
    sinPuesto: todas.filter((p) => p.activo && !carga.has(p.id)).length,
    varios: todas.filter((p) => (carga.get(p.id) ?? 0) >= 2).length,
    bajas: todas.filter((p) => !p.activo).length,
  };
  const qn = normalizar(q.trim());
  const visibles = todas
    .filter((p) =>
      filtro === "sinPuesto" ? p.activo && !carga.has(p.id) : filtro === "varios" ? (carga.get(p.id) ?? 0) >= 2 : filtro === "bajas" ? !p.activo : true,
    )
    .filter((p) => !qn || normalizar(`${nombreCompleto(p)} ${p.empresa ?? ""}`).includes(qn));

  const grupos = new Map<string, { titulo: string; color?: Parameters<typeof clasesArea>[0]; personas: Persona[] }>();
  for (const p of visibles) {
    const primero = puestosDePersona(datos, p.id)[0];
    const area = primero ? areaDe(datos.nodos, primero.nodo.clave) : undefined;
    const k = agrupar === "plana" ? "todas" : (area?.clave ?? "sin");
    const titulo = agrupar === "plana" ? "Todas" : (area?.titulo ?? "Sin puesto");
    if (!grupos.has(k)) grupos.set(k, { titulo, color: area?.color, personas: [] });
    grupos.get(k)!.personas.push(p);
  }
  const orden = datos.nodos.filter((x) => x.tipo !== "puesto").map((x) => x.clave);
  const listaGrupos = [...grupos.entries()].sort(([a], [b]) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99));

  const VACIO: Record<FiltroPersonas, string> = {
    todas: "No hay personas con ese nombre.",
    sinPuesto: "Nadie sin puesto. Bien.",
    varios: "Nadie acumula puestos.",
    bajas: "No hay bajas con puesto.",
  };

  const boton = (id: FiltroPersonas, titulo: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={filtro === id}
      onClick={() => setFiltro(id)}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-ring max-sm:h-10",
        filtro === id ? "border-foreground bg-foreground font-semibold text-background" : "bg-card hover:bg-muted",
      )}
    >
      {titulo}
      <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", filtro === id ? "bg-background/20" : "bg-muted text-muted-foreground")}>
        {cuenta[id]}
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar persona"
            aria-label="Buscar persona"
            className="h-9 bg-card pl-9 max-sm:h-10"
          />
        </div>
        <div role="group" aria-label="Filtrar personas" className="flex flex-wrap gap-1.5">
          {boton("todas", "Todas")}
          {boton("sinPuesto", "Sin puesto")}
          {boton("varios", "2+ puestos")}
          {boton("bajas", "Bajas")}
        </div>
      </div>
      <div role="group" aria-label="Agrupar" className="flex items-center gap-1 text-[13px]">
        <span className="mr-1 text-muted-foreground">Ver:</span>
        {(["area", "plana"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={agrupar === a}
            onClick={() => elegirAgrupar(a)}
            className={cn(
              "h-9 rounded-md px-2.5 focus-visible:outline-2 focus-visible:outline-ring max-sm:h-10",
              agrupar === a ? "bg-muted font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a === "area" ? "Por área" : "Lista"}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-md border border-dashed bg-card px-4 py-8 text-center text-[13.5px] text-muted-foreground">{VACIO[filtro]}</p>
      ) : (
        listaGrupos.map(([k, g]) => (
          <section key={k} className="overflow-hidden rounded-md border bg-card">
            {agrupar === "area" && (
              <header className="flex items-center gap-2 border-b px-3 py-2">
                <span aria-hidden className={cn("size-2 rounded-full", g.color ? clasesArea(g.color).punto : "bg-muted-foreground/40")} />
                <h2 className="text-[14px] font-semibold">{g.titulo}</h2>
                <span className="rounded-full bg-muted px-2 text-[12px] text-muted-foreground tabular-nums">{g.personas.length}</span>
              </header>
            )}
            <ul>
              {g.personas.map((p) => (
                <FilaPersona key={p.id} persona={p} puestos={puestosDePersona(datos, p.id)} datos={datos} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
