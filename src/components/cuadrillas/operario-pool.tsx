"use client";

import { InicialesAvatar } from "@/components/computos/iniciales-avatar";
import { nombreCorto } from "@/lib/cuadrillas";
import type { Personal } from "@/hooks/use-personal";

export function OperarioPool({
  operarios,
  cuadrillaDe,
}: {
  operarios: Personal[];
  // personalId → nombre de cuadrilla (o undefined si "Sin cuadrilla")
  cuadrillaDe: Record<string, string | undefined>;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Pool de operarios de obra</h2>
        <p className="text-[13px] text-muted-foreground">
          Todos los operarios disponibles para asignar a cuadrillas · los de depósito no aparecen acá
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {operarios.map((op) => {
          const cuad = cuadrillaDe[op.id];
          return (
            <div key={op.id} className="flex items-center gap-2 rounded-md border bg-card p-2">
              <InicialesAvatar
                nombre={`${op.nombre} ${op.apellido}`}
                size={28}
                bg="var(--secondary)"
                color="var(--secondary-foreground)"
              />
              <span className="min-w-0 flex-1 truncate text-xs">{nombreCorto(op.nombre, op.apellido)}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={
                  cuad
                    ? { backgroundColor: "#EAF3DE", color: "#3B6D11" }
                    : { backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }
                }
              >
                {cuad ?? "Sin cuadrilla"}
              </span>
            </div>
          );
        })}
        {operarios.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            No hay operarios de obra cargados.
          </p>
        )}
      </div>
    </section>
  );
}
