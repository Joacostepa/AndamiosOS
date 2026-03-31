import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusColor = "blue" | "green" | "yellow" | "orange" | "red" | "gray";

const colorMap: Record<StatusColor, string> = {
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  red: "bg-red-500/15 text-red-400 border-red-500/25",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

// Mapeo de estados a colores
const estadoColorMap: Record<string, StatusColor> = {
  // Obras
  presupuestada: "gray",
  aprobada: "blue",
  en_proyecto: "blue",
  proyecto_aprobado: "blue",
  lista_para_ejecutar: "yellow",
  en_montaje: "orange",
  montada: "green",
  en_uso: "green",
  en_desarme: "orange",
  desarmada: "yellow",
  en_devolucion: "yellow",
  cerrada_operativamente: "green",
  cancelada: "gray",
  suspendida: "gray",
  en_espera: "yellow",
  // Remitos
  emitido: "blue",
  en_transito: "orange",
  recibido: "green",
  con_diferencia: "red",
  cerrado: "green",
  anulado: "gray",
  // Clientes
  activo: "green",
  inactivo: "gray",
  // Documentos / Habilitacion
  vigente: "green",
  por_vencer: "yellow",
  vencido: "red",
  habilitado: "green",
  no_habilitado: "red",
  // Vehiculos
  disponible: "green",
  en_ruta: "blue",
  en_taller: "orange",
  fuera_servicio: "red",
};

interface StatusBadgeProps {
  status: string;
  color?: StatusColor;
  className?: string;
}

export function StatusBadge({ status, color, className }: StatusBadgeProps) {
  const resolvedColor = color || estadoColorMap[status] || "gray";
  const label = status.replace(/_/g, " ");

  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize font-medium",
        colorMap[resolvedColor],
        className
      )}
    >
      {label}
    </Badge>
  );
}
