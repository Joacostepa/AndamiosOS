"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BandejaRevision } from "@/components/sistemas/revision/bandeja";

// La bandeja de Sistemas (src/components/sistemas/revision/). Sólo con Sistemas · Revisión en
// «editar»: el proxy cierra la página y cada API repite la llave.
export default function RevisionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BandejaRevision />
    </Suspense>
  );
}
