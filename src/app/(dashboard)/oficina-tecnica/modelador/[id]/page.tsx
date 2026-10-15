"use client";

import { use, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ejemploParana631 } from "@/lib/tecnica/modelo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useCatalogoModelador, useModelo } from "@/components/tecnica/modelador/datos/api";
import { useNivelModelador } from "@/components/tecnica/modelador/util/permisos";
import { Boxes, Monitor } from "lucide-react";

// Editor del modelador. El 3D (three) solo corre en el navegador: el editor se carga con
// dynamic(ssr:false), que en Next 16 solo vale dentro de un client component (como el mapa de
// obras). /oficina-tecnica/modelador/demo abre la obra de ejemplo sin guardar.

const Editor = dynamic(() => import("@/components/tecnica/modelador/editor"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Cargando el modelador…</div>,
});

function useAncho(min: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(`(min-width: ${min}px)`);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(min-width: ${min}px)`).matches,
    () => true,
  );
}

export default function EditorModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const demo = id === "demo";
  const grande = useAncho(1280);
  const nivel = useNivelModelador();
  const modelo = useModelo(demo ? null : id);
  const catalogo = useCatalogoModelador();
  const disenoDemo = useMemo(() => (demo ? ejemploParana631() : undefined), [demo]);
  // El autoguardado guarda por fuera de react-query: al salir del editor se descarta el modelo
  // cacheado para que al volver se lea la revisión nueva (si no, el primer guardado daría 409).
  const qc = useQueryClient();
  useEffect(() => () => qc.removeQueries({ queryKey: ["modelador", "modelo", id] }), [qc, id]);

  if (!grande) {
    return (
      <EmptyState icon={Monitor} title="El modelador se usa en una pantalla grande" description="Abrilo en una compu (1280 px o más). Desde acá podés ver la lista de modelos.">
        <Link href="/oficina-tecnica/modelador" className={buttonVariants({ variant: "outline" })}>Ver los modelos</Link>
      </EmptyState>
    );
  }
  if (!demo && modelo.isError) {
    return (
      <EmptyState icon={Boxes} title="No pude abrir el modelo" description={modelo.error instanceof Error ? modelo.error.message : undefined}>
        <Link href="/oficina-tecnica/modelador" className={buttonVariants({ variant: "outline" })}>Volver a los modelos</Link>
      </EmptyState>
    );
  }
  const listo = catalogo.data && (demo || modelo.data);
  return (
    <div className="h-[calc(100vh-6rem)]">
      {listo ? (
        <Editor
          modelo={demo ? null : modelo.data!}
          disenoDemo={disenoDemo}
          catalogo={catalogo.data!.catalogo}
          errorCatalogo={catalogo.data!.error}
          soloLectura={!demo && nivel !== "editar"}
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">Cargando el modelo…</div>
      )}
    </div>
  );
}
