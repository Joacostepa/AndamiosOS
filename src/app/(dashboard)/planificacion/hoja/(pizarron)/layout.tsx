// La Hoja del día (/planificacion/hoja?dia=…) es el Pizarrón del día (docs/equipos-del-dia/
// rediseno-plan.md). Tiene su propia barra (día, avisos, Deshacer, Copiar, Mandar), así que
// NO usa el encabezado de Camiones (grupo `(clasica)`). Es del módulo `hoja-dia`.

export default function PizarronLayout({ children }: { children: React.ReactNode }) {
  return <div className="hoja-dia pizarron flex min-h-0 min-w-0 flex-col">{children}</div>;
}
