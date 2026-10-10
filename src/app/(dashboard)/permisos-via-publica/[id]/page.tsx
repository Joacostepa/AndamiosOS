"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpediente, useVinculoVenta } from "@/hooks/use-permisos-via-publica";
import { estadoVinculo, motivoDePoliza, sinAltura, direccionCorta } from "@/lib/permisos-via-publica/tipos";
import type { FichaSoloExpediente } from "@/lib/permisos-via-publica/ficha";
import type { AccionConPersona } from "@/lib/permisos-via-publica/lista";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { Dialogo, DatosQueSalen } from "@/components/permisos-via-publica/dialogo";
import { TarjetaEstado } from "@/components/permisos-via-publica/ficha/tarjeta-estado";
import { DatosExpediente, Venta } from "@/components/permisos-via-publica/ficha/datos";
import { Historial } from "@/components/permisos-via-publica/ficha/historial";
import { DialogoDejarDeSeguir } from "@/components/permisos-via-publica/ficha/acciones";
import { DocumentosTramite } from "@/components/permisos-via-publica/documentos-tramite";
import { BOTON } from "@/components/permisos-via-publica/textos";

// Un expediente de TAD. UNA FICHA POR PERMISO (rediseño 09/10): si tiene trámite en la app, esta
// página lleva a la del trámite. Si no (de antes del robot, o presentado a mano sin venta), el
// mismo esqueleto: la tarjeta de estado, los datos del expediente y la venta, y el historial. Lo
// único que decide una persona acá es cuál es la venta, y si un expediente viejo o archivado se
// deja de seguir.

export default function FichaExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error, dataUpdatedAt } = useExpediente(id);
  const router = useRouter();
  const tramiteId = data?.tramiteId;

  useEffect(() => {
    if (tramiteId) router.replace(`/permisos-via-publica/tramites/${tramiteId}`);
  }, [tramiteId, router]);

  if (isLoading || tramiteId) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Volver />
        <EmptyState icon={TriangleAlert} title="No se pudo abrir el expediente" description={error instanceof Error ? error.message : "Probá recargar en un rato."} />
      </div>
    );
  }

  const ahora = dataUpdatedAt;
  const e = data.expediente;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Volver />
      <header className="space-y-1">
        <h1 className="break-words text-2xl font-bold tracking-tight text-balance sm:text-3xl">{direccionCorta(e.direccion) || e.titular || `EX-${e.numero}`}</h1>
        <p className="text-[14px] text-muted-foreground">
          {[`EX-${e.numero}`, e.odoo_venta_nombre, e.cliente, e.historico ? "terminado antes del robot" : "sin trámite en la app"].filter(Boolean).join(" · ")}
        </p>
      </header>

      {data.tramiteDeLaVenta && (
        <Aviso titulo="La venta tiene un trámite en la app">
          Confirmá que este expediente es de la venta para que la ficha sea una sola.{" "}
          <Link href={`/permisos-via-publica/tramites/${data.tramiteDeLaVenta.id}`} className="font-medium underline underline-offset-2">Abrir el trámite de {direccionCorta(data.tramiteDeLaVenta.direccion)}</Link>
        </Aviso>
      )}

      <TarjetaEstado estado={data.estado} acciones={data.acciones} ahora={ahora} boton={(a, principal) => <BotonExpediente accion={a} ficha={data} principal={principal} />} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_34rem] space-y-4">
          {(data.tramite || motivoDePoliza(e.motivo_subsanacion)) && !data.tramiteDeLaVenta && (
            <DocumentosTramite e={e} tramite={data.tramite} documentos={data.documentos} />
          )}
          <VincularVenta ficha={data} />
        </div>
        <aside className="min-w-0 flex-[1_1_18rem] space-y-3">
          <DatosExpediente e={e} caratulaUrl={data.caratulaUrl} permisoUrl={data.permisoUrl} puedeEditar={data.yo.puedeEditar} ahora={ahora} />
          <Venta venta={data.venta} ventaError={data.ventaError} nombre={e.odoo_venta_nombre} vendedora={null} />
        </aside>
      </div>

      <Historial eventos={data.eventos} ahora={ahora} />
    </div>
  );
}

function Volver() {
  return (
    <Link href="/permisos-via-publica" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <ArrowLeft aria-hidden className="size-4" /> Permisos de andamio
    </Link>
  );
}

function BotonExpediente({ accion, ficha, principal }: { accion: AccionConPersona; ficha: FichaSoloExpediente; principal: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const vinculo = useVinculoVenta(ficha.expediente.id);
  const e = ficha.expediente;
  if (accion.clave === "subsanar") {
    return <p className="text-[13px] text-muted-foreground">Sin trámite en la app: se corrige a mano en la tarea de TAD.</p>;
  }
  return (
    <>
      <Button size="sm" variant={principal ? "default" : "outline"} disabled={!ficha.yo.puedeEditar} onClick={() => setAbierto(true)} className="max-sm:h-10">
        {BOTON[accion.clave]}…
      </Button>
      {abierto && (accion.clave === "ver_archivado" || accion.clave === "decidir_expediente") && (
        <DialogoDejarDeSeguir expedienteId={e.id} archivado={accion.clave === "ver_archivado"} onCerrar={() => setAbierto(false)} />
      )}
      {accion.clave === "confirmar_venta" && (
        <Dialogo
          open={abierto}
          onOpenChange={setAbierto}
          etiqueta={{ texto: "Escribe en Odoo", tono: "marcha" }}
          titulo={`¿EX-${e.numero} es de la venta ${ficha.venta?.nombre ?? e.odoo_venta_nombre ?? ""}?`}
          texto="El robot la encontró por la dirección. Al confirmar, escribe el trámite en la venta de Odoo y, si la venta tiene un trámite en la app, lo ata a este expediente."
          confirmar="Sí, es esta venta"
          cargando={vinculo.isPending}
          onConfirmar={() => vinculo.mutate({ accion: "confirmar" }, { onSuccess: () => { toast.success("Venta confirmada: el robot actualiza Odoo en unos segundos"); setAbierto(false); }, onError: (x) => toast.error(x instanceof Error ? x.message : "No se pudo") })}
        >
          <DatosQueSalen filas={[
            { etiqueta: "Obra en TAD (carátula)", valor: e.direccion ?? "—" },
            { etiqueta: "Obra en Odoo", valor: ficha.venta?.direccion ?? "—" },
            { etiqueta: "Cliente de la venta", valor: ficha.venta?.cliente ?? e.cliente ?? "—" },
          ]} />
        </Dialogo>
      )}
    </>
  );
}

/** Elegir la venta a mano: carátula sin altura, o la propuesta era otra venta. */
function VincularVenta({ ficha }: { ficha: FichaSoloExpediente }) {
  const e = ficha.expediente;
  const vinculo = useVinculoVenta(e.id);
  const [numero, setNumero] = useState("");
  const estado = estadoVinculo(e);
  if (estado === "confirmado" || e.historico || !ficha.yo.puedeEditar) return null;
  return (
    <section className="space-y-2 rounded-md border bg-card p-3 text-[13px]">
      <h2 className="text-[14px] font-semibold">{estado === "propuesto" ? "¿Es otra venta?" : "Vincular la venta"}</h2>
      {estado === "sin_vincular" && (
        <p className="text-muted-foreground">
          {sinAltura(e.direccion) ? "La carátula no trae altura (en TAD se escribió la calle sin elegirla del buscador), así que no se puede buscar la venta sola." : "No hay en Odoo una venta confirmada con esta dirección anterior a la presentación."}
        </p>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (numero.trim()) vinculo.mutate({ accion: "vincular", venta: numero.trim() }, { onSuccess: () => { toast.success("Venta vinculada: el robot la actualiza en unos segundos"); setNumero(""); }, onError: (x) => toast.error(x instanceof Error ? x.message : "No se pudo") });
        }}
      >
        <label className="sr-only" htmlFor="venta-manual">Número de venta</label>
        <Input id="venta-manual" value={numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="S02419" className="h-9 w-32" />
        <Button type="submit" size="sm" variant="outline" disabled={vinculo.isPending || !numero.trim()}>
          {vinculo.isPending && <Loader2 className="size-4 animate-spin" />} Vincular
        </Button>
      </form>
    </section>
  );
}
