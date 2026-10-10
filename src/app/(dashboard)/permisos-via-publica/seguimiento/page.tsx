import { redirect } from "next/navigation";

// Seguimiento se fundió en la lista "Permisos de andamio" (rediseño 09/10): cada fila trae la
// línea de 7 etapas y la fecha estimada. El link viejo lleva a la lista.

export default function SeguimientoPermisosPage() {
  redirect("/permisos-via-publica");
}
