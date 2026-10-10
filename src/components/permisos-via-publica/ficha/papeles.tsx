"use client";

import { useRef, useState } from "react";
import { CircleAlert, CircleMinus, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePedirCorreccion, useSubirDocumento } from "@/hooks/use-permisos-via-publica";
import { cuandoFue, type EstadoEtapa } from "@/lib/permisos-via-publica/estado";
import type { FichaPermiso } from "@/lib/permisos-via-publica/ficha";
import { ETIQUETA_ESTADO_DOCUMENTO, NOMBRE_DOCUMENTO, type Documento, type EstadoDocumento } from "@/lib/permisos-via-publica/tipos";
import { Chip, Punto, Seccion, type TonoChip } from "../ui";

// Los papeles del permiso, una vez cada uno (rediseño 09/10): del cliente, del seguro y de la
// oficina. Lo que hay que corregir y lo que falta, arriba; los controles de la revisión
// automática, plegados cuando están todos bien (antes eran tres renglones verdes por documento).
// Los 11 casilleros de TAD son otra forma de ver la misma lista.

type Doc = Documento & { url: string | null };

const ORDEN: Record<EstadoDocumento, number> = { observado: 0, falta: 1, pedido: 2, cargado: 3, revisando: 3, ok: 4 };
const TONO: Record<EstadoDocumento, TonoChip> = { observado: "bloqueo", falta: "neutro", pedido: "marcha", cargado: "marcha", revisando: "marcha", ok: "listo" };
const PUNTO: Record<EstadoDocumento, EstadoEtapa> = { observado: "frenado", falta: "todavia", pedido: "marcha", cargado: "marcha", revisando: "marcha", ok: "listo" };
const OFICINA = ["informe_tecnico", "croquis", "encomienda_cpau"];
const nombreDoc = (c: string) => (NOMBRE_DOCUMENTO[c] ?? c).replace(/\s*\(.*\)$/, "");
const conPuntos = (dni: string) => dni.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function Papeles({ ficha, ahora }: { ficha: FichaPermiso; ahora: number }) {
  const [porCasillero, setPorCasillero] = useState(false);
  const docs = ficha.documentos;
  const cli = docs.filter((d) => d.origen === "cliente").sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]);
  const poliza = docs.find((d) => d.clave === "poliza_rc");
  const oficina = OFICINA.map((c) => docs.find((d) => d.clave === c));
  const ok = cli.filter((d) => d.estado === "ok").length;
  const aCorregir = cli.filter((d) => d.estado === "observado").length;
  const faltan = cli.filter((d) => d.estado === "falta" || d.estado === "pedido").length;
  const casilleros = ficha.presentacion.estado.casilleros;

  return (
    <Seccion
      id="papeles"
      titulo="Papeles"
      accion={casilleros.length > 0 && (
        <Button size="sm" variant="outline" aria-pressed={porCasillero} onClick={() => setPorCasillero((x) => !x)}>
          {porCasillero ? "Ver por quién los da" : "Ver por casillero de TAD"}
        </Button>
      )}
    >
      {porCasillero ? (
        <ul className="divide-y">
          {casilleros.map((c) => (
            <li key={c.casillero} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
              <Punto estado={c.ok ? "listo" : "todavia"} />
              <div className="min-w-0">
                <p className="font-medium">{c.casillero}…</p>
                <p className="text-[12px] text-muted-foreground">{c.documentos.map((d) => `${d.nombre}${d.ok ? "" : " (falta)"}`).join(" + ")}</p>
              </div>
            </li>
          ))}
          {ficha.presentacion.estado.faltan.length > 0 && (
            <li className="px-3 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">{ficha.presentacion.estado.faltan.join(" ")}</li>
          )}
        </ul>
      ) : (
        <>
          <Grupo titulo={ficha.tramite.titular_cargado_at ? `Del cliente · ${ok} de ${cli.length} OK${aCorregir ? ` · ${aCorregir} a corregir` : ""}${faltan ? ` · ${faltan} falta${faltan === 1 ? "" : "n"}` : ""}` : "Del cliente"}>
            {!ficha.tramite.titular_cargado_at ? (
              <p className="px-3 pb-3 text-[13px] text-muted-foreground">Aparecen cuando el cliente diga quién es el dueño del lote.</p>
            ) : (
              <ul className="divide-y">{cli.map((d) => <FilaDoc key={d.id} d={d} ficha={ficha} ahora={ahora} />)}</ul>
            )}
          </Grupo>
          <Grupo titulo="Del seguro">
            {poliza ? (
              <ul><FilaDoc d={poliza} ficha={ficha} ahora={ahora} /></ul>
            ) : (
              <p className="flex items-center gap-3 px-3 pb-3 text-[13px] text-muted-foreground">
                <Punto estado="todavia" /> Póliza (endoso de Segucom) · {ficha.supervision.endosoAutomatico ? "sale sola cuando el cliente carga el dueño del lote" : "se pide desde el estado de arriba"}
              </p>
            )}
          </Grupo>
          <Grupo titulo="De la oficina">
            <ul className="divide-y">
              {oficina.map((d, i) =>
                d ? (
                  <FilaDoc key={d.id} d={d} ficha={ficha} ahora={ahora} />
                ) : (
                  <li key={OFICINA[i]} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-muted-foreground">
                    <Punto estado="todavia" />
                    {nombreDoc(OFICINA[i])} · {OFICINA[i] === "encomienda_cpau" ? "se arma con los papeles completos" : "se generan solos con los papeles completos"}
                  </li>
                ),
              )}
            </ul>
          </Grupo>
        </>
      )}
    </Seccion>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b last:border-b-0">
      <h3 className="px-3 pb-1 pt-3 text-[13px] font-semibold text-foreground/80">{titulo}</h3>
      {children}
    </div>
  );
}

function FilaDoc({ d, ficha, ahora }: { d: Doc; ficha: FichaPermiso; ahora: number }) {
  const correccion = usePedirCorreccion(ficha.tramite.id);
  const subir = useSubirDocumento(ficha.tramite.id);
  const input = useRef<HTMLInputElement>(null);
  const chequeos = d.revision?.chequeos ?? [];
  const firma = (d.revision?.leido ?? null) as { firmante?: string; dni?: string } | null;
  const firmado = chequeos.some((c) => c.clave === "firma_electronica");
  const delGobierno = chequeos.find((c) => c.clave === "observado_gcba");
  const fallan = chequeos.filter((c) => !c.ok && c.clave !== "observado_gcba");
  const dni = firma?.dni?.replace(/\D/g, "") ?? "";
  const cuando = d.subido_at ?? d.updated_at;

  return (
    <li className={cn("flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5", d.estado === "observado" && "bg-red-500/5")}>
      <span className="pt-0.5"><Punto estado={PUNTO[d.estado]} /></span>
      <div className="min-w-0 flex-[999_1_16rem] space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium">{nombreDoc(d.clave)}</span>
          <Chip tono={TONO[d.estado]}>
            {d.estado === "revisando" && <Loader2 aria-hidden className="size-3 animate-spin" />}
            {ETIQUETA_ESTADO_DOCUMENTO[d.estado]}
          </Chip>
          {delGobierno && <Chip tono="bloqueo">Observado por el Gobierno</Chip>}
        </p>
        {firmado && firma?.firmante && (
          <p className="text-[13px] text-foreground/75">
            Firmada en el portal por {firma.firmante} (DNI {conPuntos(dni)}){cuando ? ` · ${cuandoFue(cuando, ahora)}` : ""}
          </p>
        )}
        {firmado && dni.length > 0 && dni.length < 8 && <Chip tono="aviso">DNI de {dni.length} cifras: revisalo</Chip>}
        {d.observacion && d.estado !== "ok" && (
          <p className={cn("text-[13px]", d.estado === "observado" ? "text-red-800 dark:text-red-200" : "text-foreground/75")}>{d.observacion}</p>
        )}
        {d.clave === "poliza_rc" && (
          <p className="text-[12px] text-muted-foreground">
            {[d.pedido_at && `Pedido el ${cuandoFue(d.pedido_at, ahora)}`, d.aviso_enviado_at && `aviso a Segucom el ${cuandoFue(d.aviso_enviado_at, ahora)}`, d.recordatorio_at && `recordatorio el ${cuandoFue(d.recordatorio_at, ahora)}`, d.subido_at && `subido por ${d.subido_por === "productor" ? "Segucom" : "la oficina"} el ${cuandoFue(d.subido_at, ahora)}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {d.aviso_error && <p className="text-[12px] text-amber-800 dark:text-amber-300">No se pudo mandar el aviso a Segucom: {d.aviso_error}</p>}
        {chequeos.length > 0 && !firmado && (
          fallan.length === 0 ? (
            <details className="text-[12px] text-muted-foreground">
              <summary className="cursor-pointer select-none">{chequeos.filter((c) => c.ok).length} controles OK</summary>
              <ul className="mt-1 space-y-0.5">{chequeos.map((c) => <li key={c.clave}>✓ {c.detalle}</li>)}</ul>
            </details>
          ) : (
            <ul className="space-y-0.5 text-[12px]">
              {fallan.map((c) => (
                <li key={c.clave} className="flex items-start gap-1.5">
                  {c.bloquea ? <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-red-700 dark:text-red-300" /> : <CircleMinus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                  <span>{c.detalle}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {d.url && (
          <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm py-1.5 text-[13px] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {d.archivo_nombre && d.archivo_nombre.length < 28 ? d.archivo_nombre : "PDF"} <ExternalLink aria-hidden className="size-3" />
          </a>
        )}
        {d.origen === "cliente" && d.estado === "observado" && ficha.yo.puedeEditar && (
          <Button
            size="sm"
            variant="ghost"
            disabled={correccion.isPending}
            onClick={() => correccion.mutate(d.id, { onSuccess: () => toast.success("Se le volvió a pedir la corrección al cliente por mail"), onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo mandar") })}
          >
            Pedir corrección al cliente
          </Button>
        )}
        {d.clave === "poliza_rc" && ficha.yo.puedeEditar && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(ev) => {
                const archivo = ev.target.files?.[0];
                ev.target.value = "";
                if (archivo) subir.mutate({ documentoId: d.id, archivo }, { onSuccess: () => toast.success("PDF subido: se está revisando"), onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo subir") });
              }}
            />
            <Button size="sm" variant="ghost" disabled={subir.isPending} onClick={() => input.current?.click()}>
              {subir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir el PDF que mandó
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
