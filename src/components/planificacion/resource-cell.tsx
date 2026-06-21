import { RecursoAvatar } from "./recurso-avatar";
import { CapacityBar } from "./capacity-bar";

// Celda de identificación del recurso (columna izquierda, sticky).
export function ResourceCell({
  codigo,
  variant,
  nombre,
  sublabel,
  capacidadPct,
  capacidadLabel,
  sobreasignado,
}: {
  codigo: string;
  variant: "cuadrilla" | "camion";
  nombre: string;
  sublabel: string;
  capacidadPct: number;
  capacidadLabel: string;
  sobreasignado?: boolean;
}) {
  return (
    <div className="sticky left-0 z-10 flex min-h-[90px] flex-col justify-between gap-2 border-b border-r bg-card p-2">
      <div className="flex items-start gap-2">
        <RecursoAvatar codigo={codigo} variant={variant} />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium leading-tight">{nombre}</p>
          <p className="truncate text-[10px] leading-tight text-muted-foreground">{sublabel}</p>
        </div>
      </div>
      <CapacityBar pct={capacidadPct} label={capacidadLabel} sobreasignado={sobreasignado} />
    </div>
  );
}
