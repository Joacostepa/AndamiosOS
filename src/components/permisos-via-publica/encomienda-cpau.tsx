"use client";

import { CheckCircle2, ExternalLink, FileSignature, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEncomienda, type AccionEncomienda } from "@/hooks/use-permisos-via-publica";
import { formatoCuit, type EncomiendaFicha } from "@/lib/permisos-via-publica/tipos";

// Encomienda del CPAU en la ficha del trámite. El robot de la Mac la completa y frena en
// Confirmar; acá una persona revisa el resumen y toca "Finalizar en el CPAU". Firma, pago y
// carga en tramites.cpau.org todavía se hacen a mano.

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
