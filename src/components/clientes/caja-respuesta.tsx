"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { motivoVentanaCerrada, ventana, duracion } from "@/lib/clientes/ventana";
import type { CharlaListada } from "@/lib/clientes/vista";
import { subirArchivo, useResponder, type ArchivoSubido } from "@/hooks/use-clientes-whatsapp";

// La caja para contestarle al cliente desde la app (docs/clientes/crm-propuesta.md §7):
// texto, foto o documento. Dentro de las 24 h se manda gratis; afuera WhatsApp sólo deja
// plantillas (todavía no están en la app), así que la caja se apaga y dice por qué.
// Si nadie tenía la charla, al escribir pasa a ser de quien escribe.

const ACEPTA = "image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,.txt";

export function CajaRespuesta({ charla, yo, ahora, numeroConfigurado }: { charla: CharlaListada; yo: string; ahora: number; numeroConfigurado: boolean }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<ArchivoSubido | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const responder = useResponder(charla.id);

  const v = ventana(charla.ultimoEntranteAt, ahora);
  const cerrada = motivoVentanaCerrada(charla.ultimoEntranteAt, ahora);
  const mia = charla.estado === "humano" && charla.asistente?.id === yo;
  const deshabilitada = !!cerrada || !numeroConfigurado;
  const ocupada = subiendo || responder.isPending;

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      setArchivo(await subirArchivo(charla.id, f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if ((!t && !archivo) || ocupada || deshabilitada) return;
    responder.mutate(
      { texto: t || undefined, archivo: archivo ?? undefined },
      {
        onSuccess: () => {
          setTexto("");
          setArchivo(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="border-t border-border bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="mb-1.5 text-[12.5px] text-muted-foreground">
        {!numeroConfigurado
          ? "Falta configurar el número de clientes (WHATSAPP_CLIENTES_PHONE_NUMBER_ID): por ahora no se puede mandar nada."
          : cerrada
            ? cerrada
            : `Ventana de 24 h: quedan ${duracion(v.restanteMs)} para contestar gratis.${mia ? "" : " Si escribís, la charla pasa a ser tuya."}`}
      </p>
      {archivo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13.5px]">
          {archivo.mime.startsWith("image/") ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{archivo.nombre}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">el texto va como epígrafe</span>
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setArchivo(null)} aria-label={`Sacar ${archivo.nombre}`}>
            <X />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={input} type="file" accept={ACEPTA} className="hidden" onChange={(e) => void elegir(e.target.files?.[0])} />
        <Button
          variant="ghost"
          size="icon"
          className="size-11 [&_svg:not([class*='size-'])]:size-5"
          onClick={() => input.current?.click()}
          disabled={deshabilitada || ocupada || !!archivo}
          aria-label="Adjuntar foto o documento"
          title="Adjuntar foto (JPG, PNG) o documento (PDF, Word, Excel)"
        >
          {subiendo ? <Loader2 className="animate-spin" /> : <Paperclip />}
        </Button>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // En la compu, Enter manda y Shift+Enter baja de línea; en el celular, Enter baja de línea.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={deshabilitada}
          placeholder={deshabilitada ? (cerrada ? "Ventana cerrada: sólo plantillas" : "Sin número de clientes") : `Escribile a ${charla.nombre?.split(" ")[0] || "el cliente"}`}
          aria-label="Mensaje para el cliente"
          className="field-sizing-content max-h-48 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-[16px] outline-none focus-visible:border-ring disabled:opacity-60"
        />
        <Button
          size="icon"
          className="size-11 bg-hd-boton text-white hover:bg-hd-boton-hover [&_svg:not([class*='size-'])]:size-5"
          onClick={enviar}
          disabled={deshabilitada || ocupada || (!texto.trim() && !archivo)}
          aria-label="Enviar"
        >
          {responder.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
    </div>
  );
}
