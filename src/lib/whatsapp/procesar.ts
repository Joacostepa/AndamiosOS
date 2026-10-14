// WhatsApp → asistente: lo que pasa después de que el webhook le contestó a Meta.
//
// UN TELÉFONO A LA VEZ (whatsapp_tomar_turno). En WhatsApp se escribe cortado ("hola" /
// "necesito cotizar" / "una bandeja de 12 metros"): el que toma el turno junta todo lo
// pendiente de ese teléfono en una sola consulta al asistente y, al terminar, se fija si llegó
// algo más mientras tanto. Así nunca quedan dos respuestas cruzadas.
//
// EL MISMO ASISTENTE que en la pantalla, con canal "whatsapp": las conversaciones de WhatsApp
// aparecen en la app y se pueden seguir desde ahí. La respuesta sale como mensajes: el texto con
// el formato de WhatsApp, el PDF como documento, el mensaje para el cliente aparte (para
// reenviarlo tal cual) y, si quedó algo para confirmar, botones Confirmar / Cancelar.

import type { SupabaseClient } from "@supabase/supabase-js";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";
import { ejecutarTurno, type Adjunto, type EntradaTurno } from "@/lib/asistente/turno";
import { abrirConversacion } from "@/lib/asistente/nueva-conversacion";
import { urlDePdf } from "@/lib/asistente/pdf";
import { hayVoz, transcribir } from "@/lib/voz/elevenlabs";
import { bajarMedio, enviarBotones, enviarDocumento, enviarTexto, marcarLeido, variantesTelefono } from "./api";
import { aWhatsapp } from "./formato";

/** Un mensaje tal cual lo manda Meta en el webhook (lo que se usa). */
export type MensajeMeta = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  interactive?: { type: string; button_reply?: { id: string; title?: string } };
  button?: { payload?: string; text?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

type Entrante = { wamid: string; telefono: string; tipo: string; contenido: MensajeMeta; recibido_at: string; enviado_at: string | null };

const TIPOS = new Set(["text", "audio", "image", "document", "interactive", "button", "location"]);
/** Una charla de WhatsApp sigue viva mientras no pasen tantas horas sin mensajes. */
const HORAS_VIGENCIA = 12;
/** Lo que el modelo puede mirar: fotos y PDF. */
const LEGIBLES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
const ORDEN_NUEVA = new Set(["nueva", "nuevo", "/nueva", "nueva conversacion", "empezar de nuevo", "de nuevo", "reiniciar", "arrancar de nuevo"]);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ahora = () => new Date().toISOString();
const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¡!¿?.,;:]/g, "").replace(/\s+/g, " ").trim();

/** Anota lo que llegó (una vez: Meta reintenta). Devuelve los teléfonos con algo nuevo. */
export async function registrarEntrantes(db: SupabaseClient, mensajes: MensajeMeta[]): Promise<string[]> {
  const telefonos = new Set<string>();
  for (const m of mensajes) {
    if (!m?.id || !m.from) continue;
    const { data, error } = await db
      .from("whatsapp_entrantes")
      .upsert(
        {
          wamid: m.id,
          telefono: m.from,
          tipo: TIPOS.has(m.type) ? m.type : "otro",
          contenido: m,
          enviado_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
        },
        { onConflict: "wamid", ignoreDuplicates: true },
      )
      .select("wamid");
    if (error) throw new Error(`No se pudo anotar el mensaje de WhatsApp: ${error.message}`);
    if (data?.length) telefonos.add(m.from);
  }
  return [...telefonos];
}

/** Atiende todo lo pendiente de un teléfono. Si otro lo está atendiendo, él lo va a ver al terminar. */
export async function procesarTelefono(db: SupabaseClient, telefono: string): Promise<void> {
  await espera(2500); // lo que se escribe cortado llega junto
  const tels = variantesTelefono(telefono);
  for (;;) {
    const { data: usuarioId, error } = await db.rpc("whatsapp_tomar_turno", { p_telefonos: tels });
    if (error) throw new Error(`whatsapp_tomar_turno: ${error.message}`);
    if (!usuarioId) {
      const { data: vendedor } = await db.from("comercial_vendedores").select("usuario_id").in("whatsapp", tels).eq("activo", true).maybeSingle();
      if (!vendedor) await contestarDesconocido(db, telefono, tels);
      return;
    }
    try {
      const { data: lote } = await db
        .from("whatsapp_entrantes")
        .update({ estado: "procesando", usuario_id: usuarioId })
        .in("telefono", tels)
        .eq("estado", "pendiente")
        .select("wamid, telefono, tipo, contenido, recibido_at, enviado_at");
      const mensajes = ((lote ?? []) as Entrante[]).sort((a, b) => (a.enviado_at ?? a.recibido_at).localeCompare(b.enviado_at ?? b.recibido_at));
      if (mensajes.length) await atender(db, usuarioId as string, telefono, mensajes);
    } finally {
      await db.rpc("whatsapp_soltar_turno", { p_telefonos: tels });
    }
    const { count } = await db.from("whatsapp_entrantes").select("wamid", { count: "exact", head: true }).in("telefono", tels).eq("estado", "pendiente");
    if (!count) return;
  }
}

/** Un número que no es de ningún vendedor: se contesta una vez por día, sin pasar por el asistente. */
async function contestarDesconocido(db: SupabaseClient, telefono: string, tels: string[]): Promise<void> {
  const { count } = await db
    .from("whatsapp_entrantes")
    .select("wamid", { count: "exact", head: true })
    .in("telefono", tels)
    .eq("estado", "ignorado")
    .gte("recibido_at", new Date(Date.now() - 86_400_000).toISOString());
  await db.from("whatsapp_entrantes").update({ estado: "ignorado", procesado_at: ahora() }).in("telefono", tels).eq("estado", "pendiente");
  if (!count) {
    await enviarTexto(
      telefono,
      "Hola. Este número es de uso interno de Andamios Buenos Aires y no reconoce tu teléfono. Si trabajás en ABA, pedile a Joaquín que lo habilite.",
    ).catch((e) => console.error("[whatsapp] respuesta a desconocido", e));
  }
}

async function atender(db: SupabaseClient, usuarioId: string, telefono: string, mensajes: Entrante[]): Promise<void> {
  const ultimo = mensajes.at(-1)!;
  await marcarLeido(ultimo.wamid);
  const marcar = (estado: string, extra: Record<string, unknown> = {}) =>
    db.from("whatsapp_entrantes").update({ estado, procesado_at: ahora(), ...extra }).in("wamid", mensajes.map((m) => m.wamid));

  // El mismo permiso que en la pantalla: asistente comercial, editar.
  const { data: perfil } = await db.from("user_profiles").select("rol, activo, permisos, debe_cambiar_clave").eq("id", usuarioId).maybeSingle();
  if (nivelEn(accesoDeFila(perfil), "asistente-comercial") !== "editar") {
    await enviarTexto(telefono, "Tu usuario no tiene habilitado el asistente comercial. Pedíselo a Joaquín.").catch(() => {});
    await marcar("ignorado");
    return;
  }

  let convId: string | null = null;
  try {
    convId = await conversacionVigente(db, usuarioId);
    for (const tanda of armarTandas(mensajes)) {
      if (tanda.tipo === "nueva") {
        convId = (await abrirConversacion(db, usuarioId, "whatsapp")).id;
        await enviarTexto(telefono, "Listo, empezamos de cero. ¿Qué necesitás?");
        continue;
      }
      if (tanda.tipo === "boton") {
        // El botón es de la conversación donde se propuso la acción (puede no ser la vigente).
        const { data: a } = await db.from("asistente_acciones").select("id, conversacion_id").eq("id", tanda.accionId).maybeSingle();
        const { data: c } = a
          ? await db.from("asistente_conversaciones").select("id, usuario_id").eq("id", a.conversacion_id).maybeSingle()
          : { data: null };
        if (!a || !c || c.usuario_id !== usuarioId) {
          await enviarTexto(telefono, "Ese botón ya no corresponde a nada pendiente.");
          continue;
        }
        convId = c.id as string;
        await correrTurno(db, convId, usuarioId, telefono, ultimo.wamid, { tipo: "boton", accionId: a.id, decision: tanda.decision, canal: "whatsapp" });
        continue;
      }
      if (!convId) convId = (await abrirConversacion(db, usuarioId, "whatsapp")).id;
      const entrada = await armarMensaje(db, convId, tanda.partes);
      if (entrada) await correrTurno(db, convId, usuarioId, telefono, ultimo.wamid, entrada);
    }
    await marcar("ok", { conversacion_id: convId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp] atender", e);
    await marcar("error", { error: msg.slice(0, 500), conversacion_id: convId });
    await enviarTexto(telefono, `Perdón, algo falló: ${msg}`).catch(() => {});
  }
}

/** La charla de WhatsApp en curso (la última usada, si no pasaron HORAS_VIGENCIA). */
async function conversacionVigente(db: SupabaseClient, usuarioId: string): Promise<string | null> {
  const { data } = await db
    .from("asistente_conversaciones")
    .select("id, ultimo_mensaje_at, created_at")
    .eq("usuario_id", usuarioId)
    .eq("canal", "whatsapp")
    .eq("estado", "activa")
    .order("created_at", { ascending: false })
    .limit(5);
  const ultima = (data ?? [])
    .map((c) => ({ id: c.id as string, en: new Date((c.ultimo_mensaje_at ?? c.created_at) as string).getTime() }))
    .sort((a, b) => b.en - a.en)[0];
  return ultima && Date.now() - ultima.en < HORAS_VIGENCIA * 3_600_000 ? ultima.id : null;
}

type Tanda =
  | { tipo: "nueva" }
  | { tipo: "boton"; accionId: string; decision: "confirmar" | "rechazar" }
  | { tipo: "mensaje"; partes: Entrante[] };

/** En orden: cada botón y cada "nueva" son una tanda; lo demás seguido se junta en una. */
function armarTandas(mensajes: Entrante[]): Tanda[] {
  const tandas: Tanda[] = [];
  for (const m of mensajes) {
    const boton = m.contenido.interactive?.button_reply?.id ?? "";
    const b = /^(confirmar|rechazar):([0-9a-f-]{36})$/.exec(boton);
    if (b) {
      tandas.push({ tipo: "boton", decision: b[1] as "confirmar" | "rechazar", accionId: b[2] });
      continue;
    }
    if (m.tipo === "text" && ORDEN_NUEVA.has(normalizar(m.contenido.text?.body ?? ""))) {
      tandas.push({ tipo: "nueva" });
      continue;
    }
    const previa = tandas.at(-1);
    if (previa?.tipo === "mensaje") previa.partes.push(m);
    else tandas.push({ tipo: "mensaje", partes: [m] });
  }
  return tandas;
}

/** Texto, audios (transcriptos), fotos y PDF → la entrada del turno. */
async function armarMensaje(db: SupabaseClient, convId: string, partes: Entrante[]): Promise<EntradaTurno | null> {
  const textos: string[] = [];
  const adjuntos: Adjunto[] = [];
  for (const p of partes) {
    const m = p.contenido;
    try {
      if (m.type === "text" && m.text?.body?.trim()) {
        textos.push(m.text.body.trim());
      } else if (m.type === "audio" && m.audio?.id) {
        if (!hayVoz().transcripcion) {
          textos.push("[Mandó un audio, pero la transcripción no está configurada: pedile que lo escriba.]");
          continue;
        }
        const { datos, mime } = await bajarMedio(m.audio.id);
        const { texto } = await transcribir(datos, mime, `audio.${mime.includes("ogg") ? "ogg" : mime.split("/")[1] ?? "bin"}`);
        textos.push(texto || "[Mandó un audio sin palabras que se entiendan.]");
      } else if ((m.type === "image" && m.image?.id) || (m.type === "document" && m.document?.id)) {
        const medio = m.image ?? m.document!;
        const nombre = m.document?.filename ?? `foto-${p.wamid.slice(-8).replace(/\W/g, "")}.jpg`;
        const tipo = (medio.mime_type ?? "").split(";")[0].trim();
        if (tipo && !LEGIBLES.has(tipo)) {
          textos.push(`[Mandó el archivo "${nombre}" (${tipo}), que no puedo leer: pedile una foto o un PDF.]`);
        } else {
          const { datos, mime } = await bajarMedio(medio.id);
          if (!LEGIBLES.has(mime)) {
            textos.push(`[Mandó el archivo "${nombre}" (${mime}), que no puedo leer: pedile una foto o un PDF.]`);
          } else {
            const path = `adjuntos/${convId}/wa-${p.wamid.replace(/[^\w-]/g, "_").slice(-40)}-${nombre.replace(/[^\w.-]/g, "_")}`;
            const { error } = await db.storage.from("comercial").upload(path, datos, { contentType: mime, upsert: true });
            if (error) throw new Error(`No se pudo guardar el adjunto: ${error.message}`);
            adjuntos.push({ path, tipo: mime, nombre });
          }
        }
        if (medio.caption?.trim()) textos.push(medio.caption.trim());
      } else if (m.type === "location" && m.location) {
        const l = m.location;
        textos.push(`Ubicación compartida: ${[l.name, l.address].filter(Boolean).join(", ") || "sin nombre"} (lat ${l.latitude}, long ${l.longitude}).`);
      } else if (m.type === "button" && m.button?.text) {
        textos.push(m.button.text);
      }
    } catch (e) {
      textos.push(`[No pude abrir algo que mandó por WhatsApp: ${e instanceof Error ? e.message : e}]`);
    }
  }
  if (!textos.length && !adjuntos.length) return null;
  return { tipo: "mensaje", texto: textos.join("\n\n") || "(mandó sólo adjuntos)", adjuntos, canal: "whatsapp" };
}

/** Corre el turno y va mandando la respuesta por WhatsApp. */
async function correrTurno(db: SupabaseClient, convId: string, usuarioId: string, telefono: string, wamid: string, entrada: EntradaTurno): Promise<void> {
  let texto = "";
  let turnoId: string | null = null;
  const soltar = async () => {
    const t = aWhatsapp(texto);
    texto = "";
    if (t) await enviarTexto(telefono, t);
  };
  // "Escribiendo…" dura 25 s: se renueva mientras trabaja.
  const latido = setInterval(() => void marcarLeido(wamid), 20_000);
  try {
    for (let intento = 0; ; intento++) {
      let ocupado = false;
      for await (const ev of ejecutarTurno({ db, conversacionId: convId, usuarioId, entrada })) {
        if (ev.t === "inicio") turnoId = ev.turnoId;
        else if (ev.t === "texto") texto += ev.d;
        else if (ev.t === "herramienta" && ev.estado === "inicio") await soltar();
        else if (ev.t === "pdf") {
          await soltar();
          const u = await urlDePdf(db, ev.pdf.id);
          if (u) await enviarDocumento(telefono, u.url, u.nombre);
        } else if (ev.t === "whatsapp") {
          await soltar();
          await enviarTexto(telefono, "Mensaje para el cliente, listo para reenviar 👇");
          await enviarTexto(telefono, ev.texto);
        } else if (ev.t === "continuar") {
          texto += "\n\nMe está llevando más de lo pensado. Escribime «seguí» y continúo.";
        } else if (ev.t === "error") {
          if (ev.codigo === "ocupado") {
            ocupado = true;
            break;
          }
          texto += `\n\n${ev.mensaje}`;
        }
      }
      if (!ocupado) break;
      // La misma conversación está respondiendo en la pantalla: se espera un poco.
      if (intento >= 10) {
        texto = "Todavía estoy respondiendo en la app. Mandame el mensaje de nuevo en un rato.";
        break;
      }
      await espera(3000);
    }
  } finally {
    clearInterval(latido);
  }
  await soltar();

  // Lo que quedó para confirmar: botones (también vale contestar "sí, dale").
  if (!turnoId) return;
  const { data: acciones } = await db
    .from("asistente_acciones")
    .select("id, resumen")
    .eq("conversacion_id", convId)
    .eq("turno_id", turnoId)
    .eq("estado", "presentada");
  for (const a of acciones ?? []) {
    await enviarBotones(telefono, aWhatsapp(a.resumen as string), [
      { id: `confirmar:${a.id}`, titulo: "Confirmar" },
      { id: `rechazar:${a.id}`, titulo: "Cancelar" },
    ]);
  }
}
