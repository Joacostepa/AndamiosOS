"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, FileSignature, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEncomienda, useSubirCertificado, type AccionEncomienda } from "@/hooks/use-permisos-via-publica";
import { formatoCuit, type EncomiendaFicha } from "@/lib/permisos-via-publica/tipos";

// Encomienda del CPAU en la ficha del trámite. Desde el 16/09 el robot de la Mac hace todo sin
// frenar: finaliza, firma, paga, carga en tramites.cpau.org y espera el mail con el certificado.
// Acá se ve en qué etapa va y, si se frenó, por qué. "Subir certificado" queda para cargarlo a mano.

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
            if (!certificacion && !window.confirm("No elegiste la certificación. Si ese PDF ya la trae (las 5 hojas juntas), subilo solo. ¿Seguir?")) return;
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

const ETAPAS: { clave: NonNullable<NonNullable<EncomiendaFicha["resultado"]>["cierre"]>["etapa"]; texto: string }[] = [
  { clave: "finalizada", texto: "Finalizada en el RETP" },
  { clave: "firmada", texto: "Registro firmado" },
  { clave: "pagada", texto: "Pagada ($50.000)" },
  { clave: "cargada", texto: "Cargada en la Plataforma" },
  { clave: "certificado", texto: "Certificado recibido" },
];

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";

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
  const cierre = e?.resultado?.cierre;
  const esperandoMail = e?.estado === "pendiente" && cierre?.etapa === "cargada" && !!e.reintentar_desde;
  const trabajando = e && ["pendiente", "tomada"].includes(e.estado) && !esperandoMail;
  const indice = cierre ? ETAPAS.findIndex((x) => x.clave === cierre.etapa) : -1;

  return (
    <section className="space-y-2 rounded-md border p-3 text-[13px]">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <FileSignature className="size-4" /> Encomienda del CPAU
      </h3>

      {!e && (
        <>
          <p className="text-muted-foreground">
            {esPrueba
              ? "Prueba: el robot la completa en el CPAU hasta Confirmar y nunca la finaliza."
              : "Con el botón, el robot hace todo sin frenar: la carga y finaliza en el RETP, firma el registro (JS y Hougassian), paga $50.000 con la tarjeta, la carga en tramites.cpau.org y espera el mail del CPAU con el certificado."}
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

      {cierre && (
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {ETAPAS.map((x, i) => (
            <li key={x.clave} className={`flex items-center gap-1 ${i <= indice ? "text-green-300" : "text-muted-foreground"}`}>
              {i <= indice ? <CheckCircle2 className="size-3.5" /> : <span className="inline-block size-3.5 rounded-full border" />}
              {x.texto}
            </li>
          ))}
        </ol>
      )}
      {cierre && (
        <p className="text-[12px] text-muted-foreground">
          {e?.resultado?.registro && <>R.Nro {e.resultado.registro}. </>}
          {cierre.pago?.operacion && cierre.pago.aprobado_at && <>Pago: operación {cierre.pago.operacion}. </>}
          {cierre.certificado && <>Certificado: {cierre.certificado.nombre} ({hora(cierre.certificado.recibido_at)}). </>}
        </p>
      )}

      {trabajando && (
        <p className="flex items-center gap-1.5 text-blue-300">
          <Loader2 className="size-4 animate-spin" />
          {cierre
            ? `El robot está siguiendo el cierre (${ETAPAS[Math.min(indice + 1, ETAPAS.length - 1)].texto.toLowerCase()})…`
            : e.payload.finalizar
              ? "El robot la está cargando y finalizando en el CPAU (unos minutos; la Mac tiene que estar prendida)…"
              : "El robot la está completando en el CPAU (un par de minutos; la Mac tiene que estar prendida)…"}
        </p>
      )}

      {esperandoMail && (
        <p className="text-blue-300">
          Cargada en el CPAU. Falta que la vise (30–40 min en horario de oficina) y que Hougassian reenvíe el mail a
          permisos-andamio@: el robot revisa la casilla cada 15 minutos{cierre?.ultima_busqueda_at ? ` (última: ${hora(cierre.ultima_busqueda_at)})` : ""}.
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

      {e?.estado === "ok" && !cierre && (
        <p className="text-green-300">
          Finalizada en el CPAU{e.resultado?.registro ? ` (R.Nro ${e.resultado.registro})` : ""}. Esta es de antes del cierre automático: firma,
          pago y carga se hicieron a mano.
        </p>
      )}
      {e?.estado === "ok" && cierre?.etapa === "certificado" && (
        <p className="text-green-300">Listo: el certificado del CPAU quedó cargado y el trámite se presenta en TAD en el horario de presentación.</p>
      )}

      {e?.estado === "error" && (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-red-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {e.resultado?.finalizado && <strong>Falló después de tocar Finalizar: revisá el Histórico del CPAU antes de volver a pedirla. </strong>}
              {cierre && <strong>El cierre se frenó en «{ETAPAS[indice]?.texto ?? cierre.etapa}». </strong>}
              {e.error}
            </span>
          </p>
          {cierre ? (
            <Button
              size="sm"
              variant="outline"
              disabled={accion.isPending}
              onClick={() => {
                if (window.confirm("El robot sigue el cierre desde donde quedó. Un pago o una carga que ya se intentaron no se repiten: si el error habla de eso, revisá el CPAU primero. ¿Reanudar?")) {
                  lanzar("reanudar", "Reanudado: el robot sigue en unos segundos");
                }
              }}
            >
              {accion.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reanudar el cierre
            </Button>
          ) : (
            pedirBoton("Volver a armarla")
          )}
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
