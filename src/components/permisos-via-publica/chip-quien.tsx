import { cn } from "@/lib/utils";
import type { Quien } from "@/lib/permisos-via-publica/seguimiento";

// Quién tiene que mover el trámite. Compartido por la bandeja y Seguimiento.
// Colores en par claro/oscuro (700/300) para que se lean en los dos temas: ABA en rojo porque
// nadie más lo va a mover; el cliente en ámbar porque suele haber que empujarlo; los de afuera
// (Segucom, CPAU) en azul; robot y GCBA en gris porque no hay nada que hacer.

const COLOR_QUIEN: Record<Quien, string> = {
  Cliente: "text-amber-800 dark:text-amber-300 bg-amber-500/10",
  Segucom: "text-blue-700 dark:text-blue-300 bg-blue-500/10",
  CPAU: "text-blue-700 dark:text-blue-300 bg-blue-500/10",
  Robot: "text-muted-foreground bg-muted",
  GCBA: "text-muted-foreground bg-muted",
  ABA: "text-red-700 dark:text-red-300 bg-red-500/10",
};

export function ChipQuien({ quien, prefijo = "", className }: { quien: Quien | "Listo"; prefijo?: string; className?: string }) {
  const color = quien === "Listo" ? "text-green-700 dark:text-green-300 bg-green-500/10" : COLOR_QUIEN[quien];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold", color, className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {prefijo}
      {quien}
    </span>
  );
}
