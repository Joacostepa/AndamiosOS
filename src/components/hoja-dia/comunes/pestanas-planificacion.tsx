"use client";

// Las pestañas de Planificación: [Tablero] [Hoja del día]. Van en la barra del tablero y en
// el encabezado de la hoja. "Hoja del día" sólo si el usuario la puede abrir.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { puedeAbrir } from "@/lib/auth/acceso";
import { useAcceso } from "@/components/providers/acceso-provider";
import { cn } from "@/lib/utils";

export function PestanasPlanificacion({ className }: { className?: string }) {
  const pathname = usePathname();
  const acceso = useAcceso();
  const enHoja = pathname.startsWith("/planificacion/hoja");
  if (!puedeAbrir(acceso, "/planificacion/hoja")) return null;
  return (
    <nav aria-label="Planificación" className={cn("inline-flex gap-0.5 rounded-lg bg-muted p-[3px]", className)}>
      {[
        { href: "/planificacion", l: "Tablero", on: !enHoja },
        { href: "/planificacion/hoja", l: "Hoja del día", on: enHoja },
      ].map((t) => (
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
