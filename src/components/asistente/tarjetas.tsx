"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Copy, Download, ExternalLink, FileText, Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AccionVista, PdfVista } from "@/lib/asistente/eventos";
import { telefonoWhatsapp } from "@/lib/panol/whatsapp";

// Tarjetas que aparecen en el chat: la acción a confirmar, "Mandar al cliente" (el PDF final y
// el mensaje juntos) y, sueltos, la vista previa del PDF o un mensaje sin PDF.
//
// En el celular, en obra y con una mano: todo lo que se toca mide 44–48 px y los botones dicen
// lo que hacen (antes eran tres íconos sin texto).

const NOMBRE_ACCION: Record<string, string> = {
  guardar_presupuesto: "Guardar en Odoo",
  reemitir_presupuesto: "Re-emitir en Odoo",
  enviar_mail: "Mandar por mail",
  crear_cliente: "Dar de alta el cliente",
};

/** Cómo se dice cada estado (en la base son palabras técnicas: «presentada», «incierto»). */
const ESTADO: Record<string, string> = {
  propuesta: "para confirmar",
  presentada: "para confirmar",
  ejecutando: "en curso…",
  ok: "hecho",
  error: "no se pudo",
  incierto: "sin confirmar si se hizo: revisar en Odoo",
  rechazada: "descartada",
  vencida: "vencida",
  reemplazada: "reemplazada",
};

const copiar = (texto: string) =>
  navigator.clipboard.writeText(texto).then(() => toast.success("Mensaje copiado"), () => toast.error("No se pudo copiar: seleccioná el texto a mano"));

export function TarjetaAccion({
  accion,
  onDecidir,
  ocupado,
  ejecutando = false,
}: {
  accion: AccionVista;
  onDecidir: (id: string, d: "confirmar" | "rechazar" | "reintentar") => void;
  ocupado: boolean;
  /** Se tocó Confirmar y el servidor la está ejecutando. */
  ejecutando?: boolean;
}) {
  const abierta = accion.estado === "propuesta" || accion.estado === "presentada";
  // El reloj vive en estado (no Date.now() en el render): se actualiza cada 30 s.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const primero = setTimeout(tic, 0);
    const cada = setInterval(tic, 30_000);
    return () => {
      clearTimeout(primero);
      clearInterval(cada);
    };
  }, []);
  const vencida = ahora !== null && new Date(accion.venceAt).getTime() < ahora;
  const fallo = accion.estado === "error" || accion.estado === "incierto";
  // `reintentable` lo marca el servidor cuando se puede volver a correr sin duplicar (puede no venir).
  const reintentable = fallo && accion.reintentable;
  const color =
    accion.estado === "ok" ? "border-hd-verde/50 bg-hd-verde/5"
    : fallo ? "border-hd-rojo/50 bg-hd-rojo-bg"
    : abierta && !vencida ? "border-primary/50 bg-primary/5"
    : "border-border opacity-80";
  const resultado = accion.resultado as { venta?: string; url?: string; enviadoA?: string; avisos?: string[] } | null;
  const enCurso = accion.tipo === "enviar_mail" ? "Mandando…" : "Guardando en Odoo…";

  return (
    <div className={`rounded-xl border p-3.5 text-[14px] ${color}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-semibold">{NOMBRE_ACCION[accion.tipo] ?? accion.tipo}</span>
        <span className={`ml-auto text-[13px] ${accion.estado === "ok" ? "text-hd-verde" : fallo ? "text-hd-rojo" : "text-muted-foreground"}`}>
          {ejecutando ? "en curso…" : vencida && abierta ? "vencida" : ESTADO[accion.estado] ?? accion.estado}
        </span>
      </div>
      <p className="whitespace-pre-line text-muted-foreground">{accion.resumen}</p>
      {abierta && !vencida && (
        <div className="mt-3 grid gap-1.5">
          <Button className="h-12 w-full bg-hd-boton text-[16px] text-white hover:bg-hd-boton-hover" disabled={ocupado} onClick={() => onDecidir(accion.id, "confirmar")}>
            {ocupado ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />} {ejecutando ? enCurso : "Confirmar"}
          </Button>
          {!ejecutando && (
            <Button variant="ghost" className="h-11 w-full text-[15px] text-muted-foreground" disabled={ocupado} onClick={() => onDecidir(accion.id, "rechazar")}>
              <X /> Mejor no (descartar)
            </Button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {accion.estado === "ok" && resultado && (
          <div className="mt-2 space-y-1.5">
            {resultado.venta && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p>Quedó como <b>{resultado.venta}</b></p>
                {resultado.url && (
                  <Button variant="outline" className="h-11 px-3.5 text-[15px]" nativeButton={false} render={<a href={resultado.url} target="_blank" rel="noreferrer" />}>
                    Ver en Odoo <ExternalLink />
                  </Button>
                )}
              </div>
            )}
            {resultado.enviadoA && <p>Enviado a <b>{resultado.enviadoA}</b></p>}
            {resultado.avisos?.map((a) => (
              <p key={a} className="flex gap-1.5 text-hd-ambar"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {a}</p>
            ))}
          </div>
        )}
        {fallo && accion.error && <p className="mt-2 text-hd-rojo">{accion.error}</p>}
        {reintentable && (
          <Button variant="outline" className="mt-2.5 h-12 w-full text-[15px]" disabled={ocupado} onClick={() => onDecidir(accion.id, "reintentar")}>
            {ocupado ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}

type Bajada = { estado: "bajando" } | { estado: "listo"; archivo: File } | { estado: "error"; motivo: string };

/**
 * Baja el PDF ANTES de tocar el botón: iOS sólo deja compartir si el share sale del toque, sin
 * una descarga en el medio. Si falla se dice por qué y se puede reintentar.
 */
function usePdfParaCompartir(pdf: PdfVista, activo: boolean) {
  const [bajada, setBajada] = useState<Bajada>({ estado: "bajando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activo || !pdf.url) return;
    let vivo = true;
    fetch(pdf.url)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(r.status === 400 || r.status === 403
            ? "el enlace del PDF venció: recargá la página"
            : `el servidor respondió ${r.status}`);
        }
        // Con la sesión vencida llega la página de login (200, HTML) en vez del PDF.
        if (r.headers.get("content-type")?.includes("text/html")) throw new Error("no llegó el PDF (¿se venció la sesión?): recargá la página");
        return r.blob();
      })
      .then((b) => vivo && setBajada({ estado: "listo", archivo: new File([b], pdf.nombre, { type: "application/pdf" }) }))
      .catch((e: unknown) => {
        if (!vivo) return;
        const sinRed = e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
        setBajada({ estado: "error", motivo: sinRed ? "no hay conexión" : e instanceof Error ? e.message : "error desconocido" });
      });
    return () => {
      vivo = false;
    };
  }, [pdf.url, pdf.nombre, activo, intento]);

  const reintentar = () => {
    setBajada({ estado: "bajando" });
    setIntento((n) => n + 1);
  };
  return { bajada, reintentar };
}

const puedeCompartirArchivos = () => typeof navigator !== "undefined" && "canShare" in navigator;

function AvisoBajada({ bajada, onReintentar }: { bajada: Bajada; onReintentar: () => void }) {
  if (bajada.estado !== "error") return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-hd-rojo" role="alert">
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">No se pudo preparar el PDF para compartir: {bajada.motivo}.</span>
      <Button variant="outline" className="h-11 px-3.5 text-[14px]" onClick={onReintentar}>
        <RotateCcw /> Reintentar
      </Button>
    </div>
  );
}

/**
 * «Mandar al cliente»: el PDF final y el mensaje en una sola tarjeta. El botón grande copia el
 * texto y abre el menú de compartir con el PDF (en el celular, WhatsApp está ahí); sin menú de
 * compartir (la compu) abre WhatsApp con el mensaje escrito y el PDF se adjunta a mano.
 */
export function TarjetaMandar({ pdf, texto, telefono, nombre }: { pdf: PdfVista; texto: string; telefono?: string | null; nombre?: string | null }) {
  const [compartible] = useState(puedeCompartirArchivos);
  const { bajada, reintentar } = usePdfParaCompartir(pdf, compartible);
  // wa.me quiere 549 + característica + número: «1149352126» solo abre un número de EE. UU.
  // Sin un celular que se entienda, WhatsApp pregunta a quién mandarlo.
  const enlace = `https://wa.me/${telefonoWhatsapp(telefono) ?? ""}?text=${encodeURIComponent(texto)}`;
  const archivo = bajada.estado === "listo" ? bajada.archivo : null;
  const conShare = compartible && !!archivo;
  const pila = nombre?.trim().split(/\s+/)[0];

  async function mandar() {
    // El copiado arranca sin esperar: el share tiene que salir del mismo toque.
    const copiado = navigator.clipboard?.writeText(texto).then(() => true, () => false) ?? Promise.resolve(false);
    if (archivo && navigator.canShare?.({ files: [archivo], text: texto })) {
      try {
        await navigator.share({ files: [archivo], text: texto, title: pdf.nombre });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        window.open(enlace, "_blank", "noopener");
      }
      if (await copiado) toast.success("Mensaje copiado", { description: "Si WhatsApp no lo puso solo, pegalo en el chat." });
      return;
    }
    window.open(enlace, "_blank", "noopener");
    if (await copiado) toast.success("Mensaje copiado", { description: "El PDF adjuntalo desde Ver PDF." });
  }

  return (
    <div className="rounded-xl border border-hd-verde/40 bg-hd-verde/5 p-3.5 text-[14px]">
      <p className="mb-2 flex items-center gap-2 font-semibold"><Send className="size-4 text-hd-verde" /> Mandar al cliente</p>
      <div className="mb-2 flex items-center gap-2 text-[13px] text-muted-foreground">
        <FileText className="size-4 shrink-0" /> <span className="min-w-0 truncate" title={pdf.nombre}>{pdf.nombre}</span>
      </div>
      <p className="mb-3 whitespace-pre-line rounded-lg bg-background/60 p-2.5 text-[14px]">{texto}</p>
      <Button
        className="h-auto min-h-12 w-full bg-hd-boton py-2.5 text-[16px] whitespace-normal text-white hover:bg-hd-boton-hover"
        disabled={compartible && bajada.estado === "bajando"}
        onClick={() => void mandar()}
      >
        {compartible && bajada.estado === "bajando" ? <Loader2 className="size-5 animate-spin" /> : <MessageCircle className="size-5" />}
        {compartible && bajada.estado === "bajando"
          ? "Preparando el PDF…"
          : conShare
            ? `Mandar PDF + mensaje${pila ? ` a ${pila}` : ""}`
            : "Abrir WhatsApp con el mensaje"}
      </Button>
      <p className="mt-1 text-center text-[13px] text-muted-foreground">
        {conShare ? "Copia el mensaje y abre el menú de compartir: elegí WhatsApp." : "El mensaje queda copiado; el PDF se adjunta desde Ver PDF."}
      </p>
      <AvisoBajada bajada={bajada} onReintentar={reintentar} />
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 text-[15px]" nativeButton={false} render={<a href={pdf.url} target="_blank" rel="noreferrer" />}>
          <ExternalLink /> Ver PDF
        </Button>
        <Button variant="outline" className="h-11 text-[15px]" onClick={() => void copiar(texto)}>
          <Copy /> Copiar mensaje
        </Button>
      </div>
    </div>
  );
}

/** Un PDF sin mensaje (la vista previa, o un final de antes del mensaje automático). */
export function TarjetaPdf({ pdf }: { pdf: PdfVista }) {
  const [compartible] = useState(puedeCompartirArchivos);
  const { bajada, reintentar } = usePdfParaCompartir(pdf, compartible);
  const archivo = bajada.estado === "listo" ? bajada.archivo : null;

  async function compartir() {
    if (!archivo) return;
    try {
      if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ files: [archivo], title: pdf.nombre });
      else toast.error("Este navegador no deja compartir archivos: descargalo y mandalo desde WhatsApp.");
    } catch {
      // cancelado por el usuario
    }
  }

  return (
    <div className="rounded-xl border border-border p-3.5 text-[14px]">
      <div className="flex items-center gap-3">
        <FileText className={`size-8 shrink-0 ${pdf.tipo === "final" ? "text-primary" : "text-muted-foreground"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={pdf.nombre}>{pdf.nombre}</p>
          <p className="text-[13px] text-muted-foreground">{pdf.tipo === "final" ? "PDF final" : "Vista previa (BORRADOR)"}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 min-w-[8rem] flex-1 text-[15px]" nativeButton={false} render={<a href={pdf.url} target="_blank" rel="noreferrer" />}>
          <ExternalLink /> Ver PDF
        </Button>
        <Button variant="outline" className="h-11 min-w-[8rem] flex-1 text-[15px]" nativeButton={false} render={<a href={pdf.url} download={pdf.nombre} />}>
          <Download /> Descargar
        </Button>
        {compartible && (
          <Button variant="outline" className="h-11 min-w-[8rem] flex-1 text-[15px]" onClick={() => void compartir()} disabled={!archivo}>
            {bajada.estado === "bajando" ? <Loader2 className="animate-spin" /> : <Send />} Compartir
          </Button>
        )}
      </div>
      <AvisoBajada bajada={bajada} onReintentar={reintentar} />
    </div>
  );
}

/** Un mensaje para el cliente sin PDF final al lado. */
export function TarjetaWhatsapp({ texto, telefono }: { texto: string; telefono?: string | null }) {
  const enlace = `https://wa.me/${telefonoWhatsapp(telefono) ?? ""}?text=${encodeURIComponent(texto)}`;
  return (
    <div className="rounded-xl border border-hd-verde/40 bg-hd-verde/5 p-3.5 text-[14px]">
      <p className="mb-1.5 flex items-center gap-2 font-semibold"><MessageCircle className="size-4 text-hd-verde" /> Mensaje para el cliente</p>
      <p className="whitespace-pre-line text-muted-foreground">{texto}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 text-[15px]" onClick={() => void copiar(texto)}>
          <Copy /> Copiar mensaje
        </Button>
        <Button variant="outline" className="h-11 text-[15px]" nativeButton={false} render={<a href={enlace} target="_blank" rel="noreferrer" />}>
          <MessageCircle /> Abrir WhatsApp
        </Button>
      </div>
    </div>
  );
}
