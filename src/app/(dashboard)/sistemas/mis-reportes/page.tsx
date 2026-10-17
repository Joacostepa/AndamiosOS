"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MisReportes } from "@/components/sistemas/mis-reportes";

// Lo que cada uno le avisó a Sistemas (src/components/sistemas/mis-reportes.tsx).
export default function MisReportesPage() {
  // useSearchParams (el ?id= de la campanita) necesita un límite de Suspense.
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-[860px]" />}>
      <MisReportes />
    </Suspense>
  );
}
