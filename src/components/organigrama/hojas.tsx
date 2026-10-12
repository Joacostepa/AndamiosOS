"use client";

// Las hojas laterales que abre la URL: ?puesto=<clave> y ?persona=<id>. Una URL por puesto y
// por persona: se puede mandar por WhatsApp, y el botón Atrás cierra la hoja.
// Usa useSearchParams: el layout la envuelve en <Suspense> (Next 16).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FichaPersona } from "./ficha-persona";
import { FichaPuesto } from "./ficha-puesto";

export function HojasOrganigrama() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const puesto = params.get("puesto");
  const persona = params.get("persona");

  const cerrar = () => {
    const resto = new URLSearchParams(params.toString());
    resto.delete("puesto");
    resto.delete("persona");
    const q = resto.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  if (puesto) return <FichaPuesto key={`puesto-${puesto}`} clave={puesto} onCerrar={cerrar} />;
  if (persona) return <FichaPersona key={`persona-${persona}`} id={persona} onCerrar={cerrar} />;
  return null;
}
