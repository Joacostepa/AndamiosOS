import { ChevronRight, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Piezas de la bandeja de permisos: secciones, avisos y tiempos. Un solo lenguaje de color:
//   - rojo (700/300): bloqueos — subsanaciones, robot frenado, algo observado.
//   - ámbar (800/300): advertencias — "fijate antes", "espera a ABA", demoras.
//   - naranja de marca (--primary): sólo la acción principal (Iniciar trámite).
// Siempre con ícono o texto además del color, para que no dependa de verlo.

export type Tono = "bloqueo" | "aba" | "neutro";

const PUNTO: Record<Tono, string> = {
  bloqueo: "bg-red-600 dark:bg-red-400",
  aba: "bg-amber-500 dark:bg-amber-400",
  neutro: "border-2 border-muted-foreground/50",
};

function Encabezado({ titulo, cantidad, bajada, tono }: { titulo: string; cantidad?: React.ReactNode; bajada?: React.ReactNode; tono: Tono }) {
  return (
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", PUNTO[tono])} />
        {titulo}
        {cantidad != null && <span className="font-normal text-muted-foreground tabular-nums">· {cantidad}</span>}
      </h2>
      {bajada && <p className="mt-0.5 pl-4 text-[12px] text-muted-foreground">{bajada}</p>}
    </div>
  );
}

/** Una sección de la bandeja: tarjeta con encabezado y lista. */
export function Seccion({
  id,
  titulo,
  cantidad,
  bajada,
  tono = "neutro",
  accion,
  children,
}: {
  id?: string;
  titulo: string;
  cantidad?: React.ReactNode;
  bajada?: React.ReactNode;
  tono?: Tono;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-md border bg-card",
        tono === "bloqueo" && "border-l-[3px] border-l-red-600 dark:border-l-red-400",
        tono === "aba" && "border-l-[3px] border-l-amber-500 dark:border-l-amber-400",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2">
        <Encabezado titulo={titulo} cantidad={cantidad} bajada={bajada} tono={tono} />
        {accion}
      </header>
      {children}
    </section>
  );
}

/** Una sección plegada (emitidos, historial, pruebas): se abre sola cuando la búsqueda encuentra algo. */
export function SeccionPlegada({
  titulo,
  cantidad,
  bajada,
  abierta,
  children,
}: {
  titulo: string;
  cantidad?: React.ReactNode;
  bajada?: React.ReactNode;
  abierta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-md border bg-card" open={abierta}>
      <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <Encabezado titulo={titulo} cantidad={cantidad} bajada={bajada} tono="neutro" />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}

/** Aviso con borde: ámbar para advertir, rojo para un bloqueo. */
export function Aviso({
  tono = "advertencia",
  icono,
  titulo,
  children,
  className,
}: {
  tono?: "advertencia" | "bloqueo";
  icono?: LucideIcon;
  titulo?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icono = icono ?? (tono === "bloqueo" ? OctagonAlert : TriangleAlert);
  return (
    <div
      role={tono === "bloqueo" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]",
        tono === "advertencia" && "border-amber-500/40 bg-amber-500/10",
        tono === "bloqueo" && "border-red-500/40 bg-red-500/10",
        className,
      )}
    >
      <Icono
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", tono === "advertencia" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300")}
      />
      <div className="min-w-0">
        {titulo && <p className="font-medium">{titulo}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** Texto de advertencia en línea (ámbar, con ícono). */
export function Advertencia({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-300", className)}>
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const DIA = 86_400_000;

/** "menos de 1 h", "5 h", "1 día", "12 días". */
export function duracion(desde: string | null | undefined, ahora: number): string {
  if (!desde) return "";
  const h = (ahora - Date.parse(desde)) / 3_600_000;
  if (h < 1) return "menos de 1 h";
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  return `${d} día${d === 1 ? "" : "s"}`;
}

/** Para una fecha sin hora (las de Odoo): "hoy", "ayer", "hace 12 días". */
export function haceDias(fecha: string | null | undefined, ahora: number): string {
  if (!fecha) return "";
  const d = Math.max(0, Math.floor((ahora - Date.parse(`${fecha.slice(0, 10)}T00:00:00-03:00`)) / DIA));
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

/** "08/10/2026" para el title de una fecha. */
export const diaCompleto = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Foco visible en las filas que son links. */
export const FILA_LINK = "block px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
