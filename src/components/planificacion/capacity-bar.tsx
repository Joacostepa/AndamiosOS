import { capacidadColor } from "@/lib/planificacion/colores";

// Barra de capacidad de un recurso (cuadrilla/camión) en el día en foco.
export function CapacityBar({
  pct,
  label,
  sobreasignado = false,
}: {
  pct: number;
  label: string;
  sobreasignado?: boolean;
}) {
  const color = capacidadColor(pct);
  return (
    <div className="space-y-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
        />
      </div>
      <p
        className="text-[9px] leading-tight"
        style={{ color: pct >= 100 || sobreasignado ? "#D85A30" : undefined }}
      >
        {label}
      </p>
    </div>
  );
}
