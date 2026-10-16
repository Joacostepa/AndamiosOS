// Un mensaje del cliente, tal cual lo manda Meta → lo que se guarda en el hilo de la bandeja.
// Puro, con tests (entrante.test.ts). Lo usa webhook.ts.
//
// Los adjuntos (audio, foto, documento, video, sticker) NO se bajan acá: quedan como
// «pendiente» con el id de Meta, y webhook.ts los baja enseguida (bajarMedio) y los sube a
// Storage. Los links de Meta vencen: no se puede dejar para cuando alguien abra la charla.

import type { MensajeMeta } from "../whatsapp/tandas.ts";

type Medio = { id: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean };

/** Lo que manda Meta, con los tipos que el asistente de vendedores no usa. */
export type MensajeCliente = MensajeMeta & {
  video?: Medio;
  sticker?: Medio;
  reaction?: { message_id?: string; emoji?: string };
  interactive?: MensajeMeta["interactive"] & { list_reply?: { id: string; title?: string } };
  errors?: { code?: number; title?: string }[];
};

export type AdjuntoPendiente = { media_id: string; mime: string | null; nombre: string; pendiente: true };
export type AdjuntoUbicacion = { lat: number; lng: number; nombre: string | null; direccion: string | null };

export type EntradaHilo = {
  tipo: string;
  texto: string | null;
  adjunto: AdjuntoPendiente | AdjuntoUbicacion | null;
  /** La última línea en la lista de charlas. */
  resumen: string;
  respondeA: string | null;
};

const EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

export function extension(mime: string | null | undefined): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return EXT[m] ?? (m.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin");
}

/** Un nombre de archivo que sirve en un path de Storage. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  return (limpio || "archivo").slice(-80);
}

const recortar = (t: string, n = 120) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function medio(tipo: string, m: Medio, wamid: string): AdjuntoPendiente {
  const sufijo = wamid.replace(/[^\w]/g, "").slice(-8) || "x";
  const base = { audio: "audio", image: "foto", video: "video", sticker: "sticker", document: "archivo" }[tipo] ?? "archivo";
  return {
    media_id: m.id,
    mime: m.mime_type?.split(";")[0].trim() || null,
    nombre: m.filename?.trim() || `${base}-${sufijo}.${extension(m.mime_type)}`,
    pendiente: true,
  };
}

export function leerEntrante(m: MensajeCliente): EntradaHilo {
  const respondeA = m.context?.id ?? null;
  const base = { respondeA };
  switch (m.type) {
    case "text": {
      const t = m.text?.body?.trim() || "";
      return { ...base, tipo: "text", texto: t, adjunto: null, resumen: recortar(t) || "(mensaje vacío)" };
    }
    case "audio":
    case "image":
    case "document":
    case "video":
    case "sticker": {
      const md = (m as unknown as Record<string, unknown>)[m.type] as Medio | undefined;
      const caption = md?.caption?.trim() || null;
      if (!md?.id) return { ...base, tipo: m.type, texto: caption, adjunto: null, resumen: "Adjunto que no se pudo leer" };
      const adj = medio(m.type, md, m.id);
      const que = { audio: "Audio", image: "Foto", video: "Video", sticker: "Sticker", document: `Archivo: ${adj.nombre}` }[m.type]!;
      return { ...base, tipo: m.type, texto: caption, adjunto: adj, resumen: caption ? `${que} · ${recortar(caption, 80)}` : que };
    }
    case "location": {
      const l = m.location;
      if (!l) return { ...base, tipo: "location", texto: null, adjunto: null, resumen: "Ubicación" };
      const nombre = [l.name, l.address].filter(Boolean).join(", ") || null;
      return {
        ...base,
        tipo: "location",
        texto: nombre,
        adjunto: { lat: l.latitude, lng: l.longitude, nombre: l.name ?? null, direccion: l.address ?? null },
        resumen: nombre ? `Ubicación: ${recortar(nombre, 80)}` : "Ubicación compartida",
      };
    }
    case "interactive": {
      const t = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
      return { ...base, tipo: "interactive", texto: t || null, adjunto: null, resumen: t ? `Tocó «${recortar(t, 60)}»` : "Tocó un botón" };
    }
    case "button": {
      const t = m.button?.text ?? m.button?.payload ?? "";
      return { ...base, tipo: "button", texto: t || null, adjunto: null, resumen: t ? `Tocó «${recortar(t, 60)}»` : "Tocó un botón" };
    }
    case "reaction": {
      const e = m.reaction?.emoji;
      // Una reacción vacía es «sacó la reacción».
      return { ...base, tipo: "reaction", texto: e ? `Reaccionó con ${e}` : "Sacó su reacción", adjunto: null, resumen: e ? `Reaccionó con ${e}` : "Sacó su reacción", respondeA: m.reaction?.message_id ?? respondeA };
    }
    default: {
      const motivo = m.errors?.[0]?.title;
      return { ...base, tipo: "otro", texto: `[Mandó algo que WhatsApp no deja leer desde la API${motivo ? `: ${motivo}` : ""}. Pedile que lo mande de otra forma.]`, adjunto: null, resumen: "Mensaje que no se puede leer" };
    }
  }
}

/** «BAJA» y parecidos: no quiere más mensajes de seguimiento (§8). Sólo el mensaje entero. */
export function esBaja(texto: string | null | undefined): boolean {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return ["baja", "stop", "darme de baja", "dar de baja", "no quiero mas mensajes", "no me escriban mas"].includes(t);
}

/**
 * El mensaje fijo de la etapa 0 (apagado por defecto: WHATSAPP_CLIENTES_RESPUESTA_FIJA=1 lo
 * prende). Sale UNA vez cuando la charla es nueva o se reabre, y nunca a quien pidió la baja.
 */
export function debeResponderFijo(p: { activado: boolean; nueva: boolean; reabierta: boolean; optOut: boolean }): boolean {
  return p.activado && (p.nueva || p.reabierta) && !p.optOut;
}

export function respuestaFijaActivada(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "si", "sí", "true", "on"].includes((env.WHATSAPP_CLIENTES_RESPUESTA_FIJA ?? "").trim().toLowerCase());
}

/** El texto fijo (escenario 13 de la propuesta): sin prometer horas ni nombres. */
export const RESPUESTA_FIJA = "Hola, gracias por escribir a Andamios Buenos Aires. En un rato te escribe una persona del equipo.";
