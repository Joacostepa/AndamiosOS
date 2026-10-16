// WhatsApp de clientes: lo que sale por el número de clientes (texto, foto o documento).
//
// Primero la fila del hilo en «enviando» (así se ve aunque Meta tarde), después Meta, y con
// el wamid que devuelve se cruzan los avisos de entrega (webhook.ts → registrarStatuses).
// Si Meta no lo acepta, la fila queda en «error» con el motivo y el error vuelve a quien llamó.
//
// La ventana de 24 h la chequea la ruta ANTES de llamar acá (ventana.ts): el mensaje fijo de
// la etapa 0 sale como respuesta a un mensaje recién llegado, así que siempre está adentro.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorWhatsapp, enviarDocumento, enviarImagen, enviarTexto, numeroClientes } from "@/lib/whatsapp/api";
import { MAX_TEXTO } from "@/lib/whatsapp/formato";
import { explicarError } from "./estados";

const BUCKET = "comercial";
/** Lo que WhatsApp muestra como foto; lo demás sale como documento. */
const IMAGENES = new Set(["image/jpeg", "image/png"]);

/** persona: alguien del equipo · sistema: un texto fijo del servidor · ia: lo que escribió Sofía. */
export type Autor = { autor: "persona"; autorId: string; autorNombre: string } | { autor: "sistema" } | { autor: "ia" };

export class SinNumeroClientes extends Error {
  constructor() {
    super("El número de clientes no está configurado (falta WHATSAPP_CLIENTES_PHONE_NUMBER_ID).");
  }
}

function numero(): string {
  const n = numeroClientes();
  if (!n) throw new SinNumeroClientes();
  return n;
}

async function salir(
  db: SupabaseClient,
  conversacionId: string,
  autor: Autor,
  fila: { tipo: string; texto: string | null; adjunto?: Record<string, unknown> | null },
  resumen: string,
  mandar: () => Promise<string>,
): Promise<{ id: string; wamid: string }> {
  const momento = new Date().toISOString();
  const { data: creada, error } = await db
    .from("cli_hilo")
    .insert({
      conversacion_id: conversacionId,
      direccion: "saliente",
      autor: autor.autor,
      autor_id: autor.autor === "persona" ? autor.autorId : null,
      tipo: fila.tipo,
      texto: fila.texto,
      adjunto: fila.adjunto ?? null,
      estado: "enviando",
      momento,
    })
    .select("id")
    .single();
  if (error || !creada) throw new Error(`No se pudo anotar el mensaje: ${error?.message ?? "sin detalle"}`);
  const id = creada.id as string;
  try {
    const wamid = await mandar();
    await db.from("cli_hilo").update({ wamid: wamid || null, estado: "enviado", estado_at: new Date().toISOString() }).eq("id", id).eq("estado", "enviando");
    const quien = autor.autor === "persona" ? autor.autorNombre : autor.autor === "ia" ? "Sofía" : "ABA";
    await db
      .from("cli_conversaciones")
      .update({ ultimo_mensaje_at: momento, ultimo_resumen: `${quien}: ${resumen}`.slice(0, 160), updated_at: momento })
      .eq("id", conversacionId);
    return { id, wamid };
  } catch (e) {
    const codigo = e instanceof ErrorWhatsapp ? e.codigo : null;
    const detalle = e instanceof ErrorWhatsapp ? explicarError(codigo, e.message) : e instanceof Error ? e.message : String(e);
    await db.from("cli_hilo").update({ estado: "error", estado_at: new Date().toISOString(), error_codigo: codigo, error_detalle: detalle.slice(0, 500) }).eq("id", id);
    throw new Error(detalle);
  }
}

export async function mandarTexto(db: SupabaseClient, conversacionId: string, telefono: string, texto: string, autor: Autor) {
  const t = texto.trim().slice(0, MAX_TEXTO);
  if (!t) throw new Error("El mensaje está vacío.");
  const desde = numero();
  return salir(db, conversacionId, autor, { tipo: "text", texto: t }, t.replace(/\s+/g, " "), async () => {
    const ids = await enviarTexto(telefono, t, desde);
    return ids[0] ?? "";
  });
}

/** Un archivo ya subido a Storage (bucket comercial). WhatsApp lo baja del link firmado. */
export async function mandarArchivo(
  db: SupabaseClient,
  conversacionId: string,
  telefono: string,
  archivo: { path: string; mime: string; nombre: string },
  epigrafe: string | null,
  autor: Autor,
) {
  const desde = numero();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(archivo.path, 3600);
  if (error || !data?.signedUrl) throw new Error(`No se pudo preparar el archivo: ${error?.message ?? "sin URL"}`);
  const foto = IMAGENES.has(archivo.mime);
  const texto = epigrafe?.trim().slice(0, 1000) || null;
  return salir(
    db,
    conversacionId,
    autor,
    { tipo: foto ? "image" : "document", texto, adjunto: { path: archivo.path, mime: archivo.mime, nombre: archivo.nombre } },
    foto ? `Foto${texto ? ` · ${texto}` : ""}` : `Archivo: ${archivo.nombre}`,
    () => (foto ? enviarImagen(telefono, data.signedUrl, texto ?? undefined, desde) : enviarDocumento(telefono, data.signedUrl, archivo.nombre, texto ?? undefined, desde)),
  );
}
