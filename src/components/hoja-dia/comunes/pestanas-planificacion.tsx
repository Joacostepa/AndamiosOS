"use client";

// Las pestañas de Planificación: [Tablero] [Hoja del día] (y [Pizarrón (nuevo)]). Van en la
// barra del tablero, en el encabezado de la hoja y en la barra del Pizarrón. "Hoja del día"
// sólo si el usuario la puede abrir. El Pizarrón, según hd_parametros.pizarron
// (lib/hoja-dia/modo-pizarron.ts): con "probar", para quien edita la Hoja del día; con
// "principal" la Hoja del día ES el pizarrón (no hace falta otra pestaña). Si se está
// mirando el pizarrón (se abre por URL aunque esté oculto), la pestaña aparece igual.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nivelEn, puedeAbrir } from "@/lib/auth/acceso";
import { RUTA_PIZARRON } from "@/lib/hoja-dia/modo-pizarron";
import { useAcceso } from "@/components/providers/acceso-provider";
import { cn } from "@/lib/utils";
import { useModoPizarron } from "./modo-pizarron";

export function PestanasPlanificacion({ className }: { className?: string }) {
  const pathname = usePathname();
  const acceso = useAcceso();
  const modo = useModoPizarron();
  const enPizarron = pathname.startsWith(RUTA_PIZARRON);
  const enHoja = pathname.startsWith("/planificacion/hoja");
  if (!puedeAbrir(acceso, "/planificacion/hoja")) return null;
  const conPizarron = modo !== "principal" && (enPizarron || (modo === "probar" && nivelEn(acceso, "hoja-dia") === "editar"));
  const tabs = [
    { href: "/planificacion", l: "Tablero", on: !enHoja },
    { href: "/planificacion/hoja", l: "Hoja del día", on: enHoja && (!enPizarron || modo === "principal") },
    ...(conPizarron ? [{ href: RUTA_PIZARRON, l: "Pizarrón (nuevo)", on: enPizarron }] : []),
  ];
  return (
    <nav aria-label="Planificación" className={cn("inline-flex gap-0.5 rounded-lg bg-muted p-[3px]", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.on ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            t.on && "bg-card text-foreground shadow-xs",
          )}
        >
          {t.l}
        </Link>
      ))}
    </nav>
  );
}
