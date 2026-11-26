"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FileText, ImageIcon, Loader2, Mic, Paperclip, SendHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { motivoVentanaCerrada, ventana, duracion } from "@/lib/clientes/ventana";
import type { CharlaListada } from "@/lib/clientes/vista";
import { subirArchivo, useResponder, type ArchivoSubido } from "@/hooks/use-clientes-whatsapp";

// La caja para contestarle al cliente desde la app (docs/sofia/crm-propuesta.md §7):
// texto, foto o documento. Dentro de las 24 h se manda gratis; afuera WhatsApp sólo deja
// plantillas (todavía no están en la app), así que la caja se apaga y dice por qué.
// Si nadie tenía la charla, al escribir pasa a ser de quien escribe.
//
// JS, 26/11: una captura (o cualquier imagen) pegada en la caja se adjunta como foto, y con la
// caja vacía el botón de mandar es un micrófono: graba un audio que le llega al cliente como
// nota de voz (el servidor lo pasa a Ogg con Opus, audio-saliente.ts).

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

  const grabador = useGrabador();

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      setArchivo(await subirArchivo(charla.id, await entraEnWhatsapp(f)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };

  // Una imagen pegada (una captura): se adjunta como foto. Si el portapapeles trae texto (una
  // celda de Excel, un párrafo de Word), se pega el texto como siempre.
  const pegar = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.getData("text/plain")) return;
    const imagen = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!imagen) return;
    e.preventDefault();
    if (archivo) {
      toast.error("Ya hay un archivo adjunto: mandalo o sacalo antes de pegar otro.");
      return;
    }
    if (ocupada || deshabilitada) return;
    void comoFoto(imagen)
      .then((f) => elegir(f))
      .catch(() => toast.error("No se pudo usar esa imagen: guardala y adjuntala con el clip."));
  };

  // La grabación queda hasta que sale: si falla la subida o el envío, se puede volver a mandar.
  const mandarGrabacion = async () => {
    if (ocupada) return;
    setSubiendo(true);
    let subido: ArchivoSubido;
    try {
      const grabado = await grabador.terminar();
      if (!grabado) return;
      if (grabado.segundos < 1) {
        toast.error("El audio quedó muy corto: grabalo de nuevo un poco más largo.");
        grabador.descartar();
        return;
      }
      subido = await subirArchivo(charla.id, grabado.archivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el audio.");
      return;
    } finally {
      setSubiendo(false);
    }
    responder.mutate({ archivo: subido }, { onSuccess: () => grabador.descartar(), onError: (e) => toast.error(`${e.message} El audio sigue acá para volver a mandarlo.`) });
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
      {grabador.estado ? (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-destructive [&_svg:not([class*='size-'])]:size-5"
            onClick={grabador.descartar}
            disabled={ocupada}
            aria-label="Descartar el audio"
            title="Descartar el audio"
          >
            <Trash2 />
          </Button>
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input px-3.5 text-[15px]">
            {grabador.estado.fase === "grabando" ? (
              <>
                <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
                <span className="tabular-nums">{reloj(grabador.estado.segundos)}</span>
                <span className="truncate text-muted-foreground">Grabando… (hasta {reloj(MAX_SEGUNDOS)})</span>
              </>
            ) : (
              <audio controls src={grabador.estado.url} className="h-9 min-w-0 flex-1" aria-label="El audio grabado" />
            )}
          </div>
          <Button
            size="icon"
            className="size-11 bg-hd-boton text-white hover:bg-hd-boton-hover [&_svg:not([class*='size-'])]:size-5"
            onClick={() => void mandarGrabacion()}
            disabled={ocupada || deshabilitada}
            aria-label="Mandar el audio"
          >
            {ocupada ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input ref={input} type="file" accept={ACEPTA} className="hidden" onChange={(e) => void elegir(e.target.files?.[0])} />
          <Button
            variant="ghost"
            size="icon"
            className="size-11 [&_svg:not([class*='size-'])]:size-5"
            onClick={() => input.current?.click()}
            disabled={deshabilitada || ocupada || !!archivo}
            aria-label="Adjuntar foto o documento"
            title="Adjuntar foto (JPG, PNG) o documento (PDF, Word, Excel). Una captura también se puede pegar en la caja."
          >
            {subiendo ? <Loader2 className="animate-spin" /> : <Paperclip />}
          </Button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={pegar}
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
          {!texto.trim() && !archivo && grabador.puede ? (
            <Button
              size="icon"
              className="size-11 bg-hd-boton text-white hover:bg-hd-boton-hover [&_svg:not([class*='size-'])]:size-5"
              onClick={() => void grabador.empezar()}
              disabled={deshabilitada || ocupada}
              aria-label="Grabar un audio"
              title="Grabar un audio: le llega como nota de voz"
            >
              {ocupada ? <Loader2 className="animate-spin" /> : <Mic />}
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-11 bg-hd-boton text-white hover:bg-hd-boton-hover [&_svg:not([class*='size-'])]:size-5"
              onClick={enviar}
              disabled={deshabilitada || ocupada || (!texto.trim() && !archivo)}
              aria-label="Enviar"
            >
              {responder.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_SEGUNDOS = 5 * 60;

function reloj(segundos: number): string {
  const s = Math.floor(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Una imagen pegada → JPG o PNG (lo único que WhatsApp muestra como foto), con un nombre útil. */
async function comoFoto(f: File): Promise<File> {
  const ahora = new Date();
  const sello = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, "0")}${String(ahora.getDate()).padStart(2, "0")}-${String(ahora.getHours()).padStart(2, "0")}${String(ahora.getMinutes()).padStart(2, "0")}`;
  if (f.type === "image/png" || f.type === "image/jpeg") {
    const generico = !f.name || /^image\.(png|jpe?g)$/i.test(f.name);
    return generico ? new File([f], `captura-${sello}.${f.type === "image/png" ? "png" : "jpg"}`, { type: f.type }) : f;
  }
  // Otra (WebP, GIF, HEIC si el navegador la lee): se redibuja como PNG.
  const bmp = await createImageBitmap(f);
  const lienzo = document.createElement("canvas");
  lienzo.width = bmp.width;
  lienzo.height = bmp.height;
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0);
  const png = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/png"));
  if (!png) throw new Error("No se pudo convertir la imagen.");
  return new File([png], `captura-${sello}.png`, { type: "image/png" });
}

/** WhatsApp rechaza fotos de más de 5 MB: una más grande (una captura de pantalla Retina) se pasa a JPG. */
const MAX_FOTO = 4.5 * 1024 * 1024;

async function entraEnWhatsapp(f: File): Promise<File> {
  if (!(f.type === "image/png" || f.type === "image/jpeg") || f.size <= MAX_FOTO) return f;
  const bmp = await createImageBitmap(f);
  for (const [escala, calidad] of [[1, 0.85], [0.7, 0.8], [0.5, 0.75]] as const) {
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const jpg = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", calidad));
    if (jpg && jpg.size <= MAX_FOTO) return new File([jpg], f.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  }
  return f;
}

/** Lo que puede grabar este navegador, en orden de preferencia (Opus primero). */
function formatoGrabacion(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
}

function extension(mime: string): string {
  const base = mime.split(";")[0].trim();
  return base === "audio/ogg" ? "ogg" : base === "audio/mp4" || base === "audio/x-m4a" ? "m4a" : base === "audio/aac" ? "aac" : base === "audio/mpeg" ? "mp3" : "webm";
}

const nadaQueEscuchar = () => () => {};

type Grabado = { archivo: File; segundos: number; url: string };
type EstadoGrabacion = { fase: "grabando"; segundos: number } | { fase: "lista"; segundos: number; url: string };

/**
 * Grabar un audio con el micrófono (MediaRecorder).
 * - «empezar» pide el micrófono y graba (un segundo clic mientras el navegador pregunta no
 *   arranca otra grabación).
 * - Cuando la grabación para, por lo que sea (5 minutos, «terminar», una llamada en el iPhone que
 *   corta el micrófono), queda «lista»: se puede escuchar y mandar.
 * - «terminar» la corta y devuelve el archivo SIN tirarlo: se tira con «descartar» cuando salió,
 *   así un envío que falla se puede repetir.
 * - «descartar» corta y tira; lo que estuviera terminando de armarse ya no vuelve.
 */
function useGrabador() {
  const [estado, setEstado] = useState<EstadoGrabacion | null>(null);
  const puede = useSyncExternalStore(
    nadaQueEscuchar,
    () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
    () => false,
  );
  const montado = useRef(true);
  const arrancando = useRef(false);
  /** Sube con cada descarte: lo que se termine de armar de una grabación vieja se tira. */
  const vuelta = useRef(0);
  const rec = useRef<{ recorder: MediaRecorder; terminada: Promise<Grabado | null> } | null>(null);
  const lista = useRef<Grabado | null>(null);

  const soltarLista = () => {
    if (lista.current) URL.revokeObjectURL(lista.current.url);
    lista.current = null;
  };

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      vuelta.current++;
      const r = rec.current;
      if (r && r.recorder.state !== "inactive") r.recorder.stop();
      rec.current = null;
      soltarLista();
    };
  }, []);

  const empezar = async () => {
    if (arrancando.current || rec.current || lista.current) return;
    arrancando.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("El navegador no dejó usar el micrófono: habilitalo para esta página (el candado de la barra de direcciones) y probá de nuevo.");
      return;
    } finally {
      arrancando.current = false;
    }
    const soltarMicrofono = () => stream.getTracks().forEach((t) => t.stop());
    if (!montado.current) return soltarMicrofono();

    const miVuelta = vuelta.current;
    const tipo = formatoGrabacion();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    } catch {
      soltarMicrofono();
      toast.error("Este navegador no puede grabar audio.");
      return;
    }
    const partes: Blob[] = [];
    const desde = Date.now();
    const reloj = setInterval(() => {
      const segundos = (Date.now() - desde) / 1000;
      if (segundos >= MAX_SEGUNDOS) {
        clearInterval(reloj);
        if (recorder.state !== "inactive") recorder.stop();
      } else if (vuelta.current === miVuelta && montado.current) setEstado({ fase: "grabando", segundos });
    }, 250);
    recorder.addEventListener("dataavailable", (e) => e.data.size && partes.push(e.data));
    recorder.addEventListener("error", () => recorder.state !== "inactive" && recorder.stop());
    const terminada = new Promise<Grabado | null>((resolver) => {
      recorder.addEventListener(
        "stop",
        () => {
          clearInterval(reloj);
          soltarMicrofono();
          if (rec.current?.recorder === recorder) rec.current = null;
          // Descartada (o se cerró la charla) mientras terminaba: no vuelve.
          if (vuelta.current !== miVuelta || !montado.current) return resolver(null);
          const mime = recorder.mimeType || partes[0]?.type || tipo || "audio/webm";
          const blob = new Blob(partes, { type: mime });
          if (!blob.size) {
            setEstado(null);
            toast.error("No se grabó nada: revisá el micrófono y probá de nuevo.");
            return resolver(null);
          }
          const url = URL.createObjectURL(blob);
          const g: Grabado = { archivo: new File([blob], `audio.${extension(mime)}`, { type: mime }), segundos: (Date.now() - desde) / 1000, url };
          lista.current = g;
          setEstado({ fase: "lista", segundos: g.segundos, url });
          resolver(g);
        },
        { once: true },
      );
    });
    try {
      recorder.start(1000);
    } catch {
      clearInterval(reloj);
      soltarMicrofono();
      toast.error("No se pudo empezar a grabar.");
      return;
    }
    rec.current = { recorder, terminada };
    setEstado({ fase: "grabando", segundos: 0 });
  };

  /** Para mandar: corta si está grabando y devuelve la grabación (queda hasta «descartar»). */
  const terminar = async (): Promise<Grabado | null> => {
    const r = rec.current;
    if (r) {
      if (r.recorder.state !== "inactive") r.recorder.stop();
      return r.terminada;
    }
    return lista.current;
  };

  const descartar = () => {
    vuelta.current++;
    const r = rec.current;
    rec.current = null;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
    soltarLista();
    setEstado(null);
  };

  return { estado, puede, empezar, terminar, descartar };
}
