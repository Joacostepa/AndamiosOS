"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, CircleAlert, CircleMinus, Copy, ExternalLink, FlaskConical, Loader2, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBorrarTramite, useReenviarLink, useTramite } from "@/hooks/use-permisos-via-publica";
import { GenerarDocumentos } from "@/components/permisos-via-publica/generar-documentos";
import { EncomiendaCpau } from "@/components/permisos-via-publica/encomienda-cpau";
import { PresentacionTad } from "@/components/permisos-via-publica/presentacion-tad";
import {
  ETIQUETA_DUENO, ETIQUETA_ESTADO_DOCUMENTO, NOMBRE_DOCUMENTO, formatoCuit,
  type Documento, type EstadoDocumento,
} from "@/lib/permisos-via-publica/tipos";

// Ficha de un trámite nuevo, abierto desde la venta: el link del portal del cliente (para
// copiar y mandar por WhatsApp), lo que cargó el cliente y la póliza. Cuando se presente en
// TAD pasa a tener expediente y la ficha es la del expediente.

const COLOR: Record<EstadoDocumento, string> = {
  falta: "bg-muted text-muted-foreground",
  pedido: "bg-yellow-500/15 text-yellow-300",
  cargado: "bg-blue-500/15 text-blue-300",
  revisando: "bg-blue-500/15 text-blue-300",
  ok: "bg-green-500/15 text-green-300",
  observado: "bg-red-500/15 text-red-300",
};

const cuando = (iso: string) => format(parseISO(iso), "d/M/yyyy HH:mm", { locale: es });

export default function FichaTramitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useTramite(id);
  const reenviar = useReenviarLink(id);
  const borrar = useBorrarTramite(id);
  const router = useRouter();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return <EmptyState icon={TriangleAlert} title="No se pudo abrir el trámite" description={error instanceof Error ? error.message : undefined} />;
  }

  const { tramite: t, documentos, eventos, linkCliente, linkProductorPrueba } = data;
  const legajo = documentos.filter((d) => d.origen === "cliente");
  const propios = documentos.filter((d) => d.origen !== "cliente");

  return (
    <div className="space-y-5">
      <Link href="/permisos-via-publica" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Permisos de andamio
      </Link>
      <PageHeader title={t.direccion} description={`Trámite nuevo · ${t.odoo_venta_nombre ?? "sin venta"}`} />

      {t.es_prueba && (
        <section className="space-y-2 rounded-md border border-purple-500/30 bg-purple-500/10 p-3 text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-purple-300">
            <FlaskConical className="size-4" /> Trámite de prueba
          </p>
          <p className="text-muted-foreground">
            Todos los mails llegan a tu casilla: el link &quot;del cliente&quot; y el pedido de endoso. No se le escribe a ningún
            cliente ni a Segucom, y no salen avisos a Slack.
          </p>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            <li>Abrí el link del cliente (abajo) y cargá un dueño con un CUIT válido, por ejemplo 30-71546290-3.</li>
            <li>Te llega el mail &quot;[PRUEBA] Endosos para pedir&quot;. Abrí la página de Segucom de prueba y subí una póliza.</li>
            <li>A los segundos ves la revisión en esa página y acá.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            {linkProductorPrueba && (
              <a href={linkProductorPrueba} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline">
                Página de Segucom (prueba) <ExternalLink className="size-3" />
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={borrar.isPending}
              onClick={() =>
                borrar.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Prueba borrada");
                    router.push("/permisos-via-publica");
                  },
                  onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo borrar"),
                })
              }
            >
              {borrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Borrar la prueba
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-md border p-3 text-[13px]">
        <h3 className="font-semibold">Portal del cliente</h3>
        <p className="text-muted-foreground">
          {t.cliente_nombre ?? "Cliente sin nombre"} · {t.cliente_email ?? "sin mail en Odoo"}
          {t.link_enviado_at && <> · link enviado el {cuando(t.link_enviado_at)}</>}
        </p>
        {t.link_error && <p className="text-orange-400">{t.link_error}</p>}
        {linkCliente && (
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={linkCliente} className="h-8 min-w-0 flex-1 font-mono text-[12px]" onFocus={(ev) => ev.target.select()} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(linkCliente).then(() => toast.success("Link copiado: pegalo en WhatsApp"))}
            >
              <Copy className="size-4" /> Copiar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reenviar.isPending}
              onClick={() =>
                reenviar.mutate(undefined, {
                  onSuccess: (r) => (r.ok ? toast.success("Link reenviado por mail") : toast.error("No se pudo mandar: mirá el motivo en la ficha")),
                  onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo reenviar"),
                })
              }
            >
              {reenviar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Reenviar por mail
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-md border p-3 text-[13px]">
        <h3 className="font-semibold">Dueño del lote</h3>
        {t.titular_cargado_at ? (
          <p>
            {t.titular_nombre} · CUIT {formatoCuit(t.titular_cuit ?? "")} · {t.tipo_dueno ? ETIQUETA_DUENO[t.tipo_dueno] : ""}
            {t.es_inquilino ? " · quien contrata alquila" : ""}
            <span className="block text-[12px] text-muted-foreground">Cargado por el cliente el {cuando(t.titular_cargado_at)}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">El cliente todavía no lo cargó.</p>
        )}
      </section>

      <ListaDocumentos titulo={`Legajo del cliente · ${legajo.filter((d) => d.estado !== "falta").length} de ${legajo.length}`} documentos={legajo} />
      <GenerarDocumentos tramiteId={t.id} conVenta={!!t.odoo_venta_id} />
      <EncomiendaCpau tramiteId={t.id} encomienda={data.encomienda} esPrueba={t.es_prueba} />
      <PresentacionTad tramiteId={t.id} presentacion={data.presentacion} esPrueba={t.es_prueba} expedienteId={t.expediente_id} />
      {propios.length > 0 && <ListaDocumentos titulo="Documentos de ABA y del seguro" documentos={propios} />}

      <section className="rounded-md border">
        <header className="border-b px-3 py-2">
          <h3 className="text-[13px] font-semibold">Historial</h3>
        </header>
        <ul className="max-h-[24rem] overflow-y-auto">
          {eventos.map((ev) => (
            <li key={ev.id} className="border-b px-3 py-2 text-[13px] last:border-b-0">
              <span className="text-[12px] text-muted-foreground">{cuando(ev.created_at)}</span>
              {ev.detalle && <p className="text-muted-foreground">{ev.detalle}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ListaDocumentos({ titulo, documentos }: { titulo: string; documentos: (Documento & { url: string | null })[] }) {
  return (
    <section className="rounded-md border text-[13px]">
      <header className="border-b px-3 py-2">
        <h3 className="font-semibold">{titulo}</h3>
      </header>
      {documentos.length === 0 && <p className="px-3 py-3 text-[12px] text-muted-foreground">Nada todavía.</p>}
      <ul>
        {documentos.map((d) => (
          <li key={d.id} className="space-y-1 border-b px-3 py-2 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{NOMBRE_DOCUMENTO[d.clave] ?? d.clave}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${COLOR[d.estado]}`}>{ETIQUETA_ESTADO_DOCUMENTO[d.estado]}</span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] hover:underline">
                  {d.archivo_nombre ?? "Ver"} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            {d.observacion && <p className={d.estado === "observado" ? "text-red-300" : "text-orange-400"}>{d.observacion}</p>}
            {d.revision?.chequeos.map((c) => (
              <p key={c.clave} className="flex items-start gap-1.5 text-[12px]">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-3.5 text-green-400" /> : c.bloquea ? <CircleAlert className="mt-0.5 size-3.5 text-red-400" /> : <CircleMinus className="mt-0.5 size-3.5 text-muted-foreground" />}
                {c.detalle}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
