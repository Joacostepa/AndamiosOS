// El Pizarrón del día (/planificacion/hoja/pizarron?dia=…): el rediseño de la Hoja del día
// (docs/equipos-del-dia/rediseno-plan.md). Tiene su propia barra (día, avisos, Deshacer,
// Copiar, Mandar), así que NO usa el encabezado de la hoja clásica (grupo `(clasica)`). Es
// del módulo `hoja-dia` (moduloDeRuta: gana la ruta más larga, /planificacion/hoja) y abre
// por URL aunque hd_parametros.pizarron esté en "oculto" (para probarlo).

export default function PizarronLayout({ children }: { children: React.ReactNode }) {
  return <div className="hoja-dia pizarron flex min-h-0 min-w-0 flex-col">{children}</div>;
}
