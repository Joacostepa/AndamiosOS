"use client";

import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, CircleAlert, CircleMinus, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePedirEndoso, useSubirDocumento } from "@/hooks/use-permisos-via-publica";
import {
  ETIQUETA_ESTADO_DOCUMENTO, NOMBRE_DOCUMENTO, cuitValido, formatoCuit, motivoDePoliza,
  type Documento, type EstadoDocumento, type Expediente, type Tramite,
} from "@/lib/permisos-via-publica/tipos";
import { Chip, type TonoChip } from "./ui";
import { Dialogo } from "./dialogo";

// La póliza de un expediente SIN trámite en la app (de antes del robot o presentado a mano): se le
// pide el endoso a Segucom y vuelve por su portal. Los expedientes con trámite usan la ficha del
// trámite. Colores en par claro/oscuro (rediseño 09/10).

const TONO: Record<EstadoDocumento, TonoChip> = { falta: "neutro", pedido: "marcha", cargado: "marcha", revisando: "marcha", ok: "listo", observado: "bloqueo" };

const cuando = (iso: string) => format(parseISO(iso), "d/M HH:mm", { locale: es });

type Props = { e: Expediente; tramite: Tramite | null; documentos: (Documento & { url: string | null })[] };

export function DocumentosTramite({ e, tramite, documentos }: Props) {
  const poliza = documentos.find((d) => d.clave === "poliza_rc");
  const [editando, setEditando] = useState(false);
  const pidePoliza = motivoDePoliza(e.motivo_subsanacion);

  return (
    <section className="space-y-3 rounded-md border bg-card p-3 text-[13px]">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold">Póliza</h2>
        {tramite?.titular_nombre && (
          <span className="text-[12px] text-muted-foreground">
            Dueño del lote: {tramite.titular_nombre} · CUIT {formatoCuit(tramite.titular_cuit ?? "")}
          </span>
        )}
      </header>

      {poliza && !editando ? (
        <FilaDocumento expedienteId={e.id} doc={poliza} tramite={tramite} onCambiarTitular={() => setEditando(true)} />
      ) : (
        <PedirEndoso e={e} tramite={tramite} destacado={pidePoliza} onListo={() => setEditando(false)} />
      )}
    </section>
  );
}

function PedirEndoso({ e, tramite, destacado, onListo }: { e: Expediente; tramite: Tramite | null; destacado: boolean; onListo: () => void }) {
  const pedir = usePedirEndoso(e.id);
  const [nombre, setNombre] = useState(tramite?.titular_nombre ?? "");
  const [cuit, setCuit] = useState(tramite?.titular_cuit ? formatoCuit(tramite.titular_cuit) : "");
  const [hasta, setHasta] = useState(tramite?.permiso_hasta ?? e.pedido_hasta ?? "");
  const cuitOk = cuitValido(cuit);

  return (
    <form
      className={`space-y-2 rounded-md p-2 ${destacado ? "bg-amber-500/10" : ""}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        pedir.mutate(
          { titularNombre: nombre, titularCuit: cuit, permisoHasta: hasta || null },
          {
            onSuccess: () => {
              toast.success("Endoso pedido: el mail a Segucom sale en unos segundos");
              onListo();
            },
            onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo pedir"),
          },
        );
      }}
    >
      <p className="font-medium">Endoso de la póliza</p>
      <p className="text-muted-foreground">
        {destacado
          ? "El Gobierno observó la póliza. Cargá el dueño del lote y se le pide el endoso a Segucom (sale un mail)."
          : "Cargá el dueño del lote (Segucom lo agrega como coasegurado) y se le pide el endoso (sale un mail)."}{" "}
        {e.cliente && <>El cliente de la venta es {e.cliente}, que puede no ser el dueño.</>}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-[12px] text-muted-foreground">Dueño del lote</span>
          <Input value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Consorcio de Propietarios…" className="h-8 w-72" />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted-foreground">CUIT</span>
          <Input value={cuit} onChange={(ev) => setCuit(ev.target.value)} placeholder="30-12345678-9" className="h-8 w-36" />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted-foreground">Permiso hasta</span>
          <Input type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} className="h-8 w-40" />
        </label>
        <Button type="submit" size="sm" disabled={pedir.isPending || nombre.trim().length < 3 || !cuitOk}>
          {pedir.isPending && <Loader2 className="size-4 animate-spin" />} Pedir el endoso a Segucom
        </Button>
      </div>
      {cuit && !cuitOk && <p className="text-[12px] text-red-700 dark:text-red-300">Ese CUIT no es válido: revisá los números.</p>}
    </form>
  );
}

function FilaDocumento({
  expedienteId, doc, tramite, onCambiarTitular,
}: { expedienteId: string; doc: Documento & { url: string | null }; tramite: Tramite | null; onCambiarTitular: () => void }) {
  const subir = useSubirDocumento(expedienteId);
  const repedir = usePedirEndoso(expedienteId);
  const input = useRef<HTMLInputElement>(null);
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{NOMBRE_DOCUMENTO[doc.clave] ?? doc.clave}</span>
        <Chip tono={TONO[doc.estado]}>
          {doc.estado === "revisando" && <Loader2 aria-hidden className="size-3 animate-spin" />}
          {ETIQUETA_ESTADO_DOCUMENTO[doc.estado]}
        </Chip>
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline">
            {doc.archivo_nombre ?? "PDF"} <ExternalLink className="size-3" />
          </a>
        )}
        <div className="ml-auto flex gap-2">
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(ev) => {
              const archivo = ev.target.files?.[0];
              ev.target.value = "";
              if (!archivo) return;
              subir.mutate(
                { documentoId: doc.id, archivo },
                {
                  onSuccess: () => toast.success("PDF subido: se está revisando"),
                  onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo subir"),
                },
              );
            }}
          />
          <Button size="sm" variant="outline" disabled={subir.isPending} onClick={() => input.current?.click()}>
            {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir PDF
          </Button>
          {tramite?.titular_cuit && doc.estado !== "pedido" && (
            <Button size="sm" variant="outline" disabled={repedir.isPending} onClick={() => setConfirmar(true)}>
              Volver a pedir…
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCambiarTitular}>Cambiar dueño del lote</Button>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        {doc.pedido_at && <>Pedido el {cuando(doc.pedido_at)}. </>}
        {doc.aviso_enviado_at && <>Aviso a Segucom el {cuando(doc.aviso_enviado_at)}. </>}
        {doc.recordatorio_at && <>Recordatorio el {cuando(doc.recordatorio_at)}. </>}
        {doc.subido_at && <>Subido por {doc.subido_por === "productor" ? "Segucom" : "la oficina"} el {cuando(doc.subido_at)}. </>}
        {doc.estado === "pedido" && !doc.aviso_enviado_at && !doc.aviso_error && "El aviso a Segucom sale en unos segundos."}
      </p>
      {doc.aviso_error && <p className="text-[12px] text-amber-800 dark:text-amber-300">No se pudo mandar el aviso a Segucom: {doc.aviso_error}</p>}
      {doc.observacion && <p className={doc.estado === "observado" ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-300"}>{doc.observacion}</p>}
      {tramite && (
        <Dialogo
          open={confirmar}
          onOpenChange={setConfirmar}
          etiqueta={{ texto: "Sale un mail afuera", tono: "marcha" }}
          titulo="¿Pedirle el endoso a Segucom otra vez?"
          texto={`${doc.pedido_at ? `Ya se pidió el ${cuando(doc.pedido_at)}. ` : ""}Le llega un mail nuevo con el mismo dueño del lote: ${tramite.titular_nombre}.`}
          confirmar="Pedir otra vez"
          cargando={repedir.isPending}
          onConfirmar={() =>
            repedir.mutate(
              { titularNombre: tramite.titular_nombre ?? "", titularCuit: tramite.titular_cuit ?? "", permisoHasta: tramite.permiso_hasta },
              { onSuccess: () => { toast.success("Endoso pedido otra vez"); setConfirmar(false); }, onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo pedir") },
            )
          }
        />
      )}

      {doc.revision && doc.revision.chequeos.length > 0 && (
        <ul className="space-y-0.5">
          {doc.revision.chequeos.map((c) => (
            <li key={c.clave} className="flex items-start gap-1.5 text-[12px]">
              {c.ok ? (
                <CheckCircle2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              ) : c.bloquea ? (
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-red-700 dark:text-red-300" />
              ) : (
                <CircleMinus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={c.ok || c.bloquea ? "" : "text-muted-foreground"}>{c.detalle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
