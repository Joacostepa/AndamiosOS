"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, FileSignature, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEncomienda, useSubirCertificado, type AccionEncomienda } from "@/hooks/use-permisos-via-publica";
import { formatoCuit, type EncomiendaFicha } from "@/lib/permisos-via-publica/tipos";

// Encomienda del CPAU en la ficha del trámite. El robot de la Mac la completa y frena en
// Confirmar; acá una persona revisa el resumen y toca "Finalizar en el CPAU". Firma, pago y
// carga en tramites.cpau.org todavía se hacen a mano.

/**
 * "Subir certificado del CPAU": la encomienda final (el CPAU la publica 30-40 min después de
 * cargarla) y la certificación (aparece apenas se carga todo), que se bajan a mano. El servidor
 * las une en un solo PDF, primero la encomienda. Con eso el documento queda listo y, si está todo,
 * se pide la presentación en TAD (o se avisa, en modo supervisado).
 */
function SubirCertificado({ tramiteId }: { tramiteId: string }) {
  const subir = useSubirCertificado(tramiteId);
  const [encomienda, setEncomienda] = useState<File | null>(null);
  const [certificacion, setCertificacion] = useState<File | null>(null);
  const [vuelta, setVuelta] = useState(0); // para vaciar los inputs después de subir

  const elegir = (set: (f: File | null) => void) => (ev: React.ChangeEvent<HTMLInputElement>) => set(ev.target.files?.[0] ?? null);
  const clase = "max-w-full text-[12px] file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1";

  return (
    <div className="space-y-1.5 border-t pt-2 text-[12px]">
      <p className="text-muted-foreground">
        Certificado visado del CPAU: la encomienda final (aparece 30–40 min después de cargarla) y la certificación. Se unen en un solo PDF.
      </p>
      <div key={vuelta} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-2">
          <span>1. Encomienda</span>
          <input type="file" accept="application/pdf,.pdf" disabled={subir.isPending} className={clase} onChange={elegir(setEncomienda)} />
        </label>
        <label className="flex items-center gap-2">
          <span>2. Certificación</span>
          <input type="file" accept="application/pdf,.pdf" disabled={subir.isPending} className={clase} onChange={elegir(setCertificacion)} />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!encomienda || subir.isPending}
          onClick={() => {
            if (!encomienda) return;
            if (!certificacion && !window.confirm("Falta la certificación. ¿Subir sólo la encomienda?")) return;
            subir.mutate(certificacion ? [encomienda, certificacion] : [encomienda], {
              onSuccess: (r) => {
                if (r.estado === "ok") toast.success("Certificado del CPAU cargado");
                else toast.warning(`Certificado cargado pero observado: ${r.observacion}`);
                setEncomienda(null);
                setCertificacion(null);
                setVuelta((v) => v + 1);
              },
              onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo subir"),
            });
          }}
        >
          {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />} Subir
        </Button>
      </div>
    </div>
  );
}

export function EncomiendaCpau({ tramiteId, encomienda: e, esPrueba }: { tramiteId: string; encomienda: EncomiendaFicha | null; esPrueba: boolean }) {
  const accion = useEncomienda(tramiteId);

  function lanzar(a: AccionEncomienda, ok: string) {
    accion.mutate(a, {
      onSuccess: (r) => toast.success(r.resultado === "ya_pedida" ? "Ya había una encomienda en curso" : ok),
      onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo"),
    });
  }

  const pedirBoton = (texto: string) => (
    <Button size="sm" variant="outline" disabled={accion.isPending} onClick={() => lanzar("pedir", "Encomienda pedida: el robot la toma en unos segundos")}>
      {accion.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {texto}
    </Button>
  );

  const p = e?.payload;
  const trabajando = e && ["pendiente", "tomada"].includes(e.estado);

  return (
    <section className="space-y-2 rounded-md border p-3 text-[13px]">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <FileSignature className="size-4" /> Encomienda del CPAU
      </h3>

      {!e && (
        <>
          <p className="text-muted-foreground">
            Se pide sola cuando el legajo del cliente queda completo y se generan el informe técnico y el croquis. El robot la
            completa en el CPAU y frena antes de Finalizar.
          </p>
          {pedirBoton("Armar la encomienda ahora")}
        </>
      )}

      {p && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          <dt className="text-muted-foreground">Propietario</dt>
          <dd>{p.propietario.nombre} · CUIT {formatoCuit(p.propietario.cuit)}</dd>
          <dt className="text-muted-foreground">Frente</dt>
          <dd>{e?.resultado?.calle_cpau ?? p.frente.calle} {p.frente.desde} a {p.frente.hasta}</dd>
          <dt className="text-muted-foreground">Superficie</dt>
          <dd>{p.superficie} m²</dd>
          <dt className="text-muted-foreground">Descripción</dt>
          <dd>{p.descripcion}</dd>
        </dl>
      )}

      {trabajando && (
        <p className="flex items-center gap-1.5 text-blue-300">
          <Loader2 className="size-4 animate-spin" />
          {e.payload.finalizar ? "El robot está finalizando la encomienda en el CPAU…" : "El robot la está completando en el CPAU (un par de minutos; la Mac tiene que estar prendida)…"}
        </p>
      )}

      {e?.estado === "esperando_aprobacion" && (
        <div className="space-y-2">
          <p className="text-yellow-300">
            {esPrueba
              ? "Prueba: el robot llegó hasta Confirmar. En una prueba nunca se finaliza."
              : "El robot completó todo y frenó en Confirmar. Revisá el resumen del CPAU: al finalizar queda registrada a nombre de Hougassian."}
          </p>
          {e.resultado?.resumen && (
            <details className="rounded border bg-muted/30 p-2">
              <summary className="cursor-pointer text-[12px]">Resumen que muestra el CPAU</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[11px]">{e.resultado.resumen}</pre>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {!esPrueba && (
              <Button
                size="sm"
                disabled={accion.isPending}
                onClick={() => {
                  if (window.confirm(`¿Finalizar la encomienda de ${p?.direccion} en el CPAU? No se puede deshacer.`)) {
                    lanzar("finalizar", "Aprobada: el robot la finaliza en unos segundos");
                  }
                }}
              >
                {accion.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Finalizar en el CPAU
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={accion.isPending} onClick={() => lanzar("descartar", "Encomienda descartada")}>
              <X className="size-4" /> Descartar
            </Button>
          </div>
        </div>
      )}

      {e?.estado === "ok" && (
        <p className="text-green-300">
          Finalizada en el CPAU{e.resultado?.registro ? ` (R.Nro ${e.resultado.registro})` : ""}. Falta firmar, pagar con tarjeta y cargarla en
          tramites.cpau.org: por ahora a mano. Mirá en las capturas qué apareció después de Finalizar.
        </p>
      )}

      {e?.estado === "error" && (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {e.resultado?.finalizado && <strong>Falló después de tocar Finalizar: revisá el Histórico del CPAU antes de volver a pedirla. </strong>}
              {e.error}
            </span>
          </p>
          {pedirBoton("Volver a armarla")}
        </div>
      )}

      <SubirCertificado tramiteId={tramiteId} />

      {e && e.capturas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12px] text-muted-foreground">Capturas del robot ({e.capturas.length})</summary>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {e.capturas.map((c, i) =>
              c.url ? (
                <li key={i}>
                  <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] hover:underline">
                    {c.nombre} <ExternalLink className="size-3" />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </details>
      )}
    </section>
  );
}
