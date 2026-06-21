import { cn } from "@/lib/utils";

// Avatar de iniciales con los colores de marca del spec (fondo #FAECE7 / texto #993C1D).
export function InicialesAvatar({
  nombre,
  size = 18,
  className,
  bg = "#FAECE7",
  color = "#993C1D",
}: {
  nombre: string;
  size?: number;
  className?: string;
  bg?: string;
  color?: string;
}) {
  const iniciales =
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "—";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size / 2),
        backgroundColor: bg,
        color,
      }}
    >
      {iniciales}
    </span>
  );
}
