"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDescarte, useIniciarTramite } from "@/hooks/use-permisos-via-publica";
import { direccionCorta, mismoTexto, type VentaParaIniciar } from "@/lib/permisos-via-publica/tipos";
import { Aviso, Chip, type TonoChip } from "./ui";
import { Dialogo } from "./dialogo";

// Ventas con "Lleva permiso = Sí" que todavía no arrancaron, dentro de «Te toca» (rediseño 09/10).
// "Iniciar trámite" abre el trámite y manda el link para cargar el dueño del lote; "No se tramita
// acá" la saca de la lista con un motivo (las de agosto que se tramitan por fuera quedaban fijas).
//
// A MANO A PROPÓSITO (JS, 2026-09-15): el automatismo de Odoo existe pero está apagado hasta
// ver andar los primeros trámites.

const DIA = 86_400_000;
const nombreCorto = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;
const diasDesde = (fecha: string, ahora: number) => Math.max(0, Math.floor((ahora - Date.parse(`${fecha.slice(0, 10)}T00:00:00-03:00`)) / DIA));

export function VentasParaIniciar({
  ventas,
  isLoading,
  error,
  linkAlCliente,
  ahora,
  puedeEditar,
}: {
  ventas: VentaParaIniciar[];
  isLoading: boolean;
  error: unknown;
  linkAlCliente: boolean;
  ahora: number;
  puedeEditar: boolean;
}) {
  const iniciar = useIniciarTramite();
  const descartar = useDescarte();
  const router = useRouter();
  const [aConfirmar, setAConfirmar] = useState<VentaParaIniciar | null>(null);
  const [aDescartar, setADescartar] = useState<VentaParaIniciar | null>(null);
  const [motivo, setMotivo] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-2 border-t px-3 py-3" aria-busy>
        <p className="text-[13px] text-muted-foreground">Leyendo las ventas de Odoo…</p>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="border-t p-3">
        <Aviso titulo="No se pudieron leer las ventas para iniciar">{error instanceof Error ? error.message : "Odoo no respondió."} El resto de la lista está al día.</Aviso>
      </div>
    );
  }
  if (ventas.length === 0) return null;

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
    <div id="ventas-para-iniciar" className="scroll-mt-4 border-t">
      <div className="px-3 pt-3">
        <p className="text-[14px] font-semibold">Ventas para iniciar · {ventas.length}</p>
        <p className="text-[12px] text-muted-foreground">
          {linkAlCliente ? "Al iniciar, el cliente recibe el link para cargar el dueño del lote." : "Al iniciar, el link va a la vendedora para que se lo pase al cliente."}
        </p>
      </div>
      <ul>
        {ventas.map((v) => {
          const pendiente = iniciar.isPending && iniciar.variables === v.ventaId;
          const yaIniciada = v.modalidad === "con_expediente";
          const direccion = direccionCorta(v.direccion) || "Sin dirección de obra";
          const vendedora = nombreCorto(v.vendedor);
          const d = v.fecha ? diasDesde(v.fecha, ahora) : null;
          const tono: TonoChip = d == null ? "neutro" : d > 14 ? "bloqueo" : d > 7 ? "aviso" : "neutro";
          return (
            <li key={v.ventaId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-[999_1_18rem] space-y-0.5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[14px] font-semibold">{direccion}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">{v.venta}</span>
                  {vendedora && <span className="text-[12px] text-muted-foreground">Vendió: {vendedora}</span>}
                </p>
                {!mismoTexto(v.cliente, v.direccion) && v.cliente && <p className="text-[12px] text-muted-foreground">{v.cliente}</p>}
                {linkAlCliente && v.problemaMail && <p className="text-[12px] text-amber-800 dark:text-amber-300">{v.problemaMail} Iniciá igual y mandale el link por WhatsApp.</p>}
                {yaIniciada && <p className="text-[12px] text-amber-800 dark:text-amber-300">En Odoo dice «Se arma con el expediente»: el permiso puede estar ya en trámite.</p>}
              </div>
              {d != null && <Chip tono={tono}>{d === 0 ? "Vendida hoy" : d === 1 ? "Vendida ayer" : `Vendida hace ${d} días`}</Chip>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={iniciar.isPending || !puedeEditar}
                  className="max-sm:h-10"
                  aria-label={`Iniciar el trámite de ${direccion}`}
                  onClick={() => (yaIniciada ? setAConfirmar(v) : lanzar(v))}
                >
                  {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Iniciar trámite{yaIniciada ? "…" : ""}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground max-sm:h-10" disabled={!puedeEditar} onClick={() => { setMotivo(""); setADescartar(v); }}>
                  No se tramita acá…
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialogo
        open={!!aConfirmar}
        onOpenChange={(o) => !o && setAConfirmar(null)}
        titulo={`¿Iniciar el trámite de ${direccionCorta(aConfirmar?.direccion) || aConfirmar?.venta || ""}?`}
        texto="En Odoo dice «Se arma con el expediente»: el permiso puede estar en trámite por fuera de la app. Si lo iniciás acá, al cliente le vuelve a llegar el pedido del dueño del lote y de toda la documentación."
        confirmar="Iniciar igual"
        cargando={iniciar.isPending}
        onConfirmar={() => aConfirmar && lanzar(aConfirmar)}
      />
      <Dialogo
        open={!!aDescartar}
        onOpenChange={(o) => !o && setADescartar(null)}
        titulo={`¿Sacar ${direccionCorta(aDescartar?.direccion) || aDescartar?.venta || ""} de las ventas para iniciar?`}
        texto="No se le escribe a nadie. Queda anotado el motivo, y al final de la lista, en «Ventas que no se tramitan acá», se puede volver a mostrar."
        confirmar="Sacar de la lista"
        deshabilitado={motivo.trim().length < 3}
        cargando={descartar.isPending}
        onConfirmar={() =>
          aDescartar &&
          descartar.mutate(
            { tipo: "ventas", id: String(aDescartar.ventaId), motivo: motivo.trim() },
            {
              onSuccess: () => {
                toast.success("Venta sacada de la lista");
                setADescartar(null);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
            },
          )
        }
      >
        <label className="grid gap-1">
          <span className="text-[12px] text-muted-foreground">Por qué no se tramita acá</span>
          <Textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Se tramita por fuera de la app / el cliente consigue el permiso / no lleva permiso" rows={2} />
        </label>
      </Dialogo>
    </div>
  );
}
