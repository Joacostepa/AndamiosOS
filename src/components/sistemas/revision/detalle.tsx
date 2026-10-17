"use client";

// El detalle de un reporte en la bandeja (contrato §9; maqueta: detailHTML).
//
// Arriba lo que hace falta para decidir: #N, tipo, estado, si frena el trabajo, quién y desde
// dónde, y la captura grande. Después la charla con quien reportó (firmada «Sistemas»), el
// contexto técnico plegado, y las tres salidas: duplicado, descartar (con motivo) o resolver
// y avisar. NO hay «A cargo» ni asignación: los dos revisores ven y hacen lo mismo.

import { useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Archive, ArrowLeft, Check, Copy, ExternalLink, Flame, Hash, Loader2, Send, Terminal, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { etiquetaRol, type Rol } from "@/lib/auth/acceso";
import { useComentarRevision, useRevisar } from "@/hooks/use-sistemas";
import {
  ESTADOS,
  ESTADOS_REPORTE,
  LIMITES,
  MOTIVOS,
  PRIORIDADES,
  RESPUESTAS_RAPIDAS,
  TEXTOS,
  primerNombre,
  shaCorto,
  type EstadoReporte,
  type PrioridadReporte,
  type ReporteDetalle,
  type RevisionDetalleRespuesta,
} from "@/lib/sistemas/tipos";
import { Chip, ChipEstado, ChipTipo, Conversacion, TONO_NEUTRO, TONO_PELIGRO, fechaCorta } from "@/components/sistemas/comun";
import { VisorImagenes } from "@/components/sistemas/visor-imagenes";
import { ModalClaude, ModalDescartar, ModalDuplicado, ModalResolver } from "@/components/sistemas/revision/modales";

type Modal = "resolver" | "descartar" | "duplicado" | "claude" | null;

const ITEMS_PRIORIDAD: Record<string, string> = Object.fromEntries(PRIORIDADES.map((p) => [p.valor ?? "sin", p.etiqueta]));

export function DetalleReporte({
  id,
  consulta,
  onVolver,
  onElegir,
  onEstado,
}: {
  id: string;
  consulta: UseQueryResult<RevisionDetalleRespuesta, Error>;
  onVolver: () => void;
  onElegir: (id: string) => void;
  onEstado: (e: EstadoReporte) => void;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const revisar = useRevisar(id);

  const volver = (
    <Button variant="ghost" size="icon" className="size-10 lg:hidden" onClick={onVolver} aria-label="Volver a la lista">
      <ArrowLeft />
    </Button>
  );

  if (consulta.isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          {volver}
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (consulta.error || !consulta.data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">{volver}</div>
        <p className="text-[13px] text-muted-foreground">{consulta.error?.message ?? "No pudimos traer el reporte."}</p>
      </div>
    );
  }

  const { reporte: r, shaActual } = consulta.data;
  const nombre = primerNombre(r.creador.nombre) || "quien reportó";

  function cambiarEstado(e: EstadoReporte) {
    if (e === r.estado || revisar.isPending) return;
    if (e === "resuelto") return setModal("resolver");
    if (e === "descartado") return setModal("descartar");
    revisar.mutate(
      { estado: e },
      {
        onSuccess: () => {
          onEstado(e);
          toast.success(
            e === "en_curso" ? `#${r.numero} en curso.` : `#${r.numero}: ${ESTADOS[e].etiqueta.toLowerCase()}.`,
            e === "visto" ? undefined : { description: `Le avisamos a ${nombre} por la campanita.` },
          );
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function cambiarPrioridad(v: string) {
    const prioridad = v === "sin" ? null : (v as PrioridadReporte);
    if (prioridad === r.prioridad) return;
    revisar.mutate({ prioridad }, { onError: (err) => toast.error(err.message) });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {volver}
        <span className="font-mono font-semibold tabular-nums">#{r.numero}</span>
        <ChipTipo tipo={r.tipo} />
        <ChipEstado estado={r.estado} />
        {r.frena && (
          <Chip tono={TONO_PELIGRO} icono={Flame}>
            {TEXTOS.revision.frenaFiltro}
          </Chip>
        )}
        <span className="flex-1" />
        <Button size="sm" className="h-9 sm:h-7" onClick={() => setModal("claude")}>
          <Terminal />
          {TEXTOS.revision.copiarClaude}
        </Button>
      </div>

      <h2 className="text-[17px] leading-snug font-semibold tracking-tight text-pretty whitespace-pre-wrap [overflow-wrap:anywhere]">
        {r.descripcion}
      </h2>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
        <User className="size-3.5" />
        <span>
          {r.creador.nombre} {r.creador.apellido}
        </span>
        {r.creador.rol && <span>· {etiquetaRol(r.creador.rol as Rol)}</span>}
        <span>· {r.dispositivo}</span>
        <span>· {fechaCorta(r.createdAt)}</span>
        <span>
          · <b className="font-semibold text-foreground">{r.pantalla}</b>
        </span>
        {r.avisadoEnSlack && (
          <span className="inline-flex items-center gap-0.5">
            · <Hash className="size-3.5" />
            {TEXTOS.revision.avisadoSlack}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-muted-foreground">{TEXTOS.revision.estado}</span>
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border" role="group" aria-label={TEXTOS.revision.estado}>
            {ESTADOS_REPORTE.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={r.estado === e}
                disabled={revisar.isPending}
                onClick={() => cambiarEstado(e)}
                className={cn(
                  "min-h-8 border-l px-2.5 text-[12px] first:border-l-0 transition-colors",
                  r.estado === e ? "bg-foreground font-semibold text-background" : "bg-card hover:bg-muted",
                )}
              >
                {ESTADOS[e].etiqueta}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-muted-foreground">{TEXTOS.revision.prioridad}</span>
          <Select items={ITEMS_PRIORIDAD} value={r.prioridad ?? "sin"} onValueChange={(v) => v && cambiarPrioridad(String(v))}>
            <SelectTrigger className="h-8 min-w-32 text-[12.5px]" aria-label={TEXTOS.revision.prioridad}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ITEMS_PRIORIDAD).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-[12.5px]">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {revisar.isPending && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" />}
      </div>

      {r.estado === "descartado" && r.motivoDescarte && (
        <div className="rounded-lg px-2.5 py-2 text-[12.5px]" style={{ backgroundColor: TONO_NEUTRO.fondo, color: TONO_NEUTRO.texto }}>
          Descartado: {MOTIVOS[r.motivoDescarte].etiqueta}
          {r.duplicadoDe && (
            <>
              {" del "}
              <button type="button" className="font-mono underline underline-offset-2" onClick={() => onElegir(r.duplicadoDe!.id)}>
                #{r.duplicadoDe.numero}
              </button>
            </>
          )}
        </div>
      )}

      {r.duplicados.length > 0 && (
        <div className="rounded-lg bg-muted px-2.5 py-2 text-[12.5px]">
          Avisaron lo mismo en{" "}
          {r.duplicados.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <button type="button" className="font-mono underline underline-offset-2" onClick={() => onElegir(d.id)}>
                #{d.numero}
              </button>
            </span>
          ))}
          . Cuando lo resuelvas, también les avisamos.
        </div>
      )}

      <Capturas r={r} />

      <ConversacionRevision r={r} nombre={nombre} />

      <ContextoTecnico r={r} shaActual={shaActual} />

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" className="h-10 sm:h-8" onClick={() => setModal("duplicado")} disabled={r.estado === "descartado"}>
          <Copy />
          {TEXTOS.revision.marcarDuplicado}
        </Button>
        <Button variant="outline" className="h-10 sm:h-8" onClick={() => setModal("descartar")} disabled={r.estado === "descartado"}>
          <Archive />
          {TEXTOS.revision.descartar}
        </Button>
        <Button className="h-10 sm:h-8" onClick={() => setModal("resolver")} disabled={r.estado === "resuelto"}>
          <Check />
          {TEXTOS.revision.resolver}
        </Button>
      </div>

      {/* Se montan al abrirlos: cada vez arrancan limpios (motivo sin elegir, mensaje precargado). */}
      {modal === "resolver" && <ModalResolver r={r} abierto onCerrar={() => setModal(null)} onListo={onEstado} />}
      {modal === "descartar" && <ModalDescartar r={r} abierto onCerrar={() => setModal(null)} onListo={onEstado} />}
      {modal === "duplicado" && <ModalDuplicado r={r} abierto onCerrar={() => setModal(null)} onListo={onEstado} />}
      {modal === "claude" && <ModalClaude r={r} abierto onCerrar={() => setModal(null)} />}
    </div>
  );
}

function Capturas({ r }: { r: ReporteDetalle }) {
  const [visor, setVisor] = useState<number | null>(null);
  if (r.capturas.length === 0) {
    return <div className="rounded-lg border-[1.5px] border-dashed px-4 py-4 text-center text-[13px] text-muted-foreground">Sin imágenes</div>;
  }
  const [primera, ...resto] = r.capturas;
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">
        {r.capturas.length === 1 ? "Captura" : `Capturas (${r.capturas.length})`}
      </span>
      <button type="button" onClick={() => setVisor(0)} className="block w-full cursor-zoom-in overflow-hidden rounded-md border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
        <img src={primera.url} alt={`Captura del reporte #${r.numero}`} className="max-h-[60vh] w-full object-contain object-top" />
      </button>
      {resto.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {resto.map((c, i) => (
            <button key={c.id} type="button" onClick={() => setVisor(i + 1)} className="overflow-hidden rounded-md border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
              <img src={c.url} alt="" className="h-20 w-28 object-cover object-top" />
            </button>
          ))}
        </div>
      )}
      <VisorImagenes imagenes={r.capturas} indice={visor} titulo={`Reporte #${r.numero}`} onCerrar={() => setVisor(null)} />
    </div>
  );
}

function ConversacionRevision({ r, nombre }: { r: ReporteDetalle; nombre: string }) {
  const [texto, setTexto] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const comentar = useComentarRevision(r.id);

  function enviar() {
    const t = texto.trim();
    if (!t || comentar.isPending) return;
    comentar.mutate(t, {
      onSuccess: () => {
        setTexto("");
        toast.success("Mensaje enviado.", { description: `${nombre} lo ve en la campanita y en Mis reportes.` });
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">
        {TEXTOS.revision.conversacionCon} {nombre}
      </span>
      <div className="flex flex-col gap-2">
        <Conversacion
          eventos={r.eventos}
          vista="revision"
          nombreUsuario={nombre}
          vacio={<p className="text-[12.5px] text-muted-foreground">{TEXTOS.revision.sinMensajes}</p>}
        />
        <div className="flex flex-wrap gap-1.5">
          {RESPUESTAS_RAPIDAS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setTexto(q);
                area.current?.focus();
              }}
              className="rounded-full border border-dashed px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            ref={area}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={LIMITES.comentarioMax}
            placeholder={`${TEXTOS.revision.escribile} ${nombre}…`}
            aria-label={`${TEXTOS.revision.escribile} ${nombre}`}
            className="min-h-10 text-base sm:text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <Button variant="outline" className="h-10 shrink-0 sm:h-9" disabled={!texto.trim() || comentar.isPending} onClick={enviar}>
            {comentar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {TEXTOS.mis.enviar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Codigo({ lineas }: { lineas: string[] }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
      {lineas.join("\n")}
    </div>
  );
}

function ContextoTecnico({ r, shaActual }: { r: ReporteDetalle; shaActual: string }) {
  const c = r.contexto;
  const errores = c?.errores ?? [];
  const pedidos = c?.pedidos ?? [];
  const rutas = c?.rutas ?? [];
  const otraVersion = !!r.shaCliente && !!shaActual && shaCorto(r.shaCliente) !== shaCorto(shaActual);
  // Sólo rutas internas: «//otro.sitio» o «/\otro.sitio» el navegador los lee como otro dominio.
  const abrible = !!r.ruta && /^\/(?![\/\\])/.test(r.ruta);

  return (
    <details className="border-t pt-2.5 text-[12.5px] text-muted-foreground">
      <summary className="cursor-pointer leading-snug">
        <b className="font-semibold text-foreground">{TEXTOS.revision.contextoTecnico}</b> · {TEXTOS.revision.contextoTecnicoDetalle}
      </summary>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt>{TEXTOS.revision.ruta}</dt>
        <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">
          <span className="font-mono">{r.ruta || "—"}</span>
          {abrible && (
            <>
              {" · "}
              <a href={r.ruta!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                {TEXTOS.revision.abrirPantalla}
                <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </dd>
        <dt>{TEXTOS.revision.dispositivo}</dt>
        <dd className="min-w-0 text-foreground">
          {r.dispositivo}
          {c?.pantalla.tema && <span className="text-muted-foreground"> · tema {c.pantalla.tema}</span>}
        </dd>
        <dt>{TEXTOS.revision.version}</dt>
        <dd className="min-w-0 font-mono text-foreground">
          {shaCorto(r.shaCliente)}
          {otraVersion && (
            <span style={{ color: "var(--tb-ambar-borde)" }}>
              {" "}
              ({TEXTOS.revision.laActualEs} {shaCorto(shaActual)})
            </span>
          )}
        </dd>
        <dt>{TEXTOS.revision.antesEstuvo}</dt>
        <dd className="min-w-0 font-mono text-foreground [overflow-wrap:anywhere]">{rutas.length ? rutas.map((x) => x.ruta).join(" → ") : "—"}</dd>
        <dt>{TEXTOS.revision.errores}</dt>
        <dd className="min-w-0">
          {errores.length ? (
            <Codigo
              lineas={errores.map((e) => {
                const pila = e.stack ? `\n    ${e.stack.split("\n").slice(0, 4).join("\n    ")}` : e.fuente ? `\n    en ${e.fuente}` : "";
                return `${e.tipo}: ${e.mensaje}${pila}`;
              })}
            />
          ) : (
            <span className="text-foreground">{TEXTOS.revision.ninguno}</span>
          )}
        </dd>
        <dt>{TEXTOS.revision.pedidosFallidos}</dt>
        <dd className="min-w-0">
          {pedidos.length ? (
            <Codigo
              lineas={pedidos.map(
                (p) => `${p.metodo} ${p.url} → ${p.status || "sin respuesta"} · ${p.duracionMs} ms${p.vercelId ? ` · ${p.vercelId}` : ""}`,
              )}
            />
          ) : (
            <span className="text-foreground">{TEXTOS.revision.ninguno}</span>
          )}
        </dd>
      </dl>
    </details>
  );
}
