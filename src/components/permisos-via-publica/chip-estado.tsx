import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { colorEstado, etiquetaEstado, type Expediente } from "@/lib/permisos-via-publica/tipos";

// Mismos colores que StatusBadge, pero con la etiqueta en castellano ("Subsanación") en vez
// del valor crudo: StatusBadge capitaliza el texto que recibe y "SUBSANACION" se leería mal.
const COLORES = {
  red: "bg-red-500/15 text-red-400 border-red-500/25",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
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
