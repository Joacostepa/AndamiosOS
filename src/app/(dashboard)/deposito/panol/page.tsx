"use client";

import { BandejaPanol } from "@/components/panol/oficina/bandeja/bandeja";

// Pañol › Bandeja: "¿qué hago ahora?" (docs/panol/modulo.md §6.14). El encabezado y las
// pestañas los pone el layout; las secciones las arma el servidor (/api/panol/bandeja).

export default function PanolBandejaPage() {
  return <BandejaPanol />;
}
