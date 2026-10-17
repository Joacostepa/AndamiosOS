"use client";

// Los cuatro modales del detalle (contrato §9; maqueta: modalHTML).
//   - Resolver y avisar: mensaje editable, precargado con «Listo, ya está arreglado…».
//   - Descartar: motivo obligatorio (No es del sistema / No se va a hacer / Ya existe) y una
//     explicación. Un «no, porque…» explicado vale casi lo mismo que un arreglo.
//   - Marcar duplicado: elige el original entre los candidatos de la API (primero los de la
//     misma pantalla). Quien reportó se entera cuando se resuelva el original.
//   - Copiar para Claude Code: el prompt armado por la API, con enlaces de 1 h a las capturas.

import { useRef, useState } from "react";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCandidatos, usePromptClaude, useRevisar } from "@/hooks/use-sistemas";
import {
  ESTADOS,
  LIMITES,
  MOTIVOS,
  MOTIVOS_ELEGIBLES,
  TEXTOS,
  mensajeResolver,
  primerNombre,
  type EstadoReporte,
  type MotivoDescarte,
  type ReporteDetalle,
} from "@/lib/sistemas/tipos";
import { IconoTipoCaja, hace } from "@/components/sistemas/comun";

type PropsModal = { r: ReporteDetalle; abierto: boolean; onCerrar: () => void; onListo?: (e: EstadoReporte) => void };

const nombreDe = (r: ReporteDetalle) => primerNombre(r.creador.nombre) || "quien reportó";

// ─────────────────────────────────────────────────────────────────────────────

export function ModalResolver({ r, abierto, onCerrar, onListo }: PropsModal) {
  const nombre = nombreDe(r);
  // El detalle monta el modal recién al abrirlo: cada vez arranca con el mensaje precargado.
  const [mensaje, setMensaje] = useState(() => mensajeResolver(r.creador.nombre));
  const revisar = useRevisar(r.id);

  function confirmar() {
    const m = mensaje.trim();
    revisar.mutate(
      { estado: "resuelto", ...(m ? { mensaje: m } : {}) },
      {
        onSuccess: () => {
          onCerrar();
          onListo?.("resuelto");
          const otros = r.duplicados.length;
          toast.success(`#${r.numero} resuelto.`, {
            description: `Le avisamos a ${nombre}${otros ? ` y a ${otros === 1 ? "quien avisó lo mismo" : `las ${otros} personas que avisaron lo mismo`}` : ""} por la campanita.`,
          });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !revisar.isPending && onCerrar()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            Resolver #{r.numero} y avisar a {nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sis-resolver" className="text-[12px] font-semibold text-muted-foreground">
            Mensaje para {nombre}
          </label>
          <Textarea
            id="sis-resolver"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={LIMITES.comentarioMax}
            className="min-h-24 text-base sm:text-[13.5px]"
          />
          <p className="text-[12px] text-muted-foreground">
            {TEXTOS.modales.resolverHint}
            {r.duplicados.length > 0 && " También les avisamos a quienes avisaron lo mismo."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar} disabled={revisar.isPending}>
            {TEXTOS.panel.cancelar}
          </Button>
          <Button onClick={confirmar} disabled={revisar.isPending}>
            {revisar.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {TEXTOS.revision.resolver}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ModalDescartar({ r, abierto, onCerrar, onListo }: PropsModal) {
  const nombre = nombreDe(r);
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null);
  const [mensaje, setMensaje] = useState("");
  const revisar = useRevisar(r.id);

  function confirmar() {
    if (!motivo) return;
    const m = mensaje.trim();
    revisar.mutate(
      { estado: "descartado", motivoDescarte: motivo, ...(m ? { mensaje: m } : {}) },
      {
        onSuccess: () => {
          onCerrar();
          onListo?.("descartado");
          toast.success(`#${r.numero} descartado.`, {
            description: m ? `Le explicamos el motivo a ${nombre}.` : `Le avisamos a ${nombre} por la campanita.`,
          });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !revisar.isPending && onCerrar()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Descartar #{r.numero}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-muted-foreground">{TEXTOS.modales.descartarPorQue}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={TEXTOS.modales.descartarPorQue}>
            {MOTIVOS_ELEGIBLES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={motivo === m}
                onClick={() => setMotivo(m)}
                className={cn(
                  "min-h-9 rounded-full border-[1.5px] px-3 text-[12.5px] transition-colors",
                  motivo === m ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-muted-foreground",
                )}
              >
                {MOTIVOS[m].etiqueta}
              </button>
            ))}
          </div>
          <label htmlFor="sis-descartar" className="mt-2 text-[12px] font-semibold text-muted-foreground">
            Explicale a {nombre}
          </label>
          <Textarea
            id="sis-descartar"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={LIMITES.comentarioMax}
            placeholder={TEXTOS.modales.descartarPlaceholder}
            className="min-h-24 text-base sm:text-[13.5px]"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar} disabled={revisar.isPending}>
            {TEXTOS.panel.cancelar}
          </Button>
          <Button onClick={confirmar} disabled={!motivo || revisar.isPending}>
            {revisar.isPending && <Loader2 className="animate-spin" />}
            {TEXTOS.modales.descartarBoton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ModalDuplicado({ r, abierto, onCerrar, onListo }: PropsModal) {
  const nombre = nombreDe(r);
  const candidatos = useCandidatos(r.id, abierto);
  const revisar = useRevisar(r.id);
  const lista = candidatos.data?.candidatos ?? [];

  function elegir(origId: string, origNumero: number) {
    revisar.mutate(
      { estado: "descartado", motivoDescarte: "duplicado", duplicadoDe: origId },
      {
        onSuccess: () => {
          onCerrar();
          onListo?.("descartado");
          toast.success(`#${r.numero} unido al #${origNumero}.`, { description: `${nombre} se entera cuando se resuelva el original.` });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !revisar.isPending && onCerrar()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>#{r.numero} es duplicado de…</DialogTitle>
          <DialogDescription className="text-[12.5px]">{TEXTOS.modales.duplicadoHint}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto px-1">
          {candidatos.isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          {candidatos.error && <p className="text-[13px] text-muted-foreground">{candidatos.error.message}</p>}
          {!candidatos.isLoading && !candidatos.error && lista.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted-foreground">No hay otros reportes para elegir.</p>
          )}
          {lista.map((x) => (
            <button
              key={x.id}
              type="button"
              disabled={revisar.isPending}
              onClick={() => elegir(x.id, x.numero)}
              className="flex w-full gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-muted-foreground disabled:opacity-60"
            >
              <IconoTipoCaja tipo={x.tipo} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-[13px] [overflow-wrap:anywhere]">
                  <span className="font-mono text-muted-foreground tabular-nums">#{x.numero}</span> {x.descripcion}
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                  {x.pantalla} · {ESTADOS[x.estado].etiqueta} · {primerNombre(x.creador.nombre)} · {hace(x.createdAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copia al portapapeles. Si el navegador no deja (http, permisos, Safari viejo), selecciona
 * el texto para que se copie a mano con ⌘C, que siempre anda.
 */
async function copiar(texto: string, nodo: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sigue abajo */
  }
  if (!nodo) return false;
  const rango = document.createRange();
  rango.selectNodeContents(nodo);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(rango);
  try {
    // Obsoleto, pero es el único camino cuando la API moderna no está.
    if (document.execCommand("copy")) return true;
  } catch {
    /* queda seleccionado */
  }
  return false;
}

export function ModalClaude({ r, abierto, onCerrar }: PropsModal) {
  const prompt = usePromptClaude(r.id, abierto);
  const pre = useRef<HTMLPreElement>(null);
  const texto = prompt.data?.texto ?? "";
  const vence = prompt.data?.capturas[0]?.vence;

  async function alCopiar() {
    if (!texto) return;
    const ok = await copiar(texto, pre.current);
    if (ok) toast.success(TEXTOS.modales.copiado, { description: TEXTOS.modales.copiadoDetalle });
    else toast.info("Seleccioné el texto.", { description: "Copialo con Ctrl+C o ⌘C." });
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>
            {TEXTOS.revision.copiarClaude} · #{r.numero}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">{TEXTOS.modales.claudeHint}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {prompt.isLoading && <Skeleton className="h-72 w-full" />}
          {prompt.error && <p className="text-[13px] text-muted-foreground">{prompt.error.message}</p>}
          {texto && (
            <pre
              ref={pre}
              className="max-h-[50vh] overflow-auto rounded-lg border bg-background p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {texto}
            </pre>
          )}
          {vence && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Los enlaces a las capturas vencen a las{" "}
              {new Date(vence).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
          <Button onClick={alCopiar} disabled={!texto}>
            <ClipboardCopy />
            {TEXTOS.modales.copiarTexto}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
