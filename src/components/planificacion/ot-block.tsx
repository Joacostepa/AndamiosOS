import { cn } from "@/lib/utils";
import { TIPO_OT_TOKENS, dotColor, type TipoOtKey } from "@/lib/planificacion/colores";

// Bloque de OT (o de viaje de camión) dentro de una celda de la grilla.
export function OtBlock({
  titulo,
  tipoKey,
  subtitulo,
  estado,
  selected = false,
  onClick,
}: {
  titulo: string;
  tipoKey: TipoOtKey;
  subtitulo: string;
  estado?: string; // si se pasa, muestra el dot de estado de jornada
  selected?: boolean;
  onClick?: () => void;
}) {
  const t = TIPO_OT_TOKENS[tipoKey];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[4px] px-1.5 py-1 text-left transition-opacity hover:opacity-85",
      )}
      style={{
        backgroundColor: t.bg,
        borderLeft: `3px solid ${t.borde}`,
        outline: selected ? "2px solid #D85A30" : undefined,
        outlineOffset: selected ? "1px" : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium" style={{ color: t.text }}>
          {titulo}
        </span>
        {estado && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor(estado) }}
          />
        )}
      </div>
      <p className="truncate text-[9px]" style={{ color: t.text, opacity: 0.85 }}>
        {subtitulo}
      </p>
    </button>
  );
}
