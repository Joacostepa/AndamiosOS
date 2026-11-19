"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { MoreVertical, PanelRightClose, PanelRightOpen, Search, UserRound, UserRoundX } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AVISO, CORAL, PELIGRO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { direccionCorta, direccionDeObra } from "@/lib/tablero/titulo";
import { tipoOtLabel, type OtTablero } from "@/lib/tablero/tipos";
import type { AccionPm, PmDeObra } from "@/lib/tablero/pm";

// La columna derecha del tablero en MODO PM (pedido de JS del 19/11/2026).
//
// POR QUÉ UNA LISTA Y NO SÓLO LA GRILLA. La grilla muestra una semana y no muestra lo que
// todavía no tiene fecha. Si el modo PM sólo pintara tarjetas, el PM se enteraría de una obra
// recién cuando Operaciones ya le puso día, que es tarde para planos, cómputo y visita. Esta
// lista sale de TODAS las OTs del tablero (`data.ots`): las de la grilla, las planificadas más
// allá de lo cargado y las de la bandeja.
//
// LOS SIN PM VAN PRIMERO, y adentro por cuándo arrancan. Después lo de cada PM. En celular la
// lista es lo principal: la grilla en 390 px no sirve para repartir obras.

export type FilaProyecto = {
  ot: OtTablero;
  /** "tablero": tiene jornadas en las semanas cargadas; "adelante": más allá; "sinFecha": bandeja. */
  grupo: "tablero" | "adelante" | "sinFecha";
  /** Primera jornada planificada (o la fecha programada de Odoo si no está cargada). */
  primerDia: string | null;
  pm: PmDeObra | null;
  /** Sin PM y arranca en 2 días hábiles o menos. */
  urgente: boolean;
};

export function PanelProyectos({
  filas,
  yoId,
  esPm,
  colapsado,
  flotante,
  onColapsar,
  onIr,
  onTomar,
  acciones,
  hoy,
}: {
  /** Hoy en Buenos Aires: una obra que arrancó antes dice "en curso", no "arranca". */
  hoy: string;
  filas: FilaProyecto[];
  yoId: string | null;
  /** Quien mira es PM: ve "Tomar" y la sección "Míos". */
  esPm: boolean;
  colapsado: boolean;
  /** Celular: flota sobre la grilla en vez de ser una columna. */
  flotante: boolean;
  onColapsar: (v: boolean) => void;
  /** Llevar a la obra: destella su tarjeta, o abre su ficha si no está en la grilla. */
  onIr: (fila: FilaProyecto) => void;
  onTomar: (ot: OtTablero) => void;
  acciones: (ot: OtTablero) => AccionPm[] | null;
}) {
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      [f.ot.titulo, f.ot.direccionObra, f.pm?.pmNombre].some((x) => (x ?? "").toLowerCase().includes(q)),
    );
  }, [filas, busqueda]);

  // Lo que viene primero, y lo que YA ESTÁ EN CURSO al final: el PM nació el 19/11 y las obras
  // en curso desde antes no son lo que hay que repartir con apuro.
  const sinPm = visibles.filter((f) => !f.pm);
  const enCurso = (f: FilaProyecto) => f.grupo !== "sinFecha" && !!f.primerDia && f.primerDia < hoy;
  const grupos: { titulo: string; filas: FilaProyecto[]; vacio: string }[] = [
    { titulo: "Sin PM · arrancan en el tablero", filas: ordenar(sinPm.filter((f) => f.grupo === "tablero" && !enCurso(f))), vacio: "Todas tienen PM." },
    { titulo: "Sin PM · más adelante", filas: ordenar(sinPm.filter((f) => f.grupo === "adelante" && !enCurso(f))), vacio: "Todas tienen PM." },
    { titulo: "Sin PM · sin fecha todavía", filas: ordenar(sinPm.filter((f) => f.grupo === "sinFecha")), vacio: "Todas tienen PM." },
    { titulo: "Sin PM · ya en curso", filas: ordenar(sinPm.filter(enCurso)), vacio: "" },
  ];
  const conPm = visibles.filter((f) => f.pm);
  if (esPm && yoId) {
    grupos.push({ titulo: "Mías", filas: ordenar(conPm.filter((f) => f.pm!.pmId === yoId)), vacio: "Todavía no tomaste ninguna." });
  }
  const otros = new Map<string, { nombre: string; filas: FilaProyecto[] }>();
  for (const f of conPm) {
    if (esPm && f.pm!.pmId === yoId) continue;
    const g = otros.get(f.pm!.pmId) ?? { nombre: f.pm!.pmNombre, filas: [] };
    g.filas.push(f);
    otros.set(f.pm!.pmId, g);
  }
  for (const g of [...otros.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    grupos.push({ titulo: `De ${g.nombre}`, filas: ordenar(g.filas), vacio: "" });
  }

  const totalSinPm = filas.filter((f) => !f.pm).length;

  if (colapsado) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-l py-2">
        <button
          type="button"
          onClick={() => onColapsar(false)}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Mostrar proyectos"
          aria-label="Mostrar proyectos"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {totalSinPm > 0 && (
          <span
            className="rounded-full px-1.5 text-xs font-semibold"
            style={{ backgroundColor: AVISO.fondo, color: AVISO.texto, border: `1px solid ${AVISO.borde}` }}
            title={`${totalSinPm} obra(s) sin PM`}
          >
            {totalSinPm}
          </span>
        )}
        <span className="mt-1 text-xs uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Proyectos
        </span>
      </div>
    );
  }

  return (
    <div
      className={
        flotante
          ? "absolute inset-y-0 right-0 z-40 flex w-[min(340px,92vw)] flex-col border-l bg-card shadow-xl"
          : "flex w-[300px] shrink-0 flex-col border-l"
      }
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proyectos</p>
        {totalSinPm > 0 && (
          <span
            className="rounded-full px-1.5 text-xs font-semibold tabular-nums"
            style={{ backgroundColor: AVISO.fondo, color: AVISO.texto, border: `1px solid ${AVISO.borde}` }}
          >
            {totalSinPm} sin PM
          </span>
        )}
        <button
          type="button"
          onClick={() => onColapsar(true)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ocultar panel"
          aria-label="Ocultar panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="relative border-b px-2.5 py-2">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Dirección, cliente o PM…"
          aria-label="Buscar en los proyectos"
          className="h-8 pl-7 text-sm"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grupos.map((g) =>
          g.filas.length === 0 && !g.vacio ? null : (
            <section key={g.titulo} className="space-y-1.5 border-b px-2.5 py-2.5 last:border-b-0">
              <h3 className="flex justify-between text-[11px] font-semibold text-muted-foreground">
                <span>{g.titulo}</span>
                <span className="tabular-nums">{g.filas.length}</span>
              </h3>
              {g.filas.length === 0 ? (
                <p className="text-xs text-muted-foreground">{g.vacio}</p>
              ) : (
                g.filas.map((f) => (
                  <Fila
                    key={f.ot.id}
                    fila={f}
                    puedeTomar={esPm && !f.pm}
                    onIr={() => onIr(f)}
                    onTomar={() => onTomar(f.ot)}
                    acciones={acciones(f.ot)}
                    hoy={hoy}
                  />
                ))
              )}
            </section>
          ),
        )}
      </div>
    </div>
  );
}

function Fila({
  fila,
  puedeTomar,
  onIr,
  onTomar,
  acciones,
  hoy,
}: {
  hoy: string;
  fila: FilaProyecto;
  puedeTomar: boolean;
  onIr: () => void;
  onTomar: () => void;
  acciones: AccionPm[] | null;
}) {
  const { ot, pm, urgente } = fila;
  const direccion = direccionCorta(direccionDeObra({ direccionObra: ot.direccionObra, titulo: ot.titulo }));
  const sinPm = !pm;
  const color = urgente ? PELIGRO_TEXTO : AVISO.texto;
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5"
      style={
        sinPm
          ? { backgroundColor: urgente ? PELIGRO_SUAVE : AVISO.fondo, boxShadow: `inset 0 0 0 1px ${urgente ? PELIGRO : AVISO.borde}` }
          : { backgroundColor: "var(--muted)" }
      }
    >
      <button
        type="button"
        onClick={onIr}
        className="min-w-0 truncate text-left text-[13px] font-semibold hover:underline"
        title={ot.titulo}
      >
        {direccion}
      </button>
      <div className="flex items-center gap-1">
        {puedeTomar && (
          <button
            type="button"
            onClick={onTomar}
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: CORAL }}
          >
            Tomar
          </button>
        )}
        {acciones && acciones.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
                  aria-label="Opciones del PM"
                />
              }
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {acciones.map((a) => (
                <DropdownMenuItem key={a.clave} onClick={a.onClick} style={a.quitar ? { color: CORAL } : undefined}>
                  {a.quitar ? <UserRoundX className="mr-2 h-4 w-4" /> : <UserRound className="mr-2 h-4 w-4" />}
                  {a.etiqueta}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="col-span-2 truncate text-[11.5px]" style={sinPm ? { color } : { color: "var(--muted-foreground)" }}>
        {[tipoOtLabel(ot.tipo), cuando(fila, hoy), urgente ? "arranca ya" : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

/** Los que arrancan antes, primero; sin fecha, por lo prometido al cliente; después el resto. */
function ordenar(filas: FilaProyecto[]): FilaProyecto[] {
  const clave = (f: FilaProyecto) => f.primerDia ?? f.ot.fechaComprometida ?? "9999";
  return [...filas].sort((a, b) => clave(a).localeCompare(clave(b)));
}

function cuando(f: FilaProyecto, hoy: string): string {
  if (f.grupo === "sinFecha") {
    return f.ot.fechaComprometida ? `sin fecha · comprometida ${corta(f.ot.fechaComprometida)}` : "sin fecha";
  }
  if (!f.primerDia) return "planificada más adelante";
  if (f.primerDia < hoy) return `en curso desde ${corta(f.primerDia)}`;
  return `arranca ${corta(f.primerDia)}`;
}

function corta(iso: string): string {
  try {
    return format(parseISO(iso.slice(0, 10)), "EEE d/M", { locale: es });
  } catch {
    return iso.slice(0, 10);
  }
}
