import { Check, Clock, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ETAPAS, NOMBRE_ETAPA, type Etapa, type EstadoEtapa, type Tono } from "@/lib/permisos-via-publica/estado";

// Piezas visuales del módulo de permisos (rediseño 09/10). UN COLOR, UN SIGNIFICADO, en par
// claro/oscuro medido (docs/permisos/rediseno.md § 4.5):
//   - bloqueo (rojo): frenado, hay que corregir.
//   - aviso (ámbar): ojo, demora, dato raro.
//   - marcha (azul): lo tiene otro, no hay que hacer nada.
//   - listo (verde): hecho o salió.
//   - neutro (gris): todavía no, o es un dato.
//   - "te toca" no lleva color: lleno neutro, la señal más fuerte sin gastar el rojo.
//   - el coral de la marca queda para UN botón por pantalla: la próxima acción.
// Siempre con ícono o texto además del color.

export type TonoChip = Tono | "prueba" | "toca";

export const TEXTO: Record<Tono, string> = {
  bloqueo: "text-red-700 dark:text-red-300",
  aviso: "text-amber-800 dark:text-amber-300",
  marcha: "text-blue-700 dark:text-blue-300",
  listo: "text-emerald-800 dark:text-emerald-300",
  neutro: "text-muted-foreground",
};

const CHIP: Record<TonoChip, string> = {
  bloqueo: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  aviso: "bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  marcha: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  listo: "bg-emerald-500/10 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  neutro: "bg-muted text-muted-foreground",
  prueba: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  toca: "bg-foreground text-background",
};

const ICONO: Partial<Record<TonoChip, typeof Check>> = { bloqueo: OctagonAlert, aviso: TriangleAlert, marcha: Clock, listo: Check };

/** Un chip: tono, ícono del tono y como mucho tres palabras. */
export function Chip({ tono = "neutro", children, className, sinIcono = false }: { tono?: TonoChip; children: React.ReactNode; className?: string; sinIcono?: boolean }) {
  const Icono = sinIcono ? undefined : ICONO[tono];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-medium", CHIP[tono], tono === "toca" && "font-semibold", className)}>
      {Icono && <Icono aria-hidden className="size-3" />}
      {children}
    </span>
  );
}

const TEXTO_ESTADO: Record<EstadoEtapa, string> = { listo: "Listo", marcha: "En marcha", frenado: "Frenado", te_toca: "Te toca", todavia: "Todavía no" };

/** El punto de una etapa. ✓ sobre verde 700 (5,4:1), ! sobre rojo 700 (6,4:1), borde zinc-500 (4,8:1). */
export function Punto({ estado, grande = false }: { estado: EstadoEtapa; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full font-bold leading-none",
        grande ? "size-6 text-[13px]" : "size-[18px] text-[11px]",
        estado === "listo" && "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950",
        estado === "frenado" && "bg-red-700 text-white dark:bg-red-400 dark:text-red-950",
        estado === "te_toca" && "bg-foreground text-background",
        estado === "marcha" && "border-2 border-blue-600 bg-card dark:border-blue-400",
        estado === "todavia" && "border-2 border-zinc-500 bg-card",
      )}
    >
      {estado === "listo" && <Check className={grande ? "size-3.5" : "size-3"} strokeWidth={3} />}
      {estado === "frenado" && "!"}
      {estado === "marcha" && <span className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
    </span>
  );
}

/**
 * La línea de 7 etapas. `compacta` para la fila de la lista (en el teléfono sólo se lee la etapa
 * actual); grande, con fecha o estado debajo de cada punto, para la ficha.
 */
export function Linea({ etapas, compacta = false, detalle }: { etapas: Etapa[]; compacta?: boolean; detalle?: (e: Etapa) => string }) {
  const resumen = etapas.map((e) => `${NOMBRE_ETAPA[e.clave]}: ${TEXTO_ESTADO[e.estado].toLowerCase()}`).join("; ");
  return (
    <ol aria-label={`Etapas del permiso. ${resumen}`} className={cn("grid grid-cols-7", compacta ? "min-w-[11rem]" : "gap-y-2")}>
      {etapas.map((e, i) => (
        <li key={e.clave} className="relative flex min-w-0 flex-col items-center gap-1 text-center" title={compacta ? `${NOMBRE_ETAPA[e.clave]} · ${e.detalle}` : undefined}>
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute right-1/2 h-0.5 w-full",
                compacta ? "top-2" : "top-[11px]",
                e.estado === "listo" ? "bg-emerald-600 dark:bg-emerald-500" : "bg-border",
              )}
            />
          )}
          <Punto estado={e.estado} grande={!compacta} />
          {!compacta && (
            <>
              <span className="text-[12px] font-semibold leading-tight">{NOMBRE_ETAPA[e.clave]}</span>
              <span
                className={cn(
                  "hidden text-[11px] leading-tight sm:block",
                  e.estado === "frenado" ? "font-medium text-red-700 dark:text-red-300" : e.estado === "te_toca" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {detalle ? detalle(e) : e.detalle}
              </span>
            </>
          )}
          {compacta && (e.estado === "frenado" || e.estado === "te_toca" || e.estado === "marcha") && (
            <span className="sr-only">{NOMBRE_ETAPA[e.clave]}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export const ORDEN_ETAPAS = ETAPAS.map((e) => e.clave);

/** Aviso con fondo: ámbar para advertir, rojo para un bloqueo, azul para algo en marcha. */
export function Aviso({
  tono = "aviso",
  titulo,
  children,
  className,
}: {
  tono?: "aviso" | "bloqueo" | "marcha";
  titulo?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icono = tono === "bloqueo" ? OctagonAlert : tono === "marcha" ? Clock : TriangleAlert;
  return (
    <div
      role={tono === "bloqueo" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-[13px]",
        tono === "aviso" && "bg-amber-500/10",
        tono === "bloqueo" && "bg-red-500/10",
        tono === "marcha" && "bg-blue-500/10",
        className,
      )}
    >
      <Icono aria-hidden className={cn("mt-0.5 size-4 shrink-0", TEXTO[tono])} />
      <div className="min-w-0">
        {titulo && <p className={cn("font-medium", TEXTO[tono])}>{titulo}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}

/** Tarjeta de sección de la ficha: borde, fondo de card y encabezado h2. */
export function Seccion({ titulo, accion, children, className, id }: { titulo: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-4 overflow-hidden rounded-md border bg-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-[14px] font-semibold">{titulo}</h2>
        {accion}
      </header>
      {children}
    </section>
  );
}
