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
import { fraccionLabel } from "@/lib/tablero/fracciones";
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

function TarjetaOt({ obra, onDetalle }: { obra: ObraPendiente; onDetalle: (ot: OtTablero) => void }) {
  const { ot, totales, pendientes, cerradas } = obra;
  const empezada = cerradas > 0;
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
      className="cursor-grab rounded-md border p-2 transition-colors hover:border-foreground/25 active:cursor-grabbing"
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
        {ot.fechaProgramada
          ? ` · prev. ${format(parseISO(ot.fechaProgramada), "d MMM", { locale: es })}`
          : ""}
      </p>
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
  colapsado,
  onColapsar,
  onDetalle,
  onIrABloque,
}: {
  ots: ObraPendiente[];
  /** Obras que ya están en la grilla, para el buscador. Sólo las del rango cargado. */
  planificadas: ObraPlanificada[];
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

  const q = normalizar(busqueda.trim());

  const filtradas = useMemo(() => {
    const orden = [...ots].sort((a, b) => {
      // Las empezadas van primero: son las que esperan retomarse y no hay que perderlas
      // de vista entre las que nunca se tocaron.
      if ((a.cerradas > 0) !== (b.cerradas > 0)) return a.cerradas > 0 ? -1 : 1;
      if ((a.ot.urgencia === "alta") !== (b.ot.urgencia === "alta")) return a.ot.urgencia === "alta" ? -1 : 1;
      return (a.ot.fechaProgramada ?? "9999").localeCompare(b.ot.fechaProgramada ?? "9999");
    });
    if (!q) return orden;
    // Con 46 obras, encontrar una puntual escaneando no funciona.
    return orden.filter((o) => normalizar(`${o.ot.titulo} ${o.ot.tecnico ?? ""}`).includes(q));
  }, [ots, q]);

  const listas = filtradas.filter((o) => !habilitacionPendiente(o.ot));
  const pendientesHab = filtradas.filter((o) => habilitacionPendiente(o.ot));

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
          {filtradas.length === ots.length ? ots.length : `${filtradas.length}/${ots.length}`}
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

      {soltando && (
        <p className="px-2.5 py-1.5 text-[11px]" style={{ color: CORAL }}>
          Soltá para devolver la obra a sin asignar
        </p>
      )}

      {filtradas.length > 0 || yaPlanificadas.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
          <Grupo
            titulo="Listas para planificar"
            cantidad={listas.length}
            abierto
            onToggle={() => {}}
          >
            {listas.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} onDetalle={onDetalle} />
            ))}
          </Grupo>

          <Grupo
            titulo="Con habilitación pendiente"
            cantidad={pendientesHab.length}
            abierto={pendientesAbierto}
            onToggle={() => setPendientesAbierto((v) => !v)}
          >
            {pendientesHab.map((obra) => (
              <TarjetaOt key={obra.ot.id} obra={obra} onDetalle={onDetalle} />
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
        <p className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
          {ots.length === 0 ? "No quedan obras sin asignar." : "Ninguna obra coincide con la búsqueda."}
        </p>
      )}
    </div>
  );
}
