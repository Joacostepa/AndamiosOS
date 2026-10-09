"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useIniciarTramite } from "@/hooks/use-permisos-via-publica";
import { direccionCorta, mismoTexto, type VentaParaIniciar } from "@/lib/permisos-via-publica/tipos";
import { Advertencia, Aviso, diaCompleto, haceDias, Seccion } from "./bandeja";

// Ventas con "Lleva permiso = Sí" que todavía no arrancaron. "Iniciar trámite" abre el
// trámite y manda el link para cargar el dueño del lote; de ahí en adelante el proceso sigue solo.
//
// A MANO A PROPÓSITO (JS, 2026-09-15): el automatismo de Odoo existe pero está apagado hasta
// ver andar los primeros trámites.
//
// La lista la lee la página (comparte la búsqueda y el conteo del encabezado) y llega filtrada.

const nombreCorto = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;

export function VentasParaIniciar({
  ventas,
  total,
  isLoading,
  error,
  linkAlCliente,
  busqueda,
  ahora,
}: {
  ventas: VentaParaIniciar[];
  total: number;
  isLoading: boolean;
  error: unknown;
  /** Modo supervisado: false = el link va a la vendedora para que se lo pase al cliente. */
  linkAlCliente: boolean;
  busqueda: string;
  /** Hora de la última lectura de la bandeja (para "vendida hace N días"). */
  ahora: number;
}) {
  const iniciar = useIniciarTramite();
  const router = useRouter();
  const [aConfirmar, setAConfirmar] = useState<VentaParaIniciar | null>(null);

  if (isLoading) {
    return (
      <Seccion titulo="Ventas para iniciar" bajada="Leyendo las ventas de Odoo…">
        <div className="space-y-2 p-3" aria-busy>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Seccion>
    );
  }
  if (error) {
    return (
      <Aviso tono="advertencia" titulo="No se pudieron leer las ventas para iniciar">
        {error instanceof Error ? error.message : "Odoo no respondió."} El resto de la bandeja está al día.
      </Aviso>
    );
  }
  if (total === 0 || (busqueda && ventas.length === 0)) return null;

  function lanzar(v: VentaParaIniciar) {
    iniciar.mutate(v.ventaId, {
      onSuccess: (r) => {
        setAConfirmar(null);
        if (r.resultado === "ya_abierto") toast.info("Esta venta ya tenía trámite");
        else if (!r.linkEnviado) toast.warning("Trámite iniciado, pero el mail no salió: copiá el link de la ficha y mandalo por WhatsApp");
        else if (linkAlCliente) toast.success(`Trámite iniciado: le mandamos el link a ${r.linkEnviadoA ?? v.email}`);
        else toast.success(`Trámite iniciado: el link le llegó a ${r.linkEnviadoA ?? v.vendedor ?? "la vendedora"} para que se lo pase al cliente`);
        router.push(`/permisos-via-publica/tramites/${r.tramiteId}`);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo iniciar"),
    });
  }

  return (
    <>
      <Seccion
        id="ventas-para-iniciar"
        titulo="Ventas para iniciar"
        cantidad={busqueda ? `${ventas.length} de ${total}` : total}
        bajada={
          linkAlCliente
            ? "Confirmadas con permiso y sin trámite. Al iniciar, el cliente recibe el link para cargar el dueño del lote."
            : "Confirmadas con permiso y sin trámite. Al iniciar, el link va a la vendedora para que se lo pase al cliente."
        }
      >
        <ul>
          {ventas.map((v) => {
            const pendiente = iniciar.isPending && iniciar.variables === v.ventaId;
            const yaIniciada = v.modalidad === "con_expediente";
            const direccion = direccionCorta(v.direccion);
            const vendedora = nombreCorto(v.vendedor);
            const datos = [
              !mismoTexto(v.cliente, v.direccion) ? v.cliente : null,
              vendedora ? `vendedora: ${vendedora}` : null,
            ].filter(Boolean);
            return (
              <li key={v.ventaId} className="flex flex-col gap-2 border-b px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13.5px] font-medium">{direccion || "Sin dirección de obra"}</span>
                    <span className="font-mono text-[12px] text-muted-foreground">{v.venta}</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {datos.join(" · ")}
                    {datos.length > 0 && v.fecha && " · "}
                    {v.fecha && <span title={`Confirmada el ${diaCompleto(v.fecha)}`}>vendida {haceDias(v.fecha, ahora)}</span>}
                  </p>
                  {/* Sólo importa el mail del cliente si el link va directo a él. */}
                  {linkAlCliente && v.problemaMail && (
                    <Advertencia>{v.problemaMail} Iniciá igual y mandale el link por WhatsApp.</Advertencia>
                  )}
                  {linkAlCliente && !v.problemaMail && v.email && <p className="text-[12px] text-muted-foreground">El link va a {v.email}</p>}
                  {/* "Se arma con el expediente" = la gestión ya se inició: puede estar en curso por
                      fuera de la app y mandarle el link al cliente sería pedirle todo de nuevo. */}
                  {yaIniciada && <Advertencia>La modalidad dice que la gestión ya se inició: fijate que no esté en curso antes de iniciar.</Advertencia>}
                </div>
                <Button
                  size="sm"
                  variant={yaIniciada ? "outline" : "default"}
                  disabled={iniciar.isPending}
                  className="self-start sm:self-center"
                  aria-label={`${yaIniciada ? "Revisar e iniciar" : "Iniciar trámite de"} ${direccion || v.venta}`}
                  onClick={() => (yaIniciada ? setAConfirmar(v) : lanzar(v))}
                >
                  {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {yaIniciada ? "Revisar e iniciar…" : "Iniciar trámite"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Seccion>
      <ConfirmDialog
        open={!!aConfirmar}
        onOpenChange={(abierto) => !abierto && setAConfirmar(null)}
        title={`¿Iniciar el trámite de ${direccionCorta(aConfirmar?.direccion) || aConfirmar?.venta || ""}?`}
        description="En Odoo la modalidad dice que la gestión ya se inició. Si el permiso está en curso por fuera de la app, iniciarlo acá le vuelve a pedir el dueño del lote y toda la documentación al cliente. Fijate en TAD o en Seguimiento antes."
        confirmLabel="Iniciar igual"
        loading={iniciar.isPending}
        onConfirm={() => aConfirmar && lanzar(aConfirmar)}
      />
    </>
  );
}
