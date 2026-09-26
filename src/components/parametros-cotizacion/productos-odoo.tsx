"use client";

import { CircleCheck, CircleHelp, CircleX, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useVerificarProductos } from "@/hooks/use-parametros-cotizacion";
import type { ProductoOdoo } from "@/lib/parametros-cotizacion/tipos";

// Con qué producto de Odoo sale cada línea del presupuesto. La tabla viene de la skill
// andamios-propuesta y NO se edita desde acá: un product_id equivocado ensucia órdenes reales.
// Lo que sí se puede es verificarla contra Odoo: si un producto se archiva, se ve acá antes
// de que el asistente intente usarlo.

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ProductosOdoo({ productos, puedeEditar }: { productos: ProductoOdoo[]; puedeEditar: boolean }) {
  const verificar = useVerificarProductos();
  const ultima = productos.map((p) => p.verificado_at).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted-foreground">
          {ultima ? `Última verificación contra Odoo: ${fechaHora(ultima)}` : "Todavía no se verificaron contra Odoo."}
        </p>
        {puedeEditar && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={verificar.isPending}
            onClick={() =>
              verificar.mutate(undefined, {
                onSuccess: (r) =>
                  r.mal ? toast.error(`${r.mal} productos no están activos en Odoo: el asistente no los va a usar`) : toast.success(`Los ${r.ok} productos están activos en Odoo`),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {verificar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Verificar en Odoo
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Id</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Unidad</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Renovación</th>
              <th className="px-3 py-2 font-medium">Odoo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {productos.map((p) => (
              <tr key={p.clave}>
                <td className="px-3 py-1.5 font-mono text-[12px] text-muted-foreground">{p.product_id}</td>
                <td className="px-3 py-1.5">
                  <p>{p.nombre}</p>
                  {p.uso && <p className="text-[11px] text-muted-foreground">{p.uso}</p>}
                </td>
                <td className="px-3 py-1.5">{p.unidad ?? "—"}</td>
                <td className="px-3 py-1.5">{p.is_rental ? "Alquiler" : "Servicio"}</td>
                <td className="px-3 py-1.5">{p.unica_vez ? "Única vez: fuera de la base" : "Entra en la base"}</td>
                <td className="px-3 py-1.5">
                  {p.verificado_ok === null ? (
                    <CircleHelp className="size-4 text-muted-foreground" aria-label="Sin verificar" />
                  ) : p.verificado_ok ? (
                    <CircleCheck className="size-4 text-emerald-500" aria-label="Activo en Odoo" />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <CircleX className="size-4" /> {p.verificado_nombre ? "archivado" : "no existe"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
