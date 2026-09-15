"use client";

import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIniciarTramite, useVentasParaIniciar } from "@/hooks/use-permisos-via-publica";

// Ventas con "Lleva permiso = Sí" que todavía no arrancaron. "Iniciar trámite" abre el
// trámite y le manda el link al cliente; de ahí en adelante el proceso sigue solo.
//
// A MANO A PROPÓSITO (JS, 2026-09-15): el automatismo de Odoo existe pero está apagado hasta
// ver andar los primeros trámites.

const dia = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export function VentasParaIniciar() {
  const { data, isLoading, error } = useVentasParaIniciar();
  const iniciar = useIniciarTramite();
  const router = useRouter();

  if (isLoading) return null;
  if (error) {
    return <p className="text-[12px] text-orange-400">No se pudieron leer las ventas para iniciar: {error instanceof Error ? error.message : ""}</p>;
  }
  if (!data || data.length === 0) return null;

  return (
    <section className="rounded-md border border-yellow-500/30">
      <header className="border-b px-3 py-2">
        <h2 className="text-[14px] font-semibold">
          Ventas para iniciar <span className="text-muted-foreground">· {data.length}</span>
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Confirmadas con permiso de implantación y sin trámite. Al iniciar sale el link para cargar el dueño del lote y su
          documentación: al cliente o, en modo supervisado, al vendedor de la orden para que se lo pase.
        </p>
      </header>
      <ul>
        {data.map((v) => {
          const pendiente = iniciar.isPending && iniciar.variables === v.ventaId;
          return (
            <li key={v.ventaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-[13px] last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {v.direccion ?? "Sin dirección de obra"} <span className="font-normal text-muted-foreground">· {v.venta} · {dia(v.fecha)}</span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {v.cliente ?? "Sin cliente"} · {v.email ?? "sin mail"}
                  {v.vendedor && ` · vendedor: ${v.vendedor}`}
                  {v.problemaMail && <span className="text-orange-400"> · {v.problemaMail} Se inicia igual y el link se manda por WhatsApp.</span>}
                </p>
                {/* "Se arma con el expediente" = la gestión ya se inició: puede estar en curso por
                    fuera de la app y mandarle el link al cliente sería pedirle todo de nuevo. */}
                {v.modalidad === "con_expediente" && (
                  <p className="text-[12px] text-yellow-300">
                    La modalidad dice que la gestión ya se inició: fijate que no esté en curso antes de iniciar.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={iniciar.isPending}
                onClick={() =>
                  iniciar.mutate(v.ventaId, {
                    onSuccess: (r) => {
                      if (r.resultado === "ya_abierto") toast.info("Esta venta ya tenía trámite");
                      else if (r.linkEnviado) toast.success(`Trámite iniciado: le mandamos el link a ${r.linkEnviadoA ?? v.email}`);
                      else toast.warning("Trámite iniciado, pero el mail no salió: copiá el link y mandalo por WhatsApp");
                      router.push(`/permisos-via-publica/tramites/${r.tramiteId}`);
                    },
                    onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo iniciar"),
                  })
                }
              >
                {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Iniciar trámite
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
