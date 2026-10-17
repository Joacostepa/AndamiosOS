"use client";

// Piezas que comparten el panel de reporte, Mis reportes y la bandeja de revisión: los
// chips de tipo y estado, la conversación y el formato de las fechas.
//
// LOS COLORES SON LOS DEL TABLERO (var(--tb-*) de globals.css): ya tienen su par para el
// tema oscuro y su contraste revisado. Error en rojo, corrección en ámbar, mejora en verde,
// como en la maqueta; los estados siguen la misma lógica (nuevo en coral, que es la marca).

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Bug, Lightbulb, PencilLine, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ESTADOS,
  PRIORIDADES,
  REVISOR,
  TIPOS,
  type EstadoReporte,
  type EventoPublico,
  type EventoRevision,
  type TipoReporte,
} from "@/lib/sistemas/tipos";

export type Tono = { fondo: string; texto: string; borde: string };

const T = (c: string): Tono => ({ fondo: `var(--tb-${c}-bg)`, texto: `var(--tb-${c}-text)`, borde: `var(--tb-${c}-borde)` });

export const TONO_TIPO: Record<TipoReporte, Tono> = {
  error: { fondo: "var(--tb-peligro-suave)", texto: "var(--tb-peligro-text)", borde: "var(--tb-peligro)" },
  correccion: T("ambar"),
  mejora: T("verde"),
};

export const TONO_ESTADO: Record<EstadoReporte, Tono> = {
  nuevo: T("coral"),
  visto: T("azul"),
  en_curso: T("ambar"),
  resuelto: T("verde"),
  descartado: T("gris"),
};

export const TONO_PELIGRO = TONO_TIPO.error;
export const TONO_INFO = T("azul");
export const TONO_NEUTRO = T("gris");

export const ICONO_TIPO: Record<TipoReporte, LucideIcon> = { error: Bug, correccion: PencilLine, mejora: Lightbulb };

export function Chip({ tono, icono: Icono, children, className }: { tono: Tono; icono?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", className)}
      style={{ backgroundColor: tono.fondo, color: tono.texto }}
    >
      {Icono && <Icono className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}

export function ChipTipo({ tipo }: { tipo: TipoReporte }) {
  return (
    <Chip tono={TONO_TIPO[tipo]} icono={ICONO_TIPO[tipo]}>
      {TIPOS[tipo].etiqueta}
    </Chip>
  );
}

/** `vista="usuario"` usa la etiqueta que ve quien reportó («Sistemas ya lo vio»). */
export function ChipEstado({ estado, vista = "revision" }: { estado: EstadoReporte; vista?: "usuario" | "revision" }) {
  return <Chip tono={TONO_ESTADO[estado]}>{vista === "usuario" ? ESTADOS[estado].usuario : ESTADOS[estado].etiqueta}</Chip>;
}

/** El cuadradito con el ícono del tipo, al principio de cada fila de la bandeja. */
export function IconoTipoCaja({ tipo, className }: { tipo: TipoReporte; className?: string }) {
  const Icono = ICONO_TIPO[tipo];
  return (
    <span
      className={cn("grid size-7 shrink-0 place-items-center rounded-lg", className)}
      style={{ backgroundColor: TONO_TIPO[tipo].fondo, color: TONO_TIPO[tipo].texto }}
      aria-label={TIPOS[tipo].etiqueta}
    >
      <Icono className="size-4" />
    </span>
  );
}

/** «17/10 09:42», en la hora de Buenos Aires del navegador. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd/MM HH:mm", { locale: es });
  } catch {
    return "—";
  }
}

/** «hace 2 h», «ayer», «hace 3 días». Corto, para las filas. */
export function hace(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "";
  const ms = ahora - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return format(new Date(iso), "dd/MM/yy", { locale: es });
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversación
// ─────────────────────────────────────────────────────────────────────────────

type Evento = EventoPublico | EventoRevision;

/**
 * La línea de sistema de un cambio (estado, prioridad, duplicado). Quien reportó ve los
 * estados con sus palabras; la bandeja, con las de la bandeja.
 */
export function textoLinea(e: Evento, vista: "usuario" | "revision", nombreUsuario: string): string | null {
  if (e.tipo === "estado") {
    const a = e.a as EstadoReporte | null;
    if (!a || !(a in ESTADOS)) return null;
    if (e.lado === "usuario") return vista === "usuario" ? "Lo reabriste: sigue pasando" : `${nombreUsuario || "Quien reportó"} lo reabrió: sigue pasando`;
    // Un descarte depende del motivo (duplicado, «ya existe»…), que el evento no trae: a quien
    // reportó ya se lo explica el cartel de arriba con estadoParaUsuario(); una línea genérica
    // «No se va a hacer» lo contradiría.
    if (vista === "usuario" && a === "descartado") return null;
    return vista === "usuario" ? `Pasó a «${ESTADOS[a].usuario}»` : `Pasó a «${ESTADOS[a].etiqueta}»`;
  }
  if (e.tipo === "prioridad") {
    const p = PRIORIDADES.find((x) => (x.valor ?? null) === (e.a ?? null));
    return `Prioridad: ${p?.etiqueta ?? "Sin definir"}`;
  }
  if (e.tipo === "duplicado") return `Marcado como duplicado del #${e.a}`;
  return null;
}

/**
 * La charla de un reporte. El lado `sistemas` se firma siempre «Sistemas» (nunca un nombre
 * propio) y va a la derecha; el de quien reportó, «Vos» en Mis reportes o su nombre en la
 * bandeja. El evento `creado` no se muestra: la descripción ya está arriba.
 */
export function Conversacion({
  eventos,
  vista,
  nombreUsuario,
  vacio,
}: {
  eventos: Evento[];
  vista: "usuario" | "revision";
  nombreUsuario: string;
  vacio?: React.ReactNode;
}) {
  const visibles = eventos.filter((e) => e.tipo !== "creado");
  if (visibles.length === 0) return vacio ? <>{vacio}</> : null;
  return (
    <div className="flex flex-col gap-2">
      {visibles.map((e) => {
        if (e.tipo === "comentario") {
          const deSistemas = e.lado === "sistemas";
          return (
            <div
              key={e.id}
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-snug",
                deSistemas ? "self-end rounded-br-sm bg-accent" : "self-start rounded-bl-sm bg-muted",
              )}
            >
              <small className="mb-0.5 flex gap-2 text-[11px] text-muted-foreground">
                <span>{deSistemas ? REVISOR : vista === "usuario" ? "Vos" : nombreUsuario}</span>
                <span className="tabular-nums">{fechaCorta(e.createdAt)}</span>
              </small>
              <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{e.texto}</span>
            </div>
          );
        }
        const linea = textoLinea(e, vista, nombreUsuario);
        if (!linea) return null;
        const autor = "autorNombre" in e && e.autorNombre ? ` · ${e.autorNombre}` : "";
        return (
          <div key={e.id} className="self-center px-1 text-[12px] text-muted-foreground" title={`${fechaCorta(e.createdAt)}${autor}`}>
            {linea}
          </div>
        );
      })}
    </div>
  );
}
