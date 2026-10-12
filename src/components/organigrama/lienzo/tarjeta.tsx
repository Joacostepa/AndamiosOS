"use client";

// La tarjeta viva de un puesto en el lienzo. Se ubica con transform (x, y) y viaja con un
// spring cada vez que cambia el layout: nunca salta. Nace desde la caja de su padre y, al
// colapsar, vuelve a meterse en él.
//
// - Franja de 4 px y punto con el color del ÁREA (identidad). Las áreas y la Dirección llevan el
//   tinte suave del área de fondo.
// - VACANTE: borde punteado que camina + un halo que respira, y el chip «Vacante». Con interino,
//   el borde punteado queda quieto y el chip dice «Interino» (no es urgente).
// - Toda la tarjeta es un <button> estirado (foco, clic, arrastre); los avatares y el botón de
//   colapsar quedan encima (z-10) para no anidar controles.

import { memo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { iniciales, nombreCompleto } from "@/lib/organigrama/arbol";
import { cn } from "@/lib/utils";
import { useArrastre, useFuenteArrastre } from "./arrastre";
import { RESORTE, useAcciones, varsArea, type EstadoDestino, type PersonaEnNodo, type Salida, type VistaNodo } from "./comun";

export type ModoTarjeta = {
  atenuada: boolean;
  resaltada: boolean;
  destino: EstadoDestino;
  arrastrada: boolean;
  /** Zoom semántico: lejos, la tarjeta se simplifica a nombre + conteo. */
  simple: boolean;
  editandoNombre: boolean;
  /** Retraso de entrada (expandir en cascada). */
  retraso: number;
  puedeEditar: boolean;
  /** Layout Árbol: los hijos cuelgan del centro, y ahí va el botón de colapsar (en lista, de la sangría). */
  arbol: boolean;
};

const TIPO: Record<string, string> = { direccion: "Dirección", area: "Área", puesto: "Puesto" };

function AvatarArrastrable({ p, clave, puedeArrastrar }: { p: PersonaEnNodo; clave: string; puedeArrastrar: boolean }) {
  const acciones = useAcciones();
  const { gesto } = useArrastre();
  const fuente = useFuenteArrastre(
    () => ({ tipo: "persona", persona: p.persona.id, desdeOcupante: p.ocupante, desdeNodo: clave }),
    !puedeArrastrar || !p.ocupante,
  );
  const nombre = nombreCompleto(p.persona);
  return (
    <motion.button
      type="button"
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={RESORTE}
      {...fuente}
      onClick={(e) => {
        e.stopPropagation();
        if (gesto.current.suprimirClick) return;
        acciones.abrirPersona(p.persona.id);
      }}
      title={`${nombre}${p.modalidad === "interino" ? " (interino)" : ""}${!p.persona.activo ? " · dado de baja" : ""}`}
      aria-label={`Ver a ${nombre}`}
      className={cn(
        "pointer-events-auto relative z-10 -ml-1 rounded-full ring-2 ring-card first:ml-0 focus-visible:outline-2 focus-visible:outline-ring",
        puedeArrastrar && p.ocupante && "cursor-grab active:cursor-grabbing",
      )}
    >
      <Avatar size="sm">
        <AvatarFallback
          className={cn(
            "text-[10.5px] font-medium",
            !p.persona.activo && "text-red-700 line-through dark:text-red-300",
            p.modalidad === "interino" && "border border-dashed border-blue-500/70",
          )}
        >
          {iniciales(p.persona)}
        </AvatarFallback>
      </Avatar>
    </motion.button>
  );
}

function Avatares({ vista, puedeEditar }: { vista: VistaNodo; puedeEditar: boolean }) {
  const max = 4;
  const visibles = vista.personas.slice(0, max);
  const resto = vista.personas.length - visibles.length;
  if (!vista.personas.length)
    return (
      <Avatar size="sm">
        <AvatarFallback className="border border-dashed border-muted-foreground/60 bg-transparent">
          <UserRound aria-hidden className="size-3.5 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
    );
  return (
    <div className="flex items-center">
      <AnimatePresence initial={false} mode="popLayout">
        {visibles.map((p) => (
          <AvatarArrastrable key={p.ocupante ?? p.persona.id} p={p} clave={vista.nodo.clave} puedeArrastrar={puedeEditar && !vista.deCuadrillas} />
        ))}
      </AnimatePresence>
      {resto > 0 && (
        <span className="relative z-0 -ml-1 inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10.5px] font-medium text-muted-foreground ring-2 ring-card">
          +{resto}
        </span>
      )}
    </div>
  );
}

function ChipsVivos({ vista }: { vista: VistaNodo }) {
  const e = vista.estado;
  const reducido = useReducedMotion();
  if (vista.nodo.tipo === "direccion") return null;
  return (
    <>
      {e.vacante && !e.interino && (
        <motion.span
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
          animate={reducido ? undefined : { opacity: [1, 0.55, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          Vacante
        </motion.span>
      )}
      {e.interino && (
        <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          Interino
        </span>
      )}
      {e.baja && (
        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
          Baja
        </span>
      )}
      {e.externo && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Externo</span>}
    </>
  );
}

/** El borde punteado que camina alrededor de una vacante (y el halo que respira). */
function BordeVacante({ w, h, urgente }: { w: number; h: number; urgente: boolean }) {
  const reducido = useReducedMotion();
  const animar = urgente && !reducido;
  return (
    <>
      {/* Siempre en el árbol (el servidor no sabe si hay «reducir movimiento»): solo cambia si respira. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-1.5 rounded-xl bg-amber-500/25 blur-md"
        initial={{ opacity: 0 }}
        animate={animar ? { opacity: [0.15, 0.7, 0.15], scale: [0.98, 1.02, 0.98] } : { opacity: urgente ? 0.25 : 0 }}
        transition={animar ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      />
      <svg aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-visible" width={w} height={h}>
        <motion.rect
          x={0.75}
          y={0.75}
          width={w - 1.5}
          height={h - 1.5}
          rx={8}
          fill="none"
          className={urgente ? "stroke-amber-500" : "stroke-muted-foreground/60"}
          strokeWidth={1.5}
          strokeDasharray="6 5"
          animate={animar ? { strokeDashoffset: [0, -22] } : undefined}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      </svg>
    </>
  );
}

function NombreEditable({ clave, titulo }: { clave: string; titulo: string }) {
  const acciones = useAcciones();
  const [valor, setValor] = useState(titulo);
  const confirmar = () => {
    acciones.renombrar(clave, valor);
    acciones.terminarNombre();
  };
  return (
    <input
      autoFocus
      data-sin-pan
      value={valor}
      aria-label="Nombre del puesto"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValor(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={confirmar}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") acciones.terminarNombre();
      }}
      maxLength={60}
      className="pointer-events-auto relative z-10 -mx-1 w-[calc(100%+0.5rem)] rounded-md border border-ring bg-background px-1 py-0.5 text-[13.5px] leading-snug font-semibold outline-none"
    />
  );
}

function TarjetaBase({ vista, modo }: { vista: VistaNodo; modo: ModoTarjeta }) {
  const acciones = useAcciones();
  const { gesto } = useArrastre();
  const reducido = useReducedMotion();
  const { nodo, caja, estado } = vista;
  const esArea = nodo.tipo !== "puesto";
  const raiz = nodo.dependeDe === null;
  const fuente = useFuenteArrastre(() => ({ tipo: "nodo", clave: nodo.clave }), !modo.puedeEditar || raiz || modo.editandoNombre);
  const vacanteUrgente = estado.vacante && !estado.interino && nodo.tipo !== "direccion";
  const sobre = modo.destino === "sobre";
  const sobreMal = modo.destino === "sobre-invalido";
  const t = { ...RESORTE, delay: modo.retraso };
  const n = vista.personas.length;

  return (
    <motion.div
      data-destino={`nodo:${nodo.clave}`}
      data-nodo={nodo.clave}
      className="absolute top-0 left-0"
      style={{ width: caja.w, height: caja.h, zIndex: sobre || modo.resaltada ? 3 : modo.arrastrada ? 0 : 1, ...varsArea(vista.color) }}
      initial={{ x: vista.desde.x, y: vista.desde.y, opacity: 0, scale: 0.5 }}
      animate={{
        x: caja.x,
        y: caja.y,
        scale: 1,
        opacity: modo.arrastrada ? 0.35 : modo.atenuada ? 0.22 : modo.destino === "invalido" ? 0.4 : 1,
      }}
      variants={{
        salir: (s: Salida) =>
          s && s.claves.has(nodo.clave)
            ? { x: s.a.x - caja.w / 2, y: s.a.y - caja.h / 2, scale: s.modo === "tacho" ? 0.1 : 0.4, opacity: 0, rotate: s.modo === "tacho" ? -12 : 0 }
            : { opacity: 0, scale: 0.6 },
      }}
      exit="salir"
      transition={{ x: t, y: t, scale: t, opacity: { duration: 0.25, delay: modo.retraso } }}
    >
      {vista.estado.vacante && nodo.tipo !== "direccion" && !modo.simple && <BordeVacante w={caja.w} h={caja.h} urgente={vacanteUrgente} />}
      <motion.div
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
          esArea && "bg-[var(--area-bg)]",
          vista.estado.vacante && nodo.tipo !== "direccion" && "border-transparent",
          modo.resaltada && "shadow-lg ring-2 ring-foreground/70",
          modo.destino === "valido" && "ring-2 ring-foreground/25",
          sobre && "shadow-xl ring-2 ring-foreground",
          sobreMal && "ring-2 ring-red-500",
          modo.arrastrada && "border-dashed",
        )}
        animate={sobreMal && !reducido ? { x: [0, -5, 5, -3, 3, 0], scale: 1 } : { x: 0, scale: sobre ? 1.045 : 1 }}
        whileHover={modo.puedeEditar && !reducido ? { y: -2 } : undefined}
        transition={{ ...RESORTE, x: { duration: 0.4, ease: "easeInOut" } }}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--area)]" />
        <button
          type="button"
          {...fuente}
          onClick={() => {
            if (gesto.current.suprimirClick) return;
            acciones.alClic(nodo.clave);
          }}
          aria-label={`${nodo.titulo}${estado.vacante && nodo.tipo !== "direccion" ? ", vacante" : ""}. Ver ficha`}
          className={cn(
            "absolute inset-0 z-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
            modo.puedeEditar && !raiz ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          )}
        />
        {modo.simple ? (
          <div className="pointer-events-none relative flex h-full flex-col justify-center gap-1 py-1.5 pr-3 pl-4">
            <p className={cn("line-clamp-2 leading-[1.15] font-bold", esArea ? "text-[20px] text-[var(--area-text)]" : "text-[18px]")}>{nodo.titulo}</p>
            <p className="text-[14px] leading-tight text-muted-foreground">
              {esArea
                ? `${vista.rama.puestos} puestos · ${vista.rama.personas} personas`
                : vacanteUrgente
                  ? "Vacante"
                  : `${n} ${n === 1 ? "persona" : "personas"}`}
            </p>
          </div>
        ) : (
          <div className="pointer-events-none relative flex h-full flex-col py-2 pr-2.5 pl-3.5">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--area)]" />
              <span className={cn(esArea && "text-[var(--area-text)]")}>{TIPO[nodo.tipo]}</span>
              {vista.marca && vista.marca !== "eliminado" && (
                <span className="ml-auto rounded border border-dashed border-muted-foreground/50 px-1 text-[10px] font-medium tracking-normal normal-case">
                  {vista.marca}
                </span>
              )}
            </div>
            <div className="mt-0.5 min-h-0">
              {modo.editandoNombre ? (
                <NombreEditable clave={nodo.clave} titulo={nodo.titulo} />
              ) : (
                <p className={cn("line-clamp-1 text-[13.5px] leading-snug font-semibold", esArea && "text-[var(--area-text)]")} title={nodo.titulo}>
                  {nodo.titulo}
                </p>
              )}
              {nodo.rol && <p className="truncate text-[11.5px] text-muted-foreground">{nodo.rol}</p>}
            </div>
            <div className="mt-auto flex items-center gap-1.5">
              <div className="pointer-events-auto">
                <Avatares vista={vista} puedeEditar={modo.puedeEditar} />
              </div>
              {vista.deCuadrillas && <span className="text-[11px] text-muted-foreground">{n} capataces</span>}
              <div className="ml-auto flex items-center gap-1">
                <ChipsVivos vista={vista} />
              </div>
            </div>
          </div>
        )}
      </motion.div>
      {(vista.cantHijos > 0 || vista.ocultos > 0) && (
        <button
          type="button"
          data-sin-pan
          onClick={() => acciones.alternar(nodo.clave)}
          aria-label={vista.ocultos ? `Mostrar ${vista.ocultos} puestos debajo de ${nodo.titulo}` : `Ocultar los puestos debajo de ${nodo.titulo}`}
          aria-expanded={!vista.ocultos}
          className={cn(
            "absolute -bottom-2.5 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border bg-card px-1 text-[10.5px] font-semibold text-muted-foreground shadow-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "-translate-x-1/2 transition-[left] duration-300 motion-reduce:transition-none",
            raiz || modo.arbol ? "left-1/2" : "left-[14px]",
          )}
        >
          {vista.ocultos ? `+${vista.ocultos}` : <Minus aria-hidden className="size-3" />}
        </button>
      )}
    </motion.div>
  );
}

function mismoModo(a: ModoTarjeta, b: ModoTarjeta): boolean {
  return (Object.keys(a) as (keyof ModoTarjeta)[]).every((k) => a[k] === b[k]);
}

/** Memo: con 25 tarjetas, solo se vuelven a pintar las que cambiaron de vista o de modo. */
export const Tarjeta = memo(TarjetaBase, (a, b) => a.vista === b.vista && mismoModo(a.modo, b.modo));
