import { cn } from "@/lib/utils";
import { ACENTO_BG, ACENTO_TEXT, CAMION_BG, CAMION_TEXT } from "@/lib/planificacion/colores";

// Avatar de recurso: C1/C2 (cuadrilla, coral) o T1/T2 (camión, azul).
export function RecursoAvatar({
  codigo,
  variant,
  size = 24,
  className,
}: {
  codigo: string;
  variant: "cuadrilla" | "camion";
  size?: number;
  className?: string;
}) {
  const bg = variant === "camion" ? CAMION_BG : ACENTO_BG;
  const color = variant === "camion" ? CAMION_TEXT : ACENTO_TEXT;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size / 2.4), backgroundColor: bg, color }}
    >
      {codigo}
    </span>
  );
}
