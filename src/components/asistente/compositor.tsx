"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AudioLines, FileText, Loader2, Mic, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { subirAdjunto, type Adjunto } from "@/hooks/use-asistente";

// Donde se escribe. Pensado para el celular:
//   · el teclado del teléfono ya dicta (el micrófono del teclado funciona en cualquier campo);
//   · el micrófono de acá graba un audio largo y lo transcribe (ElevenLabs), y el texto queda
//     en el cuadro para mirarlo antes de mandarlo;
//   · el clip sube fotos (de la cámara o la galería), planos en PDF o un audio reenviado;
//   · una captura de pantalla se pega con Ctrl/Cmd+V, en el cuadro o en cualquier parte del chat;
//   · UN botón de voz: un toque graba un audio (y lo transcribe); mantenerlo apretado medio
//     segundo y soltar abre la voz en vivo. Se arranca al SOLTAR porque en el celular el toque
//     que habilita el micrófono y el audio es el que termina (pointerup), no el que empieza;
//   · todo lo que se toca mide 44 px, y abajo deja lugar a la barra del iPhone (safe area).

/** Lo que la pantalla puede hacer con el cuadro: las sugerencias lo llenan, no se mandan solas. */
export type CompositorApi = { poner: (texto: string) => void };

const MANTENER_MS = 500;

async function pedirJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(j?.error ?? `Error ${res.status}`);
  return j as T;
}

export function Compositor({
  conversacionId,
  respondiendo,
  onEnviar,
  onParar,
  transcripcionDisponible,
  onHablar,
  textoInicial = "",
  ref,
}: {
  conversacionId: string;
  respondiendo: boolean;
  /** `false` si el mensaje no llegó a arrancar: el texto vuelve al cuadro. */
  onEnviar: (texto: string, adjuntos: Adjunto[]) => void | Promise<boolean>;
  /** Sin onParar el turno no lo sigue esta pantalla (se recargó a mitad): no hay qué cortar. */
  onParar?: () => void;
  transcripcionDisponible: boolean;
  onHablar?: () => void;
  /** Con qué arranca el cuadro (la sugerencia que se tocó antes de que existiera la charla). */
  textoInicial?: string;
  ref?: Ref<CompositorApi>;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [manteniendo, setManteniendo] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const largo = useRef(false);
  const ignorarClick = useRef(false);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [subiendo, setSubiendo] = useState(0);
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const archivos = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);

  useImperativeHandle(ref, () => ({
    poner: (t: string) => {
      setTexto(t);
      // Al final, para seguir escribiendo («Editar el S0…» → el número).
      requestAnimationFrame(() => {
        const a = area.current;
        if (!a) return;
        a.focus();
        a.setSelectionRange(a.value.length, a.value.length);
      });
    },
  }), []);

  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 220)}px`;
  }, [texto]);

  // Se escucha en todo el documento: después de tocar el hilo el foco ya no está en el cuadro,
  // y el Ctrl+V tiene que andar igual. Si se pega en otro campo (el panel del borrador), no se toca.
  const pegar = useEffectEvent((e: ClipboardEvent) => {
    const destino = e.target as HTMLElement | null;
    const otroCampo = destino !== area.current && (destino instanceof HTMLInputElement || destino instanceof HTMLTextAreaElement || !!destino?.isContentEditable);
    if (otroCampo || !e.clipboardData) return;
    const lista = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!lista.length) return;
    // Copiar celdas de Excel o un párrafo de Word trae el texto y además una imagen de lo
    // copiado: ahí se quiere el texto. Un archivo copiado del Finder trae su nombre como texto.
    const texto = e.clipboardData.getData("text/plain").trim();
    if (texto && !lista.some((f) => texto.includes(f.name))) return;
    e.preventDefault();
    void agregar(lista);
  });

  useEffect(() => {
    const oyente = (e: ClipboardEvent) => pegar(e);
    document.addEventListener("paste", oyente);
    return () => document.removeEventListener("paste", oyente);
  }, []);

  async function agregar(lista: FileList | File[] | null) {
    if (!lista?.length) return;
    for (const f of Array.from(lista)) {
      if (f.type.startsWith("audio/")) {
        await transcribirArchivo(f);
        continue;
      }
      setSubiendo((n) => n + 1);
      try {
        const a = await subirAdjunto(conversacionId, f);
        setAdjuntos((x) => [...x, a]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo");
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
    if (archivos.current) archivos.current.value = "";
  }

  async function transcribirArchivo(f: File | Blob, nombre = "audio.webm") {
    setTranscribiendo(true);
    try {
      const archivo = f instanceof File ? f : new File([f], nombre, { type: f.type || "audio/webm" });
      const subido = await subirAdjunto(conversacionId, archivo);
      const r = await pedirJson<{ texto: string }>("/api/comercial/asistente/transcribir", { conversacionId, path: subido.path, tipo: subido.tipo });
      if (!r.texto) toast.error("No se entendió nada en el audio.");
      else setTexto((t) => (t ? `${t} ${r.texto}` : r.texto));
      area.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo transcribir el audio");
    } finally {
      setTranscribiendo(false);
    }
  }

  async function alternarGrabacion() {
    if (grabando) {
      grabador.current?.stop();
      return;
    }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const tipo = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const r = new MediaRecorder(flujo, { mimeType: tipo });
      trozos.current = [];
      r.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
      r.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        const blob = new Blob(trozos.current, { type: tipo });
        if (blob.size > 1000) void transcribirArchivo(blob, tipo === "audio/webm" ? "audio.webm" : "audio.m4a");
      };
      grabador.current = r;
      r.start();
      setGrabando(true);
    } catch {
      toast.error("No se pudo usar el micrófono: revisá el permiso del navegador.");
    }
  }

  function enviar() {
    const t = texto.trim();
    if ((!t && !adjuntos.length) || respondiendo || subiendo) return;
    const enviados = adjuntos;
    // Si no llegó (sin señal en obra, el tope del día, un turno en curso), lo escrito vuelve al
    // cuadro en vez de perderse; el error lo muestra la pantalla.
    void Promise.resolve(onEnviar(t, enviados)).then((llego) => {
      if (llego !== false) return;
      setTexto((ahora) => ahora || t);
      setAdjuntos((ahora) => (ahora.length ? ahora : enviados));
    });
    setTexto("");
    setAdjuntos([]);
  }

  const tactil = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  // El botón de voz. Con las dos cosas disponibles: toque = audio, mantener y soltar = en vivo.
  const conAudio = transcripcionDisponible;
  const conVivo = !!onHablar;
  const cortarMantener = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setManteniendo(false);
  };
  const vozAbajo = () => {
    largo.current = false;
    if (!conVivo || !conAudio || grabando) return;
    temporizador.current = setTimeout(() => {
      largo.current = true;
      setManteniendo(true);
      navigator.vibrate?.(15);
    }, MANTENER_MS);
  };
  const vozArriba = () => {
    cortarMantener();
    if (!largo.current) return;
    largo.current = false;
    ignorarClick.current = true;
    onHablar?.();
  };
  const vozCancelada = () => {
    cortarMantener();
    largo.current = false;
  };
  const vozClick = () => {
    if (ignorarClick.current) {
      ignorarClick.current = false;
      return;
    }
    if (conAudio) void alternarGrabacion();
    else onHablar?.();
  };
  const etiquetaVoz = grabando
    ? "Terminar de grabar"
    : conAudio && conVivo
      ? "Grabar un audio (mantené apretado y soltá para hablar en vivo)"
      : conAudio ? "Grabar un audio" : "Hablar en vivo con el asistente";

  return (
    <div className="border-t border-border bg-background px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {manteniendo && (
        <p role="status" className="mb-2 rounded-lg bg-primary/10 px-3 py-2 text-center text-[14px] font-medium">Soltá para hablar en vivo</p>
      )}
      {(adjuntos.length > 0 || subiendo > 0) && (
        <div className="mb-2 flex flex-wrap gap-3 pt-1">
          {adjuntos.map((a, i) => (
            <div key={a.path} className="relative">
              {a.vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista local de lo que se va a mandar
                <img src={a.vista} alt={a.nombre} className="size-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 items-center gap-1 rounded-md border border-border px-2 text-[12px]"><FileText className="size-4" />{a.nombre}</div>
              )}
              <button className="absolute -top-3 -right-3 flex size-11 items-center justify-center" onClick={() => setAdjuntos((x) => x.filter((_, j) => j !== i))} aria-label={`Sacar ${a.nombre}`}>
                <span className="rounded-full bg-background p-1 shadow"><X className="size-3.5" /></span>
              </button>
            </div>
          ))}
          {subiendo > 0 && <div className="flex size-14 items-center justify-center rounded-md border border-dashed border-border"><Loader2 className="size-4 animate-spin" /></div>}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={archivos} type="file" multiple accept="image/*,application/pdf,audio/*" className="hidden" onChange={(e) => agregar(e.target.files)} />
        <Button variant="ghost" size="icon" className="size-11 [&_svg:not([class*='size-'])]:size-5" onClick={() => archivos.current?.click()} aria-label="Adjuntar foto, plano o audio" title="Adjuntar foto, plano o audio (una captura también se pega con Ctrl+V)" disabled={respondiendo}>
          <Paperclip />
        </Button>
        <textarea
          ref={area}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !tactil) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder={transcribiendo ? "Transcribiendo el audio…" : grabando ? "Grabando… tocá el cuadrado para terminar" : "Contame qué hay que cotizar o qué necesitás"}
          className="max-h-56 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-[16px] outline-none focus-visible:border-ring"
        />
        {(conAudio || conVivo) && (
          <Button
            variant={grabando ? "destructive" : "ghost"}
            size="icon"
            className={cn("size-11 touch-none select-none [-webkit-touch-callout:none] [&_svg:not([class*='size-'])]:size-5", manteniendo && "bg-primary/15")}
            onClick={vozClick}
            onPointerDown={vozAbajo}
            onPointerUp={vozArriba}
            onPointerLeave={vozCancelada}
            onPointerCancel={vozCancelada}
            onContextMenu={(e) => e.preventDefault()}
            disabled={transcribiendo || respondiendo}
            aria-label={etiquetaVoz}
            title={etiquetaVoz}
          >
            {transcribiendo ? <Loader2 className="animate-spin" /> : grabando ? <Square /> : conAudio ? <Mic /> : <AudioLines />}
          </Button>
        )}
        {respondiendo && onParar ? (
          <Button size="icon" variant="outline" className="size-11 [&_svg:not([class*='size-'])]:size-5" onClick={onParar} aria-label="Parar"><Square /></Button>
        ) : respondiendo ? (
          <Button size="icon" variant="outline" className="size-11" disabled aria-label="El asistente está respondiendo"><Loader2 className="size-5 animate-spin" /></Button>
        ) : (
          <Button size="icon" className="size-11 bg-hd-boton text-white hover:bg-hd-boton-hover [&_svg:not([class*='size-'])]:size-5" onClick={enviar} disabled={(!texto.trim() && !adjuntos.length) || subiendo > 0} aria-label="Enviar">
            <SendHorizontal />
          </Button>
        )}
      </div>
    </div>
  );
}
