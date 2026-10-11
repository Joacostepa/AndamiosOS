// Un vehículo como lo conocen en el depósito: la marca en texto normal y la patente en
// monoespaciada ("Iveco AB 799 CA"). Sin marca, la patente sola. `largo` suma la hidrogrúa
// ("Agrale hidrogrúa AB 831 LC"). El texto plano es `nombreVehiculo` (estado.ts).
import { marcaVehiculo } from "@/lib/hoja-dia/estado";
import type { Vehiculo } from "@/lib/hoja-dia/tipos";
import { cn } from "@/lib/utils";

export function VehiculoNombre({ v, largo = false, className, mono = "font-mono text-xs tracking-tight" }: {
  v: Pick<Vehiculo, "marca" | "patente" | "tipo"> | null | undefined;
  largo?: boolean;
  className?: string;
  /** Las clases de la patente (el tamaño cambia según dónde va). */
  mono?: string;
}) {
  if (!v) return null;
  const m = marcaVehiculo(v, largo);
  return (
    <span className={className}>
      {m && `${m} `}
      <span className={cn("whitespace-nowrap", mono)}>{v.patente}</span>
    </span>
  );
}
