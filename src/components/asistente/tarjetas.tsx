"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Copy, Download, ExternalLink, FileText, Loader2, MessageCircle, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AccionVista, PdfVista } from "@/lib/asistente/eventos";

// Tarjetas que aparecen en el chat: la acción a confirmar, el PDF y el mensaje de WhatsApp.

const NOMBRE_ACCION: Record<string, string> = {
  guardar_presupuesto: "Guardar en Odoo",
  reemitir_presupuesto: "Re-emitir en Odoo",
  enviar_mail: "Mandar por mail",
  crear_cliente: "Dar de alta el cliente",
};

export function TarjetaAccion({
  accion,
  onDecidir,
  ocupado,
}: {
  accion: AccionVista;
  onDecidir: (id: string, d: "confirmar" | "rechazar") => void;
  ocupado: boolean;
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
  const color =
    accion.estado === "ok" ? "border-emerald-500/40 bg-emerald-500/5"
    : accion.estado === "error" || accion.estado === "incierto" ? "border-destructive/40 bg-destructive/5"
    : abierta && !vencida ? "border-primary/50 bg-primary/5"
    : "border-border opacity-70";
  const resultado = accion.resultado as { venta?: string; url?: string; enviadoA?: string; avisos?: string[] } | null;

  return (
    <div className={`rounded-lg border p-3 text-[13px] ${color}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-medium">{NOMBRE_ACCION[accion.tipo] ?? accion.tipo}</span>
        <span className="text-[11px] text-muted-foreground">acción {accion.numero}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {accion.estado === "ok" ? "hecho" : accion.estado === "ejecutando" ? "en curso…" : vencida && abierta ? "vencida" : accion.estado}
        </span>
      </div>
      <p className="whitespace-pre-line text-muted-foreground">{accion.resumen}</p>
      {abierta && !vencida && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" disabled={ocupado} onClick={() => onDecidir(accion.id, "confirmar")}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Check />} Confirmar
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onDecidir(accion.id, "rechazar")}>
            <X /> Descartar
          </Button>
        </div>
      )}
      {accion.estado === "ok" && resultado && (
        <div className="mt-2 space-y-1">
          {resultado.venta && (
            <p>
              Quedó como <b>{resultado.venta}</b>
              {resultado.url && (
                <a href={resultado.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary underline">
                  ver en Odoo <ExternalLink className="size-3" />
                </a>
              )}
            </p>
          )}
          {resultado.enviadoA && <p>Enviado a <b>{resultado.enviadoA}</b></p>}
          {resultado.avisos?.map((a) => (
            <p key={a} className="flex gap-1 text-orange-400"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {a}</p>
          ))}
        </div>
      )}
      {(accion.estado === "error" || accion.estado === "incierto") && accion.error && (
        <p className="mt-2 text-destructive">{accion.error}</p>
      )}
    </div>
  );
}

/**
 * El PDF: ver, descargar y compartir. En el celular, "Compartir" abre el menú nativo y el PDF
 * se manda directo por WhatsApp. El archivo se baja ANTES de tocar el botón: iOS sólo deja
 * compartir si el share sale del toque, sin una descarga en el medio.
 */
export function TarjetaPdf({ pdf }: { pdf: PdfVista }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const puedeCompartir = typeof navigator !== "undefined" && "canShare" in navigator;

  useEffect(() => {
    if (!puedeCompartir || !pdf.url) return;
    let vivo = true;
    fetch(pdf.url)
      .then((r) => r.blob())
      .then((b) => vivo && setArchivo(new File([b], pdf.nombre, { type: "application/pdf" })))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pdf.url, pdf.nombre, puedeCompartir]);

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
    <div className="flex items-center gap-3 rounded-lg border border-border p-3 text-[13px]">
      <FileText className={`size-8 shrink-0 ${pdf.tipo === "final" ? "text-primary" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={pdf.nombre}>{pdf.nombre}</p>
        <p className="text-[11px] text-muted-foreground">{pdf.tipo === "final" ? "PDF final" : "Vista previa (BORRADOR)"}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon-sm" variant="ghost" render={<a href={pdf.url} target="_blank" rel="noreferrer" aria-label="Ver" />}>
          <ExternalLink />
        </Button>
        <Button size="icon-sm" variant="ghost" render={<a href={pdf.url} download={pdf.nombre} aria-label="Descargar" />}>
          <Download />
        </Button>
        {puedeCompartir && (
          <Button size="icon-sm" variant="ghost" onClick={compartir} disabled={!archivo} aria-label="Compartir">
            <Share2 />
          </Button>
        )}
      </div>
    </div>
  );
}

export function TarjetaWhatsapp({ texto, telefono }: { texto: string; telefono?: string | null }) {
  const numero = (telefono ?? "").replace(/\D/g, "");
  const enlace = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  return (
    <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3 text-[13px]">
      <p className="mb-1.5 flex items-center gap-1.5 font-medium"><MessageCircle className="size-4 text-emerald-500" /> Mensaje para el cliente</p>
      <p className="whitespace-pre-line text-muted-foreground">{texto}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(texto).then(() => toast.success("Copiado"))}>
          <Copy /> Copiar
        </Button>
        <Button size="sm" variant="outline" render={<a href={enlace} target="_blank" rel="noreferrer" />}>
          <MessageCircle /> Abrir WhatsApp
        </Button>
      </div>
    </div>
  );
}
