// Mientras se calcula la pantalla: esqueletos con la forma de las tarjetas (§7.7), sin
// spinner central y sin ceros. El encabezado del layout queda a la vista.

import { Skeleton } from "@/components/ui/skeleton";

export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-card p-3.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-8 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        ))}
      </div>
      <div className="space-y-2.5 rounded-lg border bg-card p-4">
        <Skeleton className="h-3.5 w-1/4" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-6" />)}
      </div>
    </div>
  );
}
