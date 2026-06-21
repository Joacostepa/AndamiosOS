import { Utensils } from "lucide-react";
import { TIPO_OT_TOKENS } from "@/lib/planificacion/colores";

// Bloque de franja bloqueada (almuerzo, capacitación, feriado).
export function BloqueoBlock({
  motivo,
  desde,
  hasta,
  onClick,
}: {
  motivo: string | null;
  desde: string;
  hasta: string;
  onClick?: () => void;
}) {
  const t = TIPO_OT_TOKENS.bloqueado;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Quitar bloqueo"
      className="w-full rounded-[4px] px-1.5 py-1 text-left transition-opacity hover:opacity-85"
      style={{ backgroundColor: t.bg, borderLeft: `3px solid ${t.borde}` }}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: t.text }}>
        <Utensils className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{motivo || "Bloqueado"}</span>
      </span>
      <p className="truncate text-[9px]" style={{ color: t.text }}>
        {desde.slice(0, 5)} – {hasta.slice(0, 5)}
      </p>
    </button>
  );
}
