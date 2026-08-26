"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  Search,
  Inbox,
  Info,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { colorTipo, semaforo, CORAL, ACENTO_BG, URGENCIA_ALTA_BORDE } from "@/lib/tablero/colores";
import { fraccionLabel, repartirJornadas, FRACCIONES, type FraccionStr } from "@/lib/tablero/fracciones";
import { partesTitulo, normalizar } from "@/lib/tablero/titulo";
import type { OtTablero } from "@/lib/tablero/tipos";

// Panel lateral de obras sin asignar. Es una COLUMNA y no una franja horizontal
// porque la tarjeta de obra es vertical por naturaleza: en la franja, la dirección
// —que es lo que Operaciones usa para identificar la obra— quedaba siempre cortada.
//
// Se arrastra desde acá a una celda de la grilla; soltar una tarjeta de la grilla acá
// la devuelve a la bandeja.
//
// PRINCIPIO: un objeto se ve igual en todas las superficies. Una obra de armado es azul
// con flecha arriba en la grilla y también acá. Si cada pantalla tuviera su propio código
// visual, habría que reaprenderlo en cada una.

export const ID_BANDEJA = "bandeja";

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

/** Obra con jornadas por planificar, y cuánto de ella ya se ejecutó. */
export type ObraPendiente = {
  ot: OtTablero;
  /** Jornadas totales previstas de la obra. */
  totales: number;
  /** Las que faltan planificar. */
  pendientes: number;
  /** Las que ya tienen parte cargado: si hay, la obra está empezada. */
  cerradas: number;
};

/** Una obra que YA está en la grilla, para poder encontrarla desde el buscador. */
export type ObraPlanificada = {
  bloqueKey: string;
  ot: OtTablero;
  cuadrillaNombre: string | null;
  fechaInicio: string;
  jornadas: number;
};

// ── Filtros de la bandeja ────────────────────────────────────────────────────
//
// Dos ejes, y sólo dos: TIPO y DURACIÓN. Contestan la pregunta con la que se llena un
// día — "me queda media jornada libre en la cuadrilla 1, ¿qué desarme corto tengo?"—,
// que hoy se resuelve escaneando la lista entera.
//
// LOS CHIPS LLEVAN EL NÚMERO Y SÓLO APARECEN LOS QUE TIENEN OBRAS. Así no hay baldes
// vacíos que ocupen lugar, y de paso el panel muestra la forma de la bandeja sin que
// haya que filtrar nada. Medido sobre las 34 obras de hoy: 25 dicen "1 jornada", 5 son
// de varios días y 4 de ¼. Ese "25" es además un diagnóstico — la duración estimada está
// cargada en el 19% de las OTs, así que buena parte de ese grupo es el valor por defecto
// y no una medición. El filtro no puede ser mejor que el dato que filtra.
//
// NO SE PERSISTEN entre sesiones, a diferencia del panel colapsado o las cuadrillas
// visibles: un filtro que sobrevive a un refresh es cómo alguien termina creyendo que la
// bandeja está vacía.

/** Los cinco valores de fracción más el cajón de las obras que no entran en un día. */
type ClaveDuracion = FraccionStr | "varios";

/**
 * En qué balde de duración cae una obra, medido sobre lo que le QUEDA.
 *
 * Lo que importa para llenar un día es el trabajo que falta, no el original: a la obra de
 * Callao le quedan 6 de 8 jornadas, y si le quedara una sola tendría que aparecer entre
 * las de una jornada aunque haya empezado siendo de ocho.
 *
 * Las fracciones pendientes son las ÚLTIMAS del reparto, igual que cuando se planifica
 * (ver asignarObra): así el resto fraccionario cae donde va a caer de verdad.
 */
function duracionDe(obra: ObraPendiente): { clave: ClaveDuracion; orden: number; label: string } {
  const todas = repartirJornadas(obra.ot.jornadas);
  const quedan = todas.slice(Math.max(0, todas.length - obra.pendientes));

  if (quedan.length > 1) {
    return { clave: "varios", orden: 99, label: `Varios días` };
  }
  const f = quedan[0] ?? "1";
  const i = FRACCIONES.findIndex((x) => x.value === f);
  const fr = FRACCIONES[i] ?? FRACCIONES[FRACCIONES.length - 1];
  return {
    clave: fr.value,
    orden: i,
    // Las dos unidades juntas: el sistema guarda jornadas y el planificador piensa en
    // horas. Con una sola, alguien tiene que traducir en la cabeza cada vez.
    label: fr.value === "1" ? "1 jornada · 8 h" : `${fr.label} · ${fr.horas} h`,
  };
}

const TIPOS_BANDEJA = [
  { clave: "armado", label: "Armado" },
  { clave: "desarme", label: "Desarme" },
  { clave: "otro", label: "Otro" },
] as const;

/** El tipo de la OT, normalizado a los tres cajones que muestra el filtro. */
function tipoDe(ot: OtTablero): string {
  return ot.tipo === "armado" || ot.tipo === "desarme" ? ot.tipo : "otro";
}

function Chip({
  activo,
  onClick,
  children,
  cantidad,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  cantidad: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors"
      style={{
        backgroundColor: activo ? CORAL : undefined,
        borderColor: activo ? CORAL : undefined,
        color: activo ? "#fff" : undefined,
      }}
    >
      {children}
      <span className={activo ? "opacity-80" : "text-muted-foreground"}>{cantidad}</span>
    </button>
  );
}

/**
 * La habilitación deja de ser una franja de color y pasa a ser el criterio de
 * agrupación: rojo y vencida a un lado, el resto al otro.
 *
 * `gris` va con las listas y no con las pendientes. Es el caso que más aparece, y "sin
 * datos de habilitación" no es lo mismo que "habilitación vencida": mandarlo al grupo de
 * pendientes lo llenaría de obras que probablemente estén bien y lo volvería ruido.
 */
function habilitacionPendiente(ot: OtTablero): boolean {
  return ot.habSemaforo === "rojo" || ot.habSemaforo === "vencida";
}

/**
 * Qué tan arriba va una obra. Menor = más arriba.
 *
 * NO se agrupa por esto. La bandeja ya se agrupa por habilitación, y agrupar por dos ejes
 * a la vez vuelve la lista ilegible. La prioridad se resuelve con el ORDEN, y la tarjeta
 * dice por qué está donde está: así se puede verificar de un vistazo en vez de confiar.
 */
function prioridad(ot: OtTablero, hoy: string): number {
  if (ot.urgencia === "alta") return 0;
  // Un compromiso vencido es lo más urgente después de lo declarado urgente: alguien le
  // dio una fecha al cliente y esa fecha ya pasó.
  if (ot.fechaComprometida && ot.fechaComprometida < hoy) return 1;
  if (ot.fechaComprometida) return 2;
  return 3;
}

/** Lo que explica la posición de la tarjeta: la fecha prometida y su desvío. */
function lineaCompromiso(ot: OtTablero, hoy: string): { texto: string; alerta: boolean } | null {
  if (!ot.fechaComprometida) return null;
  const label = format(parseISO(ot.fechaComprometida), "d MMM", { locale: es });
  if (ot.fechaComprometida < hoy) return { texto: `venció el ${label}`, alerta: true };
  if (ot.fechaComprometida === hoy) return { texto: "comprometida HOY", alerta: true };
  return { texto: `comprometida ${label}`, alerta: false };
}

function TarjetaOt({
  obra,
  hoy,
  onDetalle,
}: {
  obra: ObraPendiente;
  hoy: string;
  onDetalle: (ot: OtTablero) => void;
}) {
  const { ot, totales, pendientes, cerradas } = obra;
  const empezada = cerradas > 0;
  const compromiso = lineaCompromiso(ot, hoy);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
  });
  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const urgente = ot.urgencia === "alta";
  const partes = partesTitulo(ot.titulo);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // select-none: apretar sobre el texto y arrastrar hacía que el navegador extendiera
      // una SELECCIÓN, y una selección que se estira más allá del borde scrollea el
      // contenedor sola — el mismo síntoma que el auto-scroll, por otro camino. Acá el
      // texto es un agarre para arrastrar, no algo para seleccionar.
      className="cursor-grab select-none rounded-md border p-2 transition-colors hover:border-foreground/25 active:cursor-grabbing"
      style={{
        opacity: isDragging ? 0.35 : 1,
        backgroundColor: tipo.bg,
        borderColor: "transparent",
        // La franja ya no es el semáforo —eso ahora lo dice el grupo— sino "empezada",
        // que es el estado que hay que no perder de vista dentro de cada grupo.
        borderLeft: empezada ? "5px solid #EF9F27" : "5px solid transparent",
      }}
    >
      {empezada && (
        <p
          className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: "#854F0B" }}
        >
          <PlayCircle className="h-3 w-3" />
          Empezada · {cerradas} de {totales} jornadas hechas
        </p>
      )}
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: tipo.text, opacity: 0.8 }}>
            {/* El ícono reemplaza a la palabra ARMADO / DESARME: dice lo mismo, no compite
                por el ancho, y es lo que libera lugar para la dirección. */}
            <IconoTipo className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {partes.numero ?? "OT"}
            {/* El semáforo sigue estando: dentro del grupo de listas conviven verde,
                amarillo y gris, y la diferencia importa. */}
            <span
              className="ml-auto h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: sem.color }}
              title={sem.label}
            />
          </p>
          {partes.cliente && (
            <p className="truncate text-[11px]" style={{ color: tipo.text, opacity: 0.75 }} title={partes.cliente}>
              {partes.cliente}
            </p>
          )}
          {/* La dirección entra completa: para eso el panel es vertical. */}
          <p className="text-[12px] font-medium leading-snug" style={{ color: tipo.text }}>
            {partes.principal}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {urgente && (
            <span className="rounded px-1 text-[9px] font-semibold" style={{ backgroundColor: "#FDECEA", color: URGENCIA_ALTA_BORDE }}>
              URG
            </span>
          )}
          {/* Botón aparte para el detalle: el cuerpo de la tarjeta es el asa de
              arrastre, y un clic ahí se confunde con el gesto de asignar. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDetalle(ot); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-1 hover:bg-black/5"
            style={{ color: tipo.text }}
            title="Ver detalle de la obra"
            aria-label="Ver detalle de la obra"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-1 truncate text-[10px]" style={{ color: tipo.text, opacity: 0.7 }}>
        {empezada || pendientes < totales
          ? `quedan ${pendientes} de ${totales} jornadas`
          : ot.jornadas >= 1
            ? `${ot.jornadas} jornada${ot.jornadas === 1 ? "" : "s"}`
            : `${fraccionLabel(ot.jornadas)} de jornada`}
        {ot.tecnico ? ` · ${ot.tecnico}` : ""}
      </p>

      {/* El compromiso con el cliente va en su propia línea y no diluido entre el resto:
          es lo que explica por qué la obra está arriba de la lista. Sin esto el orden
          sería una decisión invisible que hay que creer. */}
      {compromiso && (
        <p
          className={`mt-0.5 truncate text-[10px] ${compromiso.alerta ? "font-semibold" : "font-medium"}`}
          style={{ color: compromiso.alerta ? "#B42318" : tipo.text }}
          title="Fecha que Comercial le prometió al cliente"
        >
          {compromiso.texto}
        </p>
      )}
    </div>
  );
}

/** Encabezado plegable de un grupo. El plegado es visual: adentro se arrastra igual. */
function Grupo({
  titulo,
  cantidad,
  abierto,
  onToggle,
  children,
}: {
  titulo: string;
  cantidad: number;
  abierto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (cantidad === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground hover:bg-muted"
        aria-expanded={abierto}
      >
        {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {titulo}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">{cantidad}</span>
      </button>
      {abierto && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  );
}

export function PanelSinAsignar({
  ots,
  planificadas,
  hoy,
  colapsado,
  onColapsar,
  onDetalle,
  onIrABloque,
}: {
  ots: ObraPendiente[];
  /** Obras que ya están en la grilla, para el buscador. Sólo las del rango cargado. */
  planificadas: ObraPlanificada[];
  /** Hoy en yyyy-MM-dd: define qué compromiso está vencido. */
  hoy: string;
  colapsado: boolean;
  onColapsar: (valor: boolean) => void;
  onDetalle: (ot: OtTablero) => void;
  onIrABloque: (bloqueKey: string, fecha: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  // El grupo de habilitación pendiente arranca plegado para que lo que está listo no se
  // mezcle con lo que no. NO es un bloqueo: se abre con un clic y adentro las tarjetas se
  // arrastran igual que cualquier otra. El semáforo advierte, no impide planificar.
  const [pendientesAbierto, setPendientesAbierto] = useState(false);
  const { setNodeRef, isOver, active } = useDroppable({ id: ID_BANDEJA });
  const soltando = isOver && String(active?.id ?? "").startsWith("bloque:");

  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [duracionFiltro, setDuracionFiltro] = useState<ClaveDuracion | null>(null);
  const hayFiltro = tipoFiltro !== null || duracionFiltro !== null;

  const q = normalizar(busqueda.trim());

  const filtradas = useMemo(() => {
    const orden = [...ots].sort((a, b) => {
      // Urgencia declarada, después compromiso vencido, después compromiso a futuro.
      const pa = prioridad(a.ot, hoy);
      const pb = prioridad(b.ot, hoy);
      if (pa !== pb) return pa - pb;
      // Dentro del mismo nivel manda la fecha prometida, la más próxima primero.
      const fa = a.ot.fechaComprometida ?? "9999";
      const fb = b.ot.fechaComprometida ?? "9999";
      if (fa !== fb) return fa.localeCompare(fb);
      // Las empezadas antes que las que nunca se tocaron: esperan retomarse y no hay que
      // perderlas de vista.
      if ((a.cerradas > 0) !== (b.cerradas > 0)) return a.cerradas > 0 ? -1 : 1;
      return (a.ot.fechaProgramada ?? "9999").localeCompare(b.ot.fechaProgramada ?? "9999");
    });
    if (!q) return orden;
    // Con 46 obras, encontrar una puntual escaneando no funciona.
    return orden.filter((o) => normalizar(`${o.ot.titulo} ${o.ot.tecnico ?? ""}`).includes(q));
  }, [ots, q, hoy]);

  // Los contadores de cada chip se cuentan sobre la lista filtrada por el OTRO eje: el
  // número dice cuántas obras quedarían si lo apretaras, que es lo que uno espera de un
  // filtro. El chip activo se dibuja siempre, aunque quede en cero, para que no
  // desaparezca abajo del dedo.
  const { chipsTipo, chipsDuracion, conFiltros } = useMemo(() => {
    const porTipo = (o: ObraPendiente) => tipoFiltro === null || tipoDe(o.ot) === tipoFiltro;
    const porDuracion = (o: ObraPendiente) =>
      duracionFiltro === null || duracionDe(o).clave === duracionFiltro;

    const paraTipo = filtradas.filter(porDuracion);
    const paraDuracion = filtradas.filter(porTipo);

    const chipsTipo = TIPOS_BANDEJA.map((t) => ({
      ...t,
      cantidad: paraTipo.filter((o) => tipoDe(o.ot) === t.clave).length,
    })).filter((t) => t.cantidad > 0 || t.clave === tipoFiltro);

    const baldes = new Map<ClaveDuracion, { label: string; orden: number; cantidad: number }>();
    for (const o of paraDuracion) {
      const d = duracionDe(o);
      const prev = baldes.get(d.clave);
      baldes.set(d.clave, { label: d.label, orden: d.orden, cantidad: (prev?.cantidad ?? 0) + 1 });
    }
    if (duracionFiltro && !baldes.has(duracionFiltro)) {
      const ref = FRACCIONES.find((f) => f.value === duracionFiltro);
      baldes.set(duracionFiltro, {
        label: duracionFiltro === "varios" ? "Varios días" : `${ref?.label} · ${ref?.horas} h`,
        orden: 98,
        cantidad: 0,
      });
    }
    const chipsDuracion = [...baldes.entries()]
      .map(([clave, v]) => ({ clave, ...v }))
      .sort((a, b) => a.orden - b.orden);

    return { chipsTipo, chipsDuracion, conFiltros: filtradas.filter(porTipo).filter(porDuracion) };
  }, [filtradas, tipoFiltro, duracionFiltro]);

  const listas = conFiltros.filter((o) => !habilitacionPendiente(o.ot));
  const pendientesHab = conFiltros.filter((o) => habilitacionPendiente(o.ot));

  // Sólo se buscan las ya planificadas cuando hay texto: sin búsqueda, la sección no
  // aporta nada y le sacaría lugar a la bandeja.
  const yaPlanificadas = useMemo(() => {
    if (!q) return [];
    return planificadas
      .filter((p) => normalizar(`${p.ot.titulo} ${p.ot.tecnico ?? ""}`).includes(q))
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  }, [planificadas, q]);

  if (colapsado) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-l py-2">
        <button
          type="button"
          onClick={() => onColapsar(false)}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Mostrar obras sin asignar"
          aria-label="Mostrar obras sin asignar"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {ots.length}
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Sin asignar
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex w-[300px] shrink-0 flex-col border-l transition-colors"
      style={{
        backgroundColor: soltando ? ACENTO_BG : undefined,
        outline: soltando ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-4px",
      }}
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Sin asignar
        </p>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {conFiltros.length === ots.length ? ots.length : `${conFiltros.length}/${ots.length}`}
        </span>
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
          placeholder="Buscar obra, cliente o técnico…"
          className="h-7 pl-7 text-[12px]"
        />
      </div>

      {(chipsTipo.length > 0 || chipsDuracion.length > 0) && (
        <div className="space-y-1 border-b px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {chipsTipo.map((t) => {
              const Icono = ICONO_TIPO[colorTipo(t.clave).icono];
              return (
                <Chip
                  key={t.clave}
                  activo={tipoFiltro === t.clave}
                  cantidad={t.cantidad}
                  onClick={() => setTipoFiltro((v) => (v === t.clave ? null : t.clave))}
                >
                  <Icono className="h-3 w-3" aria-hidden />
                  {t.label}
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1">
            {chipsDuracion.map((d) => (
              <Chip
                key={d.clave}
                activo={duracionFiltro === d.clave}
                cantidad={d.cantidad}
                onClick={() => setDuracionFiltro((v) => (v === d.clave ? null : d.clave))}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {soltando && (
        <p className="px-2.5 py-1.5 text-[11px]" style={{ color: CORAL }}>
          Soltá para devolver la obra a sin asignar
        </p>
      )}

      {conFiltros.length > 0 || yaPlanificadas.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          <Grupo
            titulo="Listas para planificar"
            cantidad={listas.length}
            abierto
            onToggle={() => {}}
          >
            {listas.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} onDetalle={onDetalle} />
            ))}
          </Grupo>

          <Grupo
            titulo="Con habilitación pendiente"
            cantidad={pendientesHab.length}
            abierto={pendientesAbierto}
            onToggle={() => setPendientesAbierto((v) => !v)}
          >
            {pendientesHab.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} hoy={hoy} onDetalle={onDetalle} />
            ))}
          </Grupo>

          {/* Responde "¿esta obra ya la planifiqué?", que hoy se contesta scrolleando la
              grilla a ojo. Dice DÓNDE está, que es lo que hace falta para ir. */}
          {q && (
            <div>
              <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Ya planificadas
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-medium">
                  {yaPlanificadas.length}
                </span>
              </p>
              {yaPlanificadas.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {yaPlanificadas.map((p) => {
                    const partes = partesTitulo(p.ot.titulo);
                    const tipo = colorTipo(p.ot.tipo);
                    const IconoTipo = ICONO_TIPO[tipo.icono];
                    return (
                      <button
                        key={p.bloqueKey}
                        type="button"
                        onClick={() => onIrABloque(p.bloqueKey, p.fechaInicio)}
                        className="flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left hover:border-foreground/25"
                      >
                        <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium">{partes.principal}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {p.cuadrillaNombre ?? "sin cuadrilla"} ·{" "}
                            {format(parseISO(p.fechaInicio), "EEE d MMM", { locale: es })}
                            {p.jornadas > 1 ? ` · ${p.jornadas} jornadas` : ""}
                          </span>
                        </span>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                // No dice "no está planificada": el buscador sólo ve el rango cargado, y
                // afirmar de más sobre lo que no se miró es peor que no decir nada.
                <p className="px-1 text-[10px] text-muted-foreground">
                  Nada en las semanas cargadas. Si puede estar más adelante, scrolleá y
                  volvé a buscar.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[11px] text-muted-foreground">
          <p>
            {ots.length === 0
              ? "No quedan obras sin asignar."
              : hayFiltro
                ? "Ninguna obra con esos filtros."
                : "Ninguna obra coincide con la búsqueda."}
          </p>
          {/* Una lista vacía sin explicación es cómo alguien concluye que la bandeja se
              quedó sin trabajo. Se dice por qué y se ofrece el camino de vuelta. */}
          {hayFiltro && (
            <button
              type="button"
              onClick={() => { setTipoFiltro(null); setDuracionFiltro(null); }}
              className="rounded border px-2 py-1 text-[11px] hover:border-foreground/25"
            >
              Ver todas ({filtradas.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
