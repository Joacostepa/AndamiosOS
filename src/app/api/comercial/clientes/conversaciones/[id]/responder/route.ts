import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstado, leerCharla, nombresDe } from "@/lib/clientes/bandeja";
import { SinNumeroClientes, mandarArchivo, mandarAudio, mandarTexto, type Autor } from "@/lib/clientes/envio";
import { AUDIOS_GRABADOS, aNotaDeVoz } from "@/lib/clientes/audio-saliente";
import { motivoVentanaCerrada } from "@/lib/clientes/ventana";
import { MAX_TEXTO } from "@/lib/whatsapp/formato";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/clientes/conversaciones/:id/responder — contestarle al cliente desde la
// app, por el número de clientes: { texto } o { archivo: { path, mime, nombre }, texto? }
// (el archivo ya subido con /adjuntos; el texto va como epígrafe). Un audio grabado en la
// bandeja (JS, 26/11) se pasa a Ogg con Opus y sale como nota de voz; si vino con texto, el
// texto sale después, aparte (un audio no lleva epígrafe).
//
// - Sólo dentro de la ventana de 24 h (ventana.ts). Afuera, WhatsApp sólo deja plantillas,
//   que todavía no están: se rechaza y se dice por qué.
// - Si la tiene otra persona, no: primero hay que tomarla (§7: «la tiene Sandra», sólo lectura).
// - Si nadie la tenía, al escribir pasa a ser de quien escribe (§7).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z
  .object({
    texto: z.string().max(MAX_TEXTO, `El mensaje no puede pasar de ${MAX_TEXTO} caracteres.`).optional(),
    archivo: z.object({ path: z.string().min(1).max(300), mime: z.string().min(1).max(120), nombre: z.string().trim().min(1).max(200) }).optional(),
  })
  .refine((b) => !!b.archivo || !!b.texto?.trim(), "El mensaje está vacío.");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  const { texto, archivo } = parsed.data;
  // El archivo tiene que ser uno subido para ESTA charla (el path lo da /adjuntos).
  if (archivo && (!archivo.path.startsWith(`clientes/${id}/salientes/`) || archivo.path.includes(".."))) return invalido("Ese archivo no es de esta charla.");
  try {
    const db = createAdminClient();
    const charla = await leerCharla(db, id);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    if (charla.estado === "humano" && charla.asistente && charla.asistente.id !== quien.userId) {
      return NextResponse.json({ error: `La tiene ${charla.asistente.nombre}: tomala para escribirle.` }, { status: 409 });
    }
    const cerrada = motivoVentanaCerrada(charla.ultimoEntranteAt);
    if (cerrada) return NextResponse.json({ error: cerrada, codigo: "ventana_cerrada" }, { status: 409 });

    const yo = { id: quien.userId, nombre: (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien" };
    if (!(charla.estado === "humano" && charla.asistente?.id === yo.id)) {
      const motivo = await cambiarEstado(db, charla, "tomar", yo);
      if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });
    }

    const autor: Autor = { autor: "persona", autorId: yo.id, autorNombre: yo.nombre };
    const mimeBase = archivo?.mime.split(";")[0].trim() ?? "";
    let enviado: { id: string };
    if (archivo && AUDIOS_GRABADOS[mimeBase]) {
      const { data, error } = await db.storage.from("comercial").download(archivo.path);
      if (error || !data) throw new Error(`No se pudo leer el audio: ${error?.message ?? "vacío"}`);
      const ogg = await aNotaDeVoz(Buffer.from(await data.arrayBuffer()), AUDIOS_GRABADOS[mimeBase]);
      const destino = archivo.path.replace(/\.[a-z0-9]+$/i, "") + ".ogg";
      const subido = await db.storage.from("comercial").upload(destino, ogg, { contentType: "audio/ogg", upsert: true });
      if (subido.error) throw new Error(`No se pudo guardar el audio: ${subido.error.message}`);
      if (destino !== archivo.path) await db.storage.from("comercial").remove([archivo.path]);
      enviado = await mandarAudio(db, id, charla.telefono, { path: destino, nombre: "audio.ogg", datos: ogg }, autor);
      if (texto?.trim()) enviado = await mandarTexto(db, id, charla.telefono, texto, autor);
    } else {
      enviado = archivo
        ? await mandarArchivo(db, id, charla.telefono, archivo, texto ?? null, autor)
        : await mandarTexto(db, id, charla.telefono, texto!, autor);
    }
    await db.from("cli_conversaciones").update({ sin_leer: 0 }).eq("id", id);
    return NextResponse.json({ ok: true, id: enviado.id });
  } catch (e) {
    if (e instanceof SinNumeroClientes) return NextResponse.json({ error: e.message }, { status: 503 });
    return errorResponse(e);
  }
}
