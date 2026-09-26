"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AccionVista, BorradorVista, Evento, PdfVista } from "@/lib/asistente/eventos";
import type { ItemChat } from "@/lib/asistente/vista";
import type { ConversacionListada } from "@/lib/asistente/datos";

// El asistente comercial del lado de la pantalla.
//
// La charla guardada viene de la API (useConversacion). Mientras el asistente responde, lo que
// llega por el stream (texto, herramientas, borrador, acciones, PDFs) se muestra en vivo; al
// terminar el turno se vuelve a leer la conversación y lo guardado reemplaza a lo provisorio.

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

const BASE = "/api/comercial/asistente";

export type DetalleConversacion = {
  conversacion: { id: string; titulo: string | null; modelo: string; propia: boolean };
  items: ItemChat[];
  borrador: BorradorVista | null;
  acciones: AccionVista[];
  pdfs: PdfVista[];
};

export function useConversaciones() {
  return useQuery({
    queryKey: ["asistente-conversaciones"],
    queryFn: async () => (await pedir<{ conversaciones: ConversacionListada[] }>(`${BASE}/conversaciones`)).conversaciones,
    staleTime: 30_000,
  });
}

export function useCrearConversacion() {
  const qc = useQueryClient();
  return useMutation<{ conversacion: { id: string } }, Error, void>({
    mutationFn: () => pedir(`${BASE}/conversaciones`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asistente-conversaciones"] }),
  });
}

export function useArchivarConversacion() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => pedir(`${BASE}/conversaciones/${id}`, { method: "PATCH", body: JSON.stringify({ archivar: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asistente-conversaciones"] }),
  });
}

export function useConversacion(id: string | null) {
  return useQuery({
    queryKey: ["asistente-conversacion", id],
    queryFn: () => pedir<DetalleConversacion>(`${BASE}/conversaciones/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export type Adjunto = { path: string; tipo: string; nombre: string; vista?: string };

/** Achica una foto del celular antes de subirla (el modelo no necesita 12 MP y el 4G agradece). */
async function achicar(archivo: File, lado = 1600): Promise<Blob> {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif") return archivo;
  const bmp = await createImageBitmap(archivo).catch(() => null);
  if (!bmp) return archivo;
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  if (escala === 1 && archivo.size < 1_500_000) return archivo;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b ?? archivo), "image/jpeg", 0.85));
}

export async function subirAdjunto(conversacionId: string, archivo: File): Promise<Adjunto> {
  const cuerpo = await achicar(archivo);
  const tipo = cuerpo === archivo ? archivo.type : "image/jpeg";
  const destino = await pedir<{ path: string; token: string }>(`${BASE}/adjuntos`, {
    method: "POST",
    body: JSON.stringify({ conversacionId, tipo }),
  });
  const { error } = await createClient().storage.from("comercial").uploadToSignedUrl(destino.path, destino.token, cuerpo, { contentType: tipo });
  if (error) throw new Error(`No se pudo subir ${archivo.name}: ${error.message}`);
  return { path: destino.path, tipo, nombre: archivo.name, vista: tipo.startsWith("image/") ? URL.createObjectURL(cuerpo) : undefined };
}

/** Lo que se ve mientras el asistente responde (antes de que se guarde). */
export type EnVivo = {
  vendedor: { texto: string; adjuntos: Adjunto[] } | null;
  texto: string;
  herramientas: { id: string; etiqueta: string; estado: "inicio" | "ok" | "error" }[];
  pensando: boolean;
};

const VACIO: EnVivo = { vendedor: null, texto: "", herramientas: [], pensando: false };

export function useChat(conversacionId: string | null, opciones: { onEvento?: (e: Evento) => void } = {}) {
  const qc = useQueryClient();
  const [enVivo, setEnVivo] = useState<EnVivo>(VACIO);
  const [respondiendo, setRespondiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorVista | null>(null);
  const [acciones, setAcciones] = useState<AccionVista[]>([]);
  const [pdfs, setPdfs] = useState<PdfVista[]>([]);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const corte = useRef<AbortController | null>(null);
  const onEvento = useRef(opciones.onEvento);
  onEvento.current = opciones.onEvento;

  const procesar = useCallback((e: Evento): boolean => {
    onEvento.current?.(e);
    switch (e.t) {
      case "texto":
        setEnVivo((v) => ({ ...v, texto: v.texto + e.d, pensando: false }));
        break;
      case "pensando":
        setEnVivo((v) => ({ ...v, pensando: e.on }));
        break;
      case "herramienta":
        setEnVivo((v) => {
          const otras = v.herramientas.filter((h) => h.id !== e.id);
          return { ...v, herramientas: [...otras, { id: e.id, etiqueta: e.etiqueta, estado: e.estado }] };
        });
        break;
      case "borrador":
        setBorrador(e.borrador);
        break;
      case "accion":
        setAcciones((a) => [e.accion, ...a.filter((x) => x.id !== e.accion.id)]);
        break;
      case "pdf":
        setPdfs((p) => [e.pdf, ...p.filter((x) => x.id !== e.pdf.id)]);
        break;
      case "whatsapp":
        setWhatsapp(e.texto);
        break;
      case "error":
        setError(e.mensaje);
        break;
      case "continuar":
        return true;
    }
    return false;
  }, []);

  const correr = useCallback(
    async (url: string, cuerpo: unknown, vendedor: EnVivo["vendedor"]) => {
      if (!conversacionId) return;
      setError(null);
      setRespondiendo(true);
      setEnVivo({ ...VACIO, vendedor });
      const controlador = new AbortController();
      corte.current = controlador;
      let seguir = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
          signal: controlador.signal,
        });
        if (!res.ok || !res.body) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `Error ${res.status}`);
        }
        const lector = res.body.getReader();
        const decodificador = new TextDecoder();
        let resto = "";
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += decodificador.decode(value, { stream: true });
          const partes = resto.split("\n\n");
          resto = partes.pop() ?? "";
          for (const parte of partes) {
            const linea = parte.split("\n").find((l) => l.startsWith("data: "));
            if (!linea) continue;
            try {
              if (procesar(JSON.parse(linea.slice(6)) as Evento)) seguir = true;
            } catch {
              // una línea rota no corta el resto
            }
          }
        }
      } catch (e) {
        if (!controlador.signal.aborted) setError(e instanceof Error ? e.message : "Se cortó la conexión.");
      } finally {
        corte.current = null;
        await qc.invalidateQueries({ queryKey: ["asistente-conversacion", conversacionId] });
        qc.invalidateQueries({ queryKey: ["asistente-conversaciones"] });
        setEnVivo(VACIO);
        setRespondiendo(false);
      }
      // El turno se cortó por tiempo en medio de muchas herramientas: sigue solo.
      if (seguir) await correr(`${BASE}/chat`, { conversacionId, continuar: true }, null);
    },
    [conversacionId, procesar, qc],
  );

  const enviar = useCallback(
    (texto: string, adjuntos: Adjunto[] = [], canal: "web" | "voz" = "web") =>
      correr(`${BASE}/chat`, { conversacionId, texto, adjuntos: adjuntos.map(({ path, tipo, nombre }) => ({ path, tipo, nombre })), canal }, { texto, adjuntos }),
    [correr, conversacionId],
  );

  const decidir = useCallback(
    (accionId: string, decision: "confirmar" | "rechazar") => correr(`${BASE}/acciones/${accionId}`, { decision }, null),
    [correr],
  );

  const parar = useCallback(() => corte.current?.abort(), []);

  /** Al cambiar de conversación, lo en vivo se descarta. */
  const reiniciar = useCallback(() => {
    setBorrador(null);
    setAcciones([]);
    setPdfs([]);
    setWhatsapp(null);
    setError(null);
  }, []);

  return { enVivo, respondiendo, error, borrador, acciones, pdfs, whatsapp, enviar, decidir, parar, reiniciar, setWhatsapp };
}
