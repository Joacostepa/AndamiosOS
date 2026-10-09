import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { colorEstado, etiquetaEstado, type Expediente } from "@/lib/permisos-via-publica/tipos";

// Mismos colores que StatusBadge, pero con la etiqueta en castellano ("Subsanación") en vez
// del valor crudo: StatusBadge capitaliza el texto que recibe y "SUBSANACION" se leería mal.
// Par claro/oscuro: con -400 solo, el texto no se leía sobre fondo claro.
const COLORES = {
  red: "bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
  yellow: "bg-amber-500/10 text-amber-800 border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  blue: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
  gray: "bg-zinc-500/10 text-zinc-700 border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-300",
} as const;

export function ChipEstado({
  expediente,
  className,
}: {
  expediente: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente">;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-medium", COLORES[colorEstado(expediente)], className)}>
      {etiquetaEstado(expediente.estado_tad)}
      {expediente.tarea_pendiente ? " · tarea pendiente" : ""}
    </Badge>
  );
}
