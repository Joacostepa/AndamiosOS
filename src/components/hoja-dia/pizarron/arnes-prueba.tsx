"use client";

// Lo que el dashboard le da al Pizarrón (TanStack Query, permisos, parámetros, avisos), armado
// a mano para la página de prueba de desarrollo (src/app/prueba/pizarron, e2e/hoja-dia): un
// administrador y hora de corte 15:00. Sin el menú ni el header.

import { Suspense } from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { AccesoProvider } from "@/components/providers/acceso-provider";
import { Toaster } from "@/components/ui/sonner";
import { ProveedorCorteHoja } from "@/components/hoja-dia/comunes/use-dia-hoja";
import { Pizarron } from "./pizarron";

export function ArnesPizarron() {
  return (
    <QueryProvider>
      <AccesoProvider acceso={{ rol: "admin", activo: true, permisos: {}, debeCambiarClave: false }}>
        <ProveedorCorteHoja corteMin={15 * 60}>
          <main className="min-w-0 flex-1 p-6">
            <Suspense fallback={null}>
              <Pizarron />
            </Suspense>
          </main>
          <Toaster />
        </ProveedorCorteHoja>
      </AccesoProvider>
    </QueryProvider>
  );
}
