"use client";

import { useState } from "react";
import { ExternalLink, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEncomienda, useSubirCertificado } from "@/hooks/use-permisos-via-publica";
import { cuandoFue, horaCorta } from "@/lib/permisos-via-publica/estado";
import type { Captura, FichaPermiso, IntentoTad } from "@/lib/permisos-via-publica/ficha";
import { formatoCuit, type EncomiendaFicha } from "@/lib/permisos-via-publica/tipos";
import { Chip, Seccion } from "../ui";
import { Dialogo } from "../dialogo";
import { GenerarDocumentos } from "../generar-documentos";

// Lo que hizo el robot (rediseño 09/10): la encomienda del CPAU paso a paso y TODOS los intentos de
// presentación en TAD, con el borrador y los documentos oficiales que dejó cada uno. Aparece sólo si
// el robot tiene algo que contar. Los botones de lo que hay que hacer están en la tarjeta de estado.

type Etapa = NonNullable<NonNullable<EncomiendaFicha["resultado"]>["cierre"]>["etapa"];
const PASOS: { clave: Etapa; texto: string }[] = [
  { clave: "finalizada", texto: "Finalizada" },
  { clave: "firmada", texto: "Firmada" },
  { clave: "pagada", texto: "Pagada" },
  { clave: "cargada", texto: "Enviada al CPAU" },
  { clave: "certificado", texto: "Certificado recibido" },
];

export function Robot({ ficha, ahora }: { ficha: FichaPermiso; ahora: number }) {
  const e = ficha.encomienda;
  const sinInforme = ficha.tramite.es_prueba && !ficha.tramite.odoo_venta_id && !ficha.documentos.some((d) => d.clave === "informe_tecnico" && d.estado === "ok");
  if (!e && ficha.intentos.length === 0 && !sinInforme) return null;
  return (
    <div id="robot" className="scroll-mt-4 space-y-4">
      {sinInforme && <GenerarDocumentos tramiteId={ficha.tramite.id} conVenta={false} />}
      {e && <Encomienda ficha={ficha} e={e} ahora={ahora} />}
      {ficha.intentos.length > 0 && <Intentos intentos={ficha.intentos} ahora={ahora} />}
    </div>
  );
}

function Encomienda({ ficha, e, ahora }: { ficha: FichaPermiso; e: EncomiendaFicha; ahora: number }) {
  const cierre = e.resultado?.cierre;
  const indice = cierre ? PASOS.findIndex((p) => p.clave === cierre.etapa) : e.estado === "ok" ? PASOS.length - 1 : -1;
  const p = e.payload;
  // Subir el certificado a mano: mientras se espera el mail o si el cierre se frenó después de enviarla.
  const subirAMano = (e.estado === "pendiente" && cierre?.etapa === "cargada") || (e.estado === "error" && cierre?.etapa === "cargada");
  return (
    <Seccion titulo="Encomienda del CPAU" accion={<Capturas capturas={e.capturas} />}>
      <div className="space-y-3 p-3 text-[13px]">
        <ol className="flex flex-wrap gap-1.5" aria-label="Pasos de la encomienda">
          {PASOS.map((x, i) => (
            <li key={x.clave}><Chip tono={i <= indice ? "listo" : "neutro"} sinIcono={i > indice}>{x.texto}</Chip></li>
          ))}
        </ol>
        {(e.resultado?.registro || cierre?.pago?.operacion || cierre?.certificado) && (
          <p className="text-[12px] text-muted-foreground">
            {[e.resultado?.registro && `N.º de registro ${e.resultado.registro}`, cierre?.pago?.aprobado_at && cierre.pago.operacion && `operación ${cierre.pago.operacion}`, cierre?.certificado && `certificado ${cierre.certificado.nombre} (${cuandoFue(cierre.certificado.recibido_at, ahora)})`].filter(Boolean).join(" · ")}
          </p>
        )}
        {e.estado === "pendiente" && cierre?.etapa === "cargada" && (
          <p className="text-foreground/80">Falta el visado (30–40 min en horario de oficina) y que Hougassian reenvíe el certificado. El robot revisa el mail cada 15 min{cierre.ultima_busqueda_at ? ` (última: ${horaCorta(cierre.ultima_busqueda_at)})` : ""}.</p>
        )}
        {e.error && e.estado === "error" && <p className="text-red-800 dark:text-red-200">{e.error}</p>}
        {p && (
          <details className="text-[12px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Lo que se cargó en el CPAU</summary>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt>Propietario</dt><dd>{p.propietario.nombre} · CUIT {formatoCuit(p.propietario.cuit)}</dd>
              <dt>Frente</dt><dd>{e.resultado?.calle_cpau ?? p.frente.calle} {p.frente.desde} a {p.frente.hasta}</dd>
              <dt>Superficie</dt><dd>{p.superficie} m²</dd>
              <dt>Descripción</dt><dd>{p.descripcion}</dd>
            </dl>
          </details>
        )}
        {e.estado === "esperando_aprobacion" && <FrenoViejo ficha={ficha} e={e} />}
        {subirAMano && ficha.yo.puedeEditar && <SubirCertificado tramiteId={ficha.tramite.id} />}
      </div>
    </Seccion>
  );
}

/** Tareas de antes del 16/09 que frenaban en Confirmar: Finalizar (nivel 3) o descartar. */
function FrenoViejo({ ficha, e }: { ficha: FichaPermiso; e: EncomiendaFicha }) {
  const accion = useEncomienda(ficha.tramite.id);
  const [que, setQue] = useState<"finalizar" | "descartar" | null>(null);
  const puede = ficha.tramite.es_prueba || ficha.yo.puedeIrreversible;
  return (
    <div className="space-y-2">
      <p className="text-amber-800 dark:text-amber-300">
        {ficha.tramite.es_prueba ? "Prueba: el robot llegó hasta Confirmar. En una prueba nunca se finaliza." : "El robot completó todo y frenó en Confirmar (tarea de antes del 16/09)."}
      </p>
      {e.resultado?.resumen && (
        <details className="rounded-md bg-muted p-2">
          <summary className="cursor-pointer text-[12px]">Resumen que muestra el CPAU</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[11px]">{e.resultado.resumen}</pre>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {!ficha.tramite.es_prueba && <Button size="sm" variant="outline" disabled={!puede} onClick={() => setQue("finalizar")}>Finalizar en el CPAU…</Button>}
        <Button size="sm" variant="ghost" disabled={!ficha.yo.puedeEditar} onClick={() => setQue("descartar")}>Descartar…</Button>
      </div>
      <Dialogo
        open={que === "finalizar"}
        onOpenChange={(o) => !o && setQue(null)}
        peligroso
        etiqueta={{ texto: "No se deshace", tono: "bloqueo" }}
        titulo={`¿Finalizar la encomienda de ${ficha.tramite.direccion}?`}
        texto="Queda registrada en el CPAU a nombre de Hougassian. No se puede deshacer."
        confirmar="Finalizar en el CPAU"
        cargando={accion.isPending}
        onConfirmar={() => accion.mutate("finalizar", { onSuccess: () => { toast.success("Aprobada: el robot la finaliza en unos segundos"); setQue(null); }, onError: (x) => toast.error(x instanceof Error ? x.message : "No se pudo") })}
      />
      <Dialogo
        open={que === "descartar"}
        onOpenChange={(o) => !o && setQue(null)}
        titulo="¿Descartar esta encomienda?"
        texto="La app deja de seguirla. Si hace falta otra, la armás de nuevo."
        confirmar="Descartar"
        cargando={accion.isPending}
        onConfirmar={() => accion.mutate("descartar", { onSuccess: () => { toast.success("Encomienda descartada"); setQue(null); }, onError: (x) => toast.error(x instanceof Error ? x.message : "No se pudo") })}
      />
    </div>
  );
}

/**
 * Subir el certificado del CPAU a mano: la encomienda final (aparece 30–40 min después de enviarla)
 * y la certificación. El servidor las une en un PDF; con eso el documento queda listo.
 */
function SubirCertificado({ tramiteId }: { tramiteId: string }) {
  const subir = useSubirCertificado(tramiteId);
  const [encomienda, setEncomienda] = useState<File | null>(null);
  const [certificacion, setCertificacion] = useState<File | null>(null);
  const [soloUno, setSoloUno] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const elegir = (set: (f: File | null) => void) => (ev: React.ChangeEvent<HTMLInputElement>) => set(ev.target.files?.[0] ?? null);
  const clase = "max-w-full text-[12px] file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1";
  function mandar() {
    if (!encomienda) return;
    subir.mutate(certificacion ? [encomienda, certificacion] : [encomienda], {
      onSuccess: (r) => {
        if (r.estado === "ok") toast.success("Certificado del CPAU cargado");
        else toast.warning(`Certificado cargado pero a corregir: ${r.observacion}`);
        setEncomienda(null);
        setCertificacion(null);
        setSoloUno(false);
        setVuelta((v) => v + 1);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo subir"),
    });
  }
  return (
    <div className="space-y-1.5 border-t pt-3 text-[12px]">
      <p className="font-medium text-[13px]">Subir el certificado a mano</p>
      <p className="text-muted-foreground">Si el mail no llega: la encomienda final y la certificación. Se unen en un solo PDF.</p>
      <div key={vuelta} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-2"><span>1. Encomienda</span><input type="file" accept="application/pdf,.pdf" disabled={subir.isPending} className={clase} onChange={elegir(setEncomienda)} /></label>
        <label className="flex items-center gap-2"><span>2. Certificación</span><input type="file" accept="application/pdf,.pdf" disabled={subir.isPending} className={clase} onChange={elegir(setCertificacion)} /></label>
        <Button size="sm" variant="outline" disabled={!encomienda || subir.isPending} onClick={() => (certificacion ? mandar() : setSoloUno(true))}>
          {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />} Subir certificado
        </Button>
      </div>
      <Dialogo
        open={soloUno}
        onOpenChange={setSoloUno}
        titulo="¿Subir sólo este PDF?"
        texto="Está bien si ya trae la certificación (las 5 hojas juntas)."
        cancelar="Elegir la certificación"
        confirmar="Subir sólo este"
        cargando={subir.isPending}
        onConfirmar={mandar}
      />
    </div>
  );
}

const RESULTADO = (x: IntentoTad): string => {
  const r = x.resultado ?? {};
  if (x.estado === "ok" && r.etapa === "presentado") return `Presentado · ${r.expediente ?? ""}`.trim();
  if (x.estado === "ok" && r.etapa === "presentado_sin_numero") return "Presentado, número en espera";
  if (x.estado === "ok" && r.etapa === "prueba") return "Prueba OK";
  if (x.estado === "tomada") return "Presentando ahora";
  if (x.estado === "pendiente") return x.reintentar_desde ? `En la cola: ${horaCorta(x.reintentar_desde)}${r.reintento ? ` (intento ${r.reintento} de ${r.reintentos_max ?? 16})` : ""}` : "En la cola";
  const motivo = (x.error ?? "").split("\n")[0].slice(0, 160);
  return `Se frenó: ${motivo || "sin detalle"}`;
};

function Intentos({ intentos, ahora }: { intentos: IntentoTad[]; ahora: number }) {
  return (
    <Seccion titulo={`Intentos en TAD · ${intentos.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Cuándo</th>
              <th scope="col" className="px-2 py-2 font-medium">Qué pasó</th>
              <th scope="col" className="px-2 py-2 font-medium">Borrador</th>
              <th scope="col" className="px-3 py-2 font-medium">Documentos oficiales</th>
            </tr>
          </thead>
          <tbody>
            {intentos.map((x) => {
              const r = x.resultado ?? {};
              const descartado = r.borrador_descartado;
              return (
                <tr key={x.id} className="border-t align-top">
                  <td className="px-3 py-2 font-mono">{x.id}</td>
                  <td className="whitespace-nowrap px-2 py-2">{cuandoFue(x.created_at, ahora)}</td>
                  <td className="px-2 py-2">
                    {RESULTADO(x)}
                    <Capturas capturas={x.capturas} />
                  </td>
                  <td className="px-2 py-2 font-mono">
                    {r.borrador ?? x.payload?.continuar_borrador ?? "—"}
                    {descartado && <span className="block font-sans text-[12px] text-muted-foreground">{r.borrador_limpiado_at ? "borrado en TAD" : "descartado"}</span>}
                  </td>
                  <td className="px-3 py-2">{r.adjuntados ? (x.estado === "ok" ? r.adjuntados : `${r.adjuntados} sueltos`) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

function Capturas({ capturas }: { capturas: Captura[] }) {
  const con = capturas.filter((c) => c.url);
  if (!con.length) return null;
  return (
    <details className="text-[12px] text-muted-foreground">
      <summary className="cursor-pointer select-none">Capturas ({con.length})</summary>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {con.map((c, i) => (
          <li key={i}>
            <a href={c.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{c.nombre} <ExternalLink aria-hidden className="size-3" /></a>
          </li>
        ))}
      </ul>
    </details>
  );
}
