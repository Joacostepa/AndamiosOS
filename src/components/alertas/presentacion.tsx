import {
  AlertTriangle,
  Bell,
  FileWarning,
  Package,
  ShieldCheck,
  Siren,
  Sparkles,
} from "lucide-react";

// Cómo se ve cada tipo de alerta. Vive acá porque hay DOS lugares que las dibujan —la
// campanita del header y la página /alertas— y si cada uno tuviera su tabla, el mismo
// aviso terminaría con un ícono en un lado y otro en el otro. Es el mismo criterio de un
// dueño por dato que usa el resto del proyecto, aplicado a la presentación.

export const PRIORIDAD_COLORS: Record<string, string> = {
  critica: "bg-red-500/15 text-red-400 border-red-500/25",
  alta: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  media: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  baja: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

/** El color del punto de la lista compacta, donde no entra el badge con la palabra. */
export const PRIORIDAD_PUNTO: Record<string, string> = {
  critica: "bg-red-500",
  alta: "bg-orange-500",
  media: "bg-yellow-500",
  baja: "bg-blue-500",
};

const ICONOS: Record<string, typeof Bell> = {
  // Los tres avisos de operaciones.
  ot_nueva: Sparkles,
  ot_habilitada: ShieldCheck,
  ot_urgente: Siren,
  // Tipos previstos en el schema original, todavía sin productor.
  documento_vencimiento: FileWarning,
  stock_bajo_minimo: Package,
  remito_pendiente: AlertTriangle,
};

/**
 * El ícono del tipo, o la campana si es un tipo que todavía no conocemos — un aviso que
 * llega con un tipo nuevo se dibuja igual, no desaparece.
 *
 * Es un componente y no una función que devuelve el componente: sacar el ícono de una
 * tabla dentro del render y usarlo como `<Icono />` crea un tipo de componente nuevo en
 * cada pasada, que es lo que React reinicia de estado (y lo que marca la regla
 * react-hooks/static-components).
 */
export function IconoAlerta({ tipo, className }: { tipo: string; className?: string }) {
  const Icono = ICONOS[tipo] ?? Bell;
  return <Icono className={className} />;
}
