"use client";

// La tarjeta viva de un nodo en el lienzo. Se ubica con transform (x, y) y viaja con un spring
// cada vez que cambia el layout: nunca salta. Nace desde la caja de su padre y, al colapsar,
// vuelve a meterse en él.
//
// JERARQUÍA SIN LEER (cada clase tiene su tamaño en layout.ts):
// - DIRECCIÓN: la más grande, invertida (fondo de texto), con el resumen de toda la empresa.
// - ÁREA: encabezado con el color del área (banda arriba + tinte), título grande, responsable y
//   resumen «puestos · personas · vacantes». La SUBÁREA es igual, un escalón más chica.
// - PUESTO: compacta, fondo neutro; el color del área solo en la franja lateral.
//
// VACANTES CALMAS: sin ocupante, un puesto se ve neutro (avatar vacío y «Sin asignar»; un externo,
// «Sin cargar»; un área, «Sin responsable»). El tratamiento fuerte (borde punteado que camina,
// halo, chip «Vacante») queda para las BÚSQUEDAS ABIERTAS y para cuando el usuario activa
// «Resaltar vacantes». Con interino, el borde punteado queda quieto y el chip dice «Interino».
//
// RENOMBRAR (editores): doble clic sobre el título o el rol, o F2 con la tarjeta enfocada →
// edición en línea. Enter o salir del campo guardan; Esc cancela; un título vacío no se acepta.
// El clic simple sobre el título espera un instante por si es doble clic (el resto, inmediato).
//
// Toda la tarjeta es un <button> estirado (foco, clic, arrastre); los avatares y el botón de
// colapsar quedan encima (z-10) para no anidar controles.

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { iniciales, nombreCompleto } from "@/lib/organigrama/arbol";
import { cn } from "@/lib/utils";
import { useArrastre, useFuenteArrastre } from "./arrastre";
import { RESORTE, useAcciones, varsArea, type CampoEditable, type EstadoDestino, type PersonaEnNodo, type Salida, type VistaNodo } from "./comun";

export type ModoTarjeta = {
  atenuada: boolean;
  resaltada: boolean;
  destino: EstadoDestino;
  arrastrada: boolean;
  /** Zoom semántico: lejos, la tarjeta se simplifica a nombre + conteo. */
  simple: boolean;
  /** Qué se está editando en línea (o nada). */
  editando: CampoEditable | null;
  /** Retraso de entrada (expandir en cascada). */
  retraso: number;
  puedeEditar: boolean;
  /** Layout Árbol: los hijos cuelgan del centro, y ahí va el botón de colapsar (en lista, de la sangría). */
  arbol: boolean;
  /** «Resaltar vacantes»: todo lo que no tiene titular lleva el tratamiento fuerte. */
  resaltarVacantes: boolean;
};

/** Cuánto espera un clic sobre el título por si llega el segundo (doble clic = renombrar). */
const ESPERA_DOBLE_CLIC = 230;

function AvatarArrastrable({ p, clave, puedeArrastrar, anillo }: { p: PersonaEnNodo; clave: string; puedeArrastrar: boolean; anillo: string }) {
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
        "pointer-events-auto relative z-10 -ml-1 rounded-full ring-2 first:ml-0 focus-visible:outline-2 focus-visible:outline-ring",
        anillo,
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

function Avatares({ vista, puedeEditar, anillo = "ring-card" }: { vista: VistaNodo; puedeEditar: boolean; anillo?: string }) {
  const max = 4;
  const visibles = vista.personas.slice(0, max);
  const resto = vista.personas.length - visibles.length;
  if (!vista.personas.length)
    return (
      <Avatar size="sm">
        <AvatarFallback className="bg-muted/50">
          <UserRound aria-hidden className="size-3.5 text-muted-foreground/80" />
        </AvatarFallback>
      </Avatar>
    );
  return (
    <div className="flex items-center">
      <AnimatePresence initial={false} mode="popLayout">
        {visibles.map((p) => (
          <AvatarArrastrable key={p.ocupante ?? p.persona.id} p={p} clave={vista.nodo.clave} puedeArrastrar={puedeEditar && !vista.deCuadrillas} anillo={anillo} />
        ))}
      </AnimatePresence>
      {resto > 0 && (
        <span className={cn("relative z-0 -ml-1 inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10.5px] font-medium text-muted-foreground ring-2", anillo)}>
          +{resto}
        </span>
      )}
    </div>
  );
}

/** El texto de ocupación cuando no hay nadie, o quién es si hay uno solo. */
function textoOcupacion(vista: VistaNodo): string {
  const n = vista.personas.length;
  if (vista.deCuadrillas) return `${n} ${n === 1 ? "capataz" : "capataces"}`;
  if (n === 1) return nombreCompleto(vista.personas[0].persona);
  if (n > 1) return `${n} personas`;
  if (vista.cajaExterna) return "Sin cargar";
  return vista.clase === "puesto" ? "Sin asignar" : "Sin responsable";
}

function ChipsVivos({ vista, urgente }: { vista: VistaNodo; urgente: boolean }) {
  const e = vista.estado;
  const reducido = useReducedMotion();
  if (vista.nodo.tipo === "direccion") return null;
  return (
    <>
      {urgente && (
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
function BordeVacante({ w, h, urgente, rx }: { w: number; h: number; urgente: boolean; rx: number }) {
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
          rx={rx}
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

/** El campo de edición en línea (título o rol). Reemplaza al texto, con su mismo tamaño. */
function CampoEnLinea({ clave, campo, valor, className }: { clave: string; campo: CampoEditable; valor: string; className?: string }) {
  const acciones = useAcciones();
  const [texto, setTexto] = useState(valor);
  const cancelado = useRef(false);
  const vacioInvalido = campo === "titulo" && !texto.trim();
  const terminar = () => {
    if (!cancelado.current && !vacioInvalido) acciones.guardarEdicion(clave, campo, texto);
    acciones.terminarEdicion();
  };
  return (
    <input
      autoFocus
      data-sin-pan
      value={texto}
      aria-label={campo === "titulo" ? "Nombre" : "Rol o subtítulo (vacío lo saca)"}
      aria-invalid={vacioInvalido || undefined}
      placeholder={campo === "titulo" ? "Escribí un nombre" : "Rol (opcional)"}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTexto(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={terminar}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          // Vacío no se acepta: el campo queda abierto (y marcado) hasta que haya un nombre o Esc.
          if (vacioInvalido) e.preventDefault();
          else e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancelado.current = true;
          e.currentTarget.blur();
        }
      }}
      maxLength={campo === "titulo" ? 60 : 80}
      className={cn(
        "pointer-events-auto relative z-10 -mx-1 w-[calc(100%+0.5rem)] min-w-0 rounded-md border border-ring bg-background px-1 py-0 text-foreground outline-none aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/30",
        className,
      )}
    />
  );
}

/** Título o rol: texto, o el campo en línea si se está editando. `data-editable` marca dónde vale el doble clic. */
function Texto({
  vista,
  modo,
  campo,
  className,
  editarClassName,
}: {
  vista: VistaNodo;
  modo: ModoTarjeta;
  campo: CampoEditable;
  className: string;
  editarClassName?: string;
}) {
  const valor = campo === "titulo" ? vista.nodo.titulo : (vista.nodo.rol ?? "");
  if (modo.editando === campo) return <CampoEnLinea clave={vista.nodo.clave} campo={campo} valor={valor} className={editarClassName ?? className} />;
  if (!valor) return null;
  return (
    <p data-editable={modo.puedeEditar ? campo : undefined} className={className} title={valor}>
      {valor}
    </p>
  );
}

function Marca({ vista, invertida }: { vista: VistaNodo; invertida?: boolean }) {
  if (!vista.marca || vista.marca === "eliminado") return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded border border-dashed px-1 text-[10px] font-medium tracking-normal normal-case",
        invertida ? "border-background/50" : "border-muted-foreground/50 text-muted-foreground",
      )}
    >
      {vista.marca}
    </span>
  );
}

function resumenRama(vista: VistaNodo): string {
  const { puestos, personas, vacantes } = vista.rama;
  const partes = [`${puestos} ${puestos === 1 ? "puesto" : "puestos"}`, `${personas} ${personas === 1 ? "persona" : "personas"}`];
  if (vista.clase !== "direccion") partes.push(`${vacantes} ${vacantes === 1 ? "vacante" : "vacantes"}`);
  return partes.join(" · ");
}

// ── Contenido por clase ──────────────────────────────────────────────────────

function ContenidoDireccion({ vista, modo }: { vista: VistaNodo; modo: ModoTarjeta }) {
  if (modo.simple)
    return (
      <div className="pointer-events-none relative flex h-full flex-col justify-center gap-1 px-4">
        <p className="line-clamp-2 text-[26px] leading-[1.1] font-bold">{vista.nodo.titulo}</p>
        <p className="text-[15px] leading-tight opacity-75">{resumenRama(vista)}</p>
      </div>
    );
  return (
    <div className="pointer-events-none relative flex h-full flex-col px-4 py-2.5">
      <div className="flex min-h-4 items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase opacity-70">
        {/* Si el título ya dice «Dirección», la etiqueta sobra. */}
        {!/direcci[oó]n/i.test(vista.nodo.titulo) && "Dirección"}
        <Marca vista={vista} invertida />
      </div>
      <Texto vista={vista} modo={modo} campo="titulo" className="line-clamp-1 text-[22px] leading-tight font-bold" editarClassName="text-[19px] font-bold" />
      <Texto vista={vista} modo={modo} campo="rol" className="truncate text-[12px] opacity-75" editarClassName="text-[12px]" />
      <div className="mt-auto flex items-center gap-2">
        <div className="pointer-events-auto">
          <Avatares vista={vista} puedeEditar={modo.puedeEditar} anillo="ring-foreground" />
        </div>
        <span className="truncate text-[11.5px] opacity-75">{resumenRama(vista)}</span>
      </div>
    </div>
  );
}

function ContenidoArea({ vista, modo, urgente }: { vista: VistaNodo; modo: ModoTarjeta; urgente: boolean }) {
  const sub = vista.clase === "subarea";
  if (modo.simple)
    return (
      <div className="pointer-events-none relative flex h-full flex-col justify-center gap-1 bg-[var(--area-bg)] px-3.5 pt-1">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-[var(--area)]" />
        <p className={cn("line-clamp-2 leading-[1.1] font-bold text-[var(--area-text)]", sub ? "text-[19px]" : "text-[22px]")}>{vista.nodo.titulo}</p>
        <p className="text-[14px] leading-tight text-[var(--area-text)] opacity-80">
          {vista.rama.puestos} puestos · {vista.rama.personas} personas
        </p>
      </div>
    );
  return (
    <div className="pointer-events-none relative flex h-full flex-col">
      <div className={cn("relative bg-[var(--area-bg)] px-3 pb-1.5", sub ? "pt-1.5" : "pt-2")}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[var(--area)]" />
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--area-text)] uppercase opacity-80">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--area)]" />
          {sub ? "Subárea" : "Área"}
          <Marca vista={vista} />
        </div>
        <Texto
          vista={vista}
          modo={modo}
          campo="titulo"
          className={cn("line-clamp-1 leading-tight font-bold text-[var(--area-text)]", sub ? "text-[14.5px]" : "text-[16px]")}
          editarClassName={cn("font-bold", sub ? "text-[14px]" : "text-[15px]")}
        />
        <Texto vista={vista} modo={modo} campo="rol" className="truncate text-[11.5px] text-[var(--area-text)] opacity-75" editarClassName="text-[11.5px]" />
      </div>
      {/* Abajo deja lugar para el botón de colapsar (en el árbol cae en el centro del borde). */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 px-3 pt-1 pb-3">
        <div className="flex items-center gap-1.5">
          <div className="pointer-events-auto">
            <Avatares vista={vista} puedeEditar={modo.puedeEditar} />
          </div>
          {!urgente && <span className={cn("truncate text-[11.5px]", vista.personas.length ? "font-medium" : "text-muted-foreground")}>{textoOcupacion(vista)}</span>}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ChipsVivos vista={vista} urgente={urgente} />
          </div>
        </div>
        <p className="truncate text-[11px] text-muted-foreground tabular-nums">{resumenRama(vista)}</p>
      </div>
    </div>
  );
}

function ContenidoPuesto({ vista, modo, urgente }: { vista: VistaNodo; modo: ModoTarjeta; urgente: boolean }) {
  const n = vista.personas.length;
  if (modo.simple)
    return (
      <div className="pointer-events-none relative flex h-full flex-col justify-center gap-0.5 py-1 pr-2.5 pl-3.5">
        <p className="line-clamp-2 text-[17px] leading-[1.1] font-bold">{vista.nodo.titulo}</p>
        <p className={cn("text-[13px] leading-tight", urgente ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {urgente ? "Vacante" : n === 1 && !vista.deCuadrillas ? "1 persona" : textoOcupacion(vista)}
        </p>
      </div>
    );
  return (
    <div className="pointer-events-none relative flex h-full flex-col py-1.5 pr-2 pl-3">
      <div className="flex items-start gap-1">
        <Texto vista={vista} modo={modo} campo="titulo" className="line-clamp-1 min-w-0 text-[13px] leading-snug font-semibold" editarClassName="text-[13px] font-semibold" />
        <Marca vista={vista} />
      </div>
      <Texto vista={vista} modo={modo} campo="rol" className="truncate text-[11px] leading-snug text-muted-foreground" editarClassName="text-[11px]" />
      <div className="mt-auto flex items-center gap-1.5">
        <div className="pointer-events-auto">
          <Avatares vista={vista} puedeEditar={modo.puedeEditar} />
        </div>
        {!urgente && (n <= 1 || vista.deCuadrillas) && (
          <span className={cn("truncate text-[11px]", n === 1 && !vista.deCuadrillas ? "font-medium" : "text-muted-foreground")}>{textoOcupacion(vista)}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ChipsVivos vista={vista} urgente={urgente} />
        </div>
      </div>
    </div>
  );
}

/** ¿El clic cayó sobre el título o el rol (lo que se renombra con doble clic)? */
function campoBajo(e: React.MouseEvent<HTMLElement>): CampoEditable | null {
  if (!e.detail) return null; // teclado: Enter / Espacio abren la ficha
  const marco = e.currentTarget.parentElement;
  if (!marco) return null;
  for (const el of marco.querySelectorAll<HTMLElement>("[data-editable]")) {
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) return el.dataset.editable as CampoEditable;
  }
  return null;
}

function TarjetaBase({ vista, modo }: { vista: VistaNodo; modo: ModoTarjeta }) {
  const acciones = useAcciones();
  const { gesto } = useArrastre();
  const reducido = useReducedMotion();
  const { nodo, caja, estado, clase } = vista;
  const raiz = nodo.dependeDe === null;
  const fuente = useFuenteArrastre(() => ({ tipo: "nodo", clave: nodo.clave }), !modo.puedeEditar || raiz || !!modo.editando);
  const sinTitular = estado.vacante && clase !== "direccion";
  // Fuerte solo si es una búsqueda abierta o si el usuario pidió resaltar las vacantes.
  const urgente = sinTitular && !estado.interino && (vista.busqueda || modo.resaltarVacantes);
  const borde = !modo.simple && (urgente || (sinTitular && estado.interino));
  const sobre = modo.destino === "sobre";
  const sobreMal = modo.destino === "sobre-invalido";
  const t = { ...RESORTE, delay: modo.retraso };
  // MotionConfig «reducir movimiento» apaga los transform, no el ancho y el alto: acá también.
  const tt = reducido ? { duration: 0 } : t;
  const redondeo = clase === "puesto" ? 8 : 12;
  const espera = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(espera.current), []);

  const puedeRenombrar = modo.puedeEditar && !modo.simple && !modo.editando;

  return (
    <motion.div
      data-destino={`nodo:${nodo.clave}`}
      data-nodo={nodo.clave}
      className="absolute top-0 left-0"
      style={{ zIndex: sobre || modo.resaltada ? 3 : modo.arrastrada ? 0 : 1, ...varsArea(vista.color) }}
      initial={{ x: vista.desde.x, y: vista.desde.y, width: caja.w, height: caja.h, opacity: 0, scale: 0.5 }}
      animate={{
        x: caja.x,
        y: caja.y,
        width: caja.w,
        height: caja.h,
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
      transition={{ x: t, y: t, width: tt, height: tt, scale: t, opacity: { duration: 0.25, delay: modo.retraso } }}
    >
      {borde && <BordeVacante w={caja.w} h={caja.h} urgente={urgente} rx={redondeo} />}
      <motion.div
        className={cn(
          "relative flex h-full flex-col overflow-hidden border transition-shadow",
          clase === "direccion"
            ? "rounded-xl border-foreground bg-foreground text-background shadow-lg"
            : clase === "puesto"
              ? "rounded-lg bg-card shadow-sm"
              : "rounded-xl border-[color-mix(in_oklab,var(--area)_55%,transparent)] bg-card shadow-md",
          borde && "border-transparent",
          // Lejos (sin el borde animado), una vacante resaltada lleva un borde punteado quieto.
          modo.simple && urgente && "border-2 border-dashed border-amber-500",
          modo.resaltada && "shadow-lg ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
          modo.destino === "valido" && "ring-2 ring-foreground/25",
          sobre && "shadow-xl ring-2 ring-foreground",
          sobreMal && "ring-2 ring-red-500",
          modo.arrastrada && "border-dashed",
        )}
        animate={sobreMal && !reducido ? { x: [0, -5, 5, -3, 3, 0], scale: 1 } : { x: 0, scale: sobre ? 1.045 : 1 }}
        whileHover={modo.puedeEditar && !reducido && !modo.editando ? { y: -2 } : undefined}
        transition={{ ...RESORTE, x: { duration: 0.4, ease: "easeInOut" } }}
      >
        {clase === "puesto" && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--area)]" />}
        <button
          type="button"
          {...fuente}
          onClick={(e) => {
            if (gesto.current.suprimirClick) return;
            const campo = puedeRenombrar ? campoBajo(e) : null;
            if (!campo) return acciones.alClic(nodo.clave);
            window.clearTimeout(espera.current);
            if (e.detail >= 2) return acciones.editar(nodo.clave, campo);
            espera.current = window.setTimeout(() => acciones.alClic(nodo.clave), ESPERA_DOBLE_CLIC);
          }}
          onKeyDown={(e) => {
            if (!modo.puedeEditar || modo.editando) return;
            if (e.key === "F2") {
              e.preventDefault();
              acciones.editar(nodo.clave, "titulo");
            } else if ((e.key === "Delete" || e.key === "Backspace") && nodo.dependeDe) {
              e.preventDefault();
              acciones.eliminar(nodo.clave);
            }
          }}
          aria-keyshortcuts={modo.puedeEditar ? (nodo.dependeDe ? "F2 Delete" : "F2") : undefined}
          aria-label={`${nodo.titulo}${sinTitular && !estado.interino ? (vista.cajaExterna ? ", sin cargar" : clase === "puesto" ? ", sin asignar" : ", sin responsable") : ""}${urgente ? ", vacante" : ""}. Ver ficha${modo.puedeEditar ? `. F2 para renombrar${nodo.dependeDe ? ", Suprimir para eliminar" : ""}` : ""}`}
          className={cn(
            "absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            clase === "puesto" ? "rounded-lg" : "rounded-xl",
            modo.puedeEditar && !raiz ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          )}
        />
        {clase === "direccion" ? (
          <ContenidoDireccion vista={vista} modo={modo} />
        ) : clase === "puesto" ? (
          <ContenidoPuesto vista={vista} modo={modo} urgente={urgente} />
        ) : (
          <ContenidoArea vista={vista} modo={modo} urgente={urgente} />
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
