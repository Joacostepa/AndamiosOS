"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, ExternalLink, Landmark, Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePresentacion } from "@/hooks/use-permisos-via-publica";
import type { PresentacionFicha } from "@/lib/permisos-via-publica/tipos";

// Presentación en TAD en la ficha del trámite. Es automática: se pide sola cuando está todo y
// el robot adjunta y confirma. Acá se ve qué falta, qué hizo el robot y, si se frenó, por qué.

export function PresentacionTad({
  tramiteId,
  presentacion: { estado, tarea, borradorPendiente, confirmadoAntes },
  esPrueba,
  expedienteId,
}: {
  tramiteId: string;
  presentacion: PresentacionFicha;
  esPrueba: boolean;
  expedienteId: string | null;
}) {
  const pedir = usePresentacion(tramiteId);
  const trabajando = tarea && ["pendiente", "tomada"].includes(tarea.estado);
  const r = tarea?.resultado;

  function lanzar(aviso?: string) {
    if (aviso && !window.confirm(aviso)) return;
    pedir.mutate(undefined, {
      onSuccess: (x) => toast.success(x.resultado === "ya_pedida" ? "Ya hay una presentación en curso" : esPrueba ? "Prueba pedida: el robot la toma en unos segundos" : "Presentación pedida"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo pedir"),
    });
  }

  return (
    <section className="space-y-2 rounded-md border p-3 text-[13px]">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <Landmark className="size-4" /> Presentación en TAD
      </h3>

      {!tarea && (
        <p className="text-muted-foreground">
          {esPrueba
            ? "Prueba: el robot llena y guarda el formulario de TAD con esta obra (o Trelles 1086 si la dirección no existe), verifica la parcela y borra el borrador. No adjunta ni presenta."
            : "Se presenta sola apenas están todos los documentos: el robot llena el formulario, adjunta cada casillero y confirma. Ante cualquier cosa que no coincida, se frena y avisa."}
        </p>
      )}

      {!esPrueba && !expedienteId && (
        <ul className="space-y-0.5 text-[12px]">
          {estado.casilleros.map((c) => (
            <li key={c.casillero} className="flex items-start gap-1.5">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-400" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
              <span>
                {c.casillero}… <span className="text-muted-foreground">({c.documentos.map((d) => d.nombre).join(" + ")})</span>
              </span>
            </li>
          ))}
          {estado.faltan.length > 0 && <li className="pt-1 text-orange-400">{estado.faltan.join(" ")}</li>}
        </ul>
      )}

      {trabajando && (
        <p className="flex items-center gap-1.5 text-blue-300">
          <Loader2 className="size-4 animate-spin" />
          {esPrueba ? "El robot está probando el formulario en TAD…" : "El robot está presentando en TAD (varios minutos; la Mac tiene que estar prendida)…"}
        </p>
      )}

      {tarea?.estado === "ok" && r?.etapa === "presentado" && (
        <p className="text-green-300">
          Presentado: <strong>{r.expediente}</strong>
          {expedienteId && (
            <Link href={`/permisos-via-publica/${expedienteId}`} className="ml-2 inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline">
              Ver expediente <ExternalLink className="size-3" />
            </Link>
          )}
        </p>
      )}

      {tarea?.estado === "ok" && r?.etapa === "prueba" && (
        <p className="text-green-300">
          Prueba OK: formulario guardado en TAD con {r.obra?.calle} → {r.obra?.barrio}, {r.obra?.comuna}, parcela {r.obra?.smp}.{" "}
          {r.borrador_borrado ? "El borrador se borró." : `No se pudo borrar el borrador ${r.borrador}: borrarlo a mano.`}
        </p>
      )}

      {tarea?.estado === "error" && (
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {r?.confirmado && <strong>Se tocó «Confirmar trámite»: revisá en TAD si salió el expediente. </strong>}
              {!r?.confirmado && !!r?.adjuntados && <strong>Quedaron {r.adjuntados} adjuntos en el borrador {r.borrador} (cada uno es un IF oficial). </strong>}
              {tarea.error}
            </span>
          </p>
        </div>
      )}

      {/* Si ya se tocó "Confirmar trámite" no se ofrece presentar de nuevo: primero hay que mirar TAD. */}
      {!esPrueba && confirmadoAntes && !expedienteId && (
        <p className="text-[12px] text-orange-400">Una presentación anterior tocó «Confirmar trámite»: revisá en TAD si salió el expediente antes de volver a presentar.</p>
      )}
      {!trabajando && !expedienteId && !(confirmadoAntes && !esPrueba) && (esPrueba || estado.listo || tarea?.estado === "error") && (
        <Button
          size="sm"
          variant="outline"
          disabled={pedir.isPending}
          onClick={() =>
            lanzar(
              esPrueba
                ? undefined
                : borradorPendiente
                  ? `El robot sigue desde el borrador ${borradorPendiente} de TAD: no rehace lo que ya está (formulario ni adjuntos con IF), adjunta lo que falta y confirma. ¿Seguro?`
                  : "El robot va a presentar el trámite en TAD con estos documentos. ¿Seguro?",
            )
          }
        >
          {pedir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {esPrueba ? "Probar en TAD (sin presentar)" : borradorPendiente ? "Seguir desde el borrador" : tarea?.estado === "error" ? "Volver a presentar" : "Presentar ahora"}
        </Button>
      )}

      {tarea && tarea.capturas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12px] text-muted-foreground">Capturas del robot ({tarea.capturas.length})</summary>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {tarea.capturas.map((c, i) =>
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
