"use client";

// Mis reportes (contrato §9; maqueta: misHTML). Lo que cada persona le avisó a Sistemas y en
// qué quedó. Es de todos y sólo muestra lo propio: la API filtra por creado_por y la RLS lo
// repite.
//
// Cada tarjeta: tipo, #N, pantalla y fecha; la descripción; la barra Enviado → Sistemas ya lo
// vio → Lo están arreglando → ¡Listo! (o el cartel de «No se va a hacer: …»); la charla con
// Sistemas; y las capturas. Mientras está abierto se puede sumar algo; resuelto, se confirma
// «Ya está, gracias» o «Sigue pasando» (que lo reabre y les avisa a los revisores).
//
// `?id=` (el enlace de la campanita) baja hasta ese reporte y lo resalta.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox, Loader2, Megaphone, Send, ThumbsUp, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ErrorSistemas, useComentarReporte, useConfirmarReporte, useMisReportes } from "@/hooks/use-sistemas";
import {
  ESTADOS,
  LIMITES,
  PASOS_USUARIO,
  TEXTOS,
  esCerrado,
  estadoParaUsuario,
  pasoUsuario,
  type ReporteUsuario,
} from "@/lib/sistemas/tipos";
import { ChipTipo, Conversacion, TONO_NEUTRO, TONO_TIPO, fechaCorta } from "@/components/sistemas/comun";
import { pedirReporte } from "@/components/sistemas/disparar";
import { VisorImagenes } from "@/components/sistemas/visor-imagenes";

export function MisReportes() {
  const params = useSearchParams();
  const destacado = params.get("id");
  const { data, isLoading, error } = useMisReportes();
  const reportes = useMemo(() => data?.reportes ?? [], [data]);

  // Baja una sola vez por cada ?id= distinto (el refetch cada 5 min no vuelve a mover la página).
  const bajado = useRef<string | null>(null);
  useEffect(() => {
    if (!destacado || bajado.current === destacado || !reportes.some((r) => r.id === destacado)) return;
    bajado.current = destacado;
    requestAnimationFrame(() => document.getElementById(`reporte-${destacado}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [destacado, reportes]);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{TEXTOS.mis.titulo}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{TEXTOS.mis.subtitulo}</p>
        </div>
        <Button className="h-10 gap-2 sm:h-9" onClick={() => pedirReporte()}>
          <Megaphone />
          {TEXTOS.mis.reportar}
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border px-4 py-3 text-[13.5px]" style={{ backgroundColor: "var(--tb-ambar-bg)", borderColor: "var(--tb-ambar-borde)" }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" style={{ color: "var(--tb-ambar-text)" }} />
          <span>{error instanceof ErrorSistemas || error instanceof Error ? error.message : "No pudimos traer tus reportes."}</span>
        </div>
      )}

      {!isLoading && !error && reportes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-10 text-center text-[13.5px] text-muted-foreground">
          <Inbox className="size-8 text-muted-foreground/60" />
          <p className="max-w-sm">{TEXTOS.mis.vacio}</p>
        </div>
      )}

      {reportes.map((r) => (
        <TarjetaReporte key={r.id} reporte={r} destacado={r.id === destacado} />
      ))}
    </div>
  );
}

function TarjetaReporte({ reporte: r, destacado }: { reporte: ReporteUsuario; destacado: boolean }) {
  const [visor, setVisor] = useState<number | null>(null);
  const cerrado = esCerrado(r.estado);
  const paso = pasoUsuario(r.estado);
  const pedirConfirmacion = r.estado === "resuelto" && r.confirmadoOk === null;

  return (
    <article
      id={`reporte-${r.id}`}
      className={cn(
        "grid scroll-mt-4 gap-3.5 rounded-xl border bg-card px-4 py-3.5 sm:grid-cols-[1fr_168px]",
        destacado && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          <ChipTipo tipo={r.tipo} />
          <span className="font-mono tabular-nums">#{r.numero}</span>
          <span>
            {r.pantalla} · {fechaCorta(r.createdAt)}
          </span>
        </div>
        <p className="mt-1.5 mb-2.5 text-[14px] whitespace-pre-wrap [overflow-wrap:anywhere]">{r.descripcion}</p>

        {r.estado === "descartado" ? (
          <div
            className="mb-2.5 rounded-lg px-2.5 py-2 text-[12.5px]"
            style={
              r.motivoDescarte === "duplicado" && r.estadoOriginal === "resuelto"
                ? { backgroundColor: TONO_TIPO.mejora.fondo, color: TONO_TIPO.mejora.texto }
                : { backgroundColor: TONO_NEUTRO.fondo, color: TONO_NEUTRO.texto }
            }
          >
            {estadoParaUsuario(r)}
          </div>
        ) : (
          <ol className="mb-2.5 flex gap-1" aria-label={`Estado: ${ESTADOS[r.estado].usuario}`}>
            {PASOS_USUARIO.map((e, k) => (
              <li key={e} className="min-w-0 flex-1" aria-current={k === paso ? "step" : undefined}>
                <i className={cn("block h-1 rounded-sm", k <= paso ? "bg-primary" : "bg-muted")} />
                <span
                  className={cn(
                    "mt-1 block truncate text-[11px]",
                    k === paso ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {ESTADOS[e].usuario}
                </span>
              </li>
            ))}
          </ol>
        )}

        <Conversacion eventos={r.eventos} vista="usuario" nombreUsuario="" />

        {pedirConfirmacion && <Confirmar id={r.id} />}
        {!cerrado && <Responder id={r.id} />}
      </div>

      {r.capturas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setVisor(0)} className="block cursor-zoom-in overflow-hidden rounded-md border bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
            <img src={r.capturas[0].url} alt={`Captura del reporte #${r.numero}`} className="max-h-60 w-full object-cover object-top sm:max-h-32" />
          </button>
          {r.capturas.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {r.capturas.slice(1).map((c, i) => (
                <button key={c.id} type="button" onClick={() => setVisor(i + 1)} className="overflow-hidden rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
                  <img src={c.url} alt="" className="h-9 w-12 object-cover" />
                </button>
              ))}
            </div>
          )}
          <VisorImagenes imagenes={r.capturas} indice={visor} titulo={`Reporte #${r.numero}`} onCerrar={() => setVisor(null)} />
        </div>
      )}
    </article>
  );
}

function Confirmar({ id }: { id: string }) {
  const confirmar = useConfirmarReporte(id);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
      <span>{TEXTOS.mis.quedoBien}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-9 sm:h-7"
        disabled={confirmar.isPending}
        onClick={() =>
          confirmar.mutate(
            { ok: true },
            { onSuccess: () => toast.success(TEXTOS.mis.graciasConfirmar), onError: (e) => toast.error(e.message) },
          )
        }
      >
        <ThumbsUp />
        {TEXTOS.mis.yaEsta}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 sm:h-7"
        disabled={confirmar.isPending}
        onClick={() =>
          confirmar.mutate(
            { ok: false },
            { onSuccess: () => toast.success(TEXTOS.mis.reabierto), onError: (e) => toast.error(e.message) },
          )
        }
      >
        {TEXTOS.mis.siguePasando}
      </Button>
    </div>
  );
}

function Responder({ id }: { id: string }) {
  const [texto, setTexto] = useState("");
  const comentar = useComentarReporte(id);
  const enviar = () => {
    const t = texto.trim();
    if (!t || comentar.isPending) return;
    comentar.mutate(t, {
      onSuccess: () => {
        setTexto("");
        toast.success(TEXTOS.mis.enviado, { description: TEXTOS.mis.enviadoDetalle });
      },
      onError: (e) => toast.error(e.message),
    });
  };
  return (
    <div className="mt-2.5 flex items-end gap-2">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={LIMITES.comentarioMax}
        placeholder={TEXTOS.mis.responder}
        aria-label={TEXTOS.mis.responder}
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
  );
}
