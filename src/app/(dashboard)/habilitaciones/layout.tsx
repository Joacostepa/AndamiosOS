import { PlanificacionHabilitaciones } from "@/components/habilitaciones/planificacion-contexto";

// El layout del módulo existe por el panel de planificación: envuelve la bandeja, la ficha
// y la guía, y no se vuelve a montar al navegar entre ellas, así que el panel sigue abierto
// y con sus datos al pasar de la bandeja a una obra.

export default function HabilitacionesLayout({ children }: { children: React.ReactNode }) {
  return <PlanificacionHabilitaciones>{children}</PlanificacionHabilitaciones>;
}
