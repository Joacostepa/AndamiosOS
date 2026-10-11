// El tiempo de un viaje al lado de su hora: "~35 min en auto" con un ícono chico que dice
// de dónde sale (Google Maps con el tránsito, o la duración típica del parámetro). El
// porqué va en el `title` del ícono (rutas.ts / tiempos.ts).
import { Car, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { tiempoTitulo, tiempoTxt } from "@/lib/hoja-dia/tiempos";
import type { TiempoTramo as Tiempo } from "@/lib/hoja-dia/tipos";

export function TiempoTramo({ t, className }: { t: Tiempo | null | undefined; className?: string }) {
  if (!t) return null;
  const titulo = tiempoTitulo(t);
  const Icono = t.fuente === "google" ? Car : Clock;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums", className)} title={titulo}>
      <Icono className="size-3 flex-none" aria-hidden />
      {tiempoTxt(t)}
      <span className="sr-only"> ({t.fuente === "google" ? "según Google Maps" : "duración típica"})</span>
    </span>
  );
}
