"use client";

// El editor del modelador SIN sesión ni Supabase, para probarlo con Playwright en desarrollo
// (src/app/prueba/modelador). Abre la obra de ejemplo con el catálogo de prueba; las rutas de la
// API (/api/tecnica/modelador/**) las puede contestar el arnés con `page.route`.

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { CATALOGO_FIXTURE, ejemploParana631 } from "@/lib/tecnica/modelo";
import { QueryProvider } from "@/components/providers/query-provider";
import { AccesoProvider } from "@/components/providers/acceso-provider";
import { Toaster } from "@/components/ui/sonner";

const Editor = dynamic(() => import("./editor"), { ssr: false });

export function ArnesModelador({ vacio = false }: { vacio?: boolean }) {
  const diseno = useMemo(() => {
    const d = ejemploParana631();
    if (vacio) {
      d.estructuras = [];
      d.uniones = [];
      d.nombre = "Modelo vacío";
    }
    return d;
  }, [vacio]);
  return (
    <QueryProvider>
      <AccesoProvider acceso={{ rol: "admin", activo: true, permisos: {}, debeCambiarClave: false }}>
        <main className="h-screen p-3">
          <Editor modelo={null} disenoDemo={diseno} catalogo={CATALOGO_FIXTURE} errorCatalogo={null} soloLectura={false} />
        </main>
        <Toaster />
      </AccesoProvider>
    </QueryProvider>
  );
}
