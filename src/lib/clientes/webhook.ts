// WhatsApp de clientes: lo que llega al número de clientes (docs/clientes/crm-propuesta.md
// §7 y §13, etapa 0). Lo llama el webhook, después de validar la firma de Meta.
//
// SIN IA (etapa 0): lo que entra se anota en la bandeja y nadie contesta solo. La única
// excepción es un mensaje fijo, apagado por defecto (WHATSAPP_CLIENTES_RESPUESTA_FIJA=1).
// CON SOFÍA (paso 5, clientes_ia_activa = 1): las charlas nuevas entran en «bot» y, después del
// 200, el webhook le pasa cada charla a Sofía (agente.ts). El mensaje fijo no sale: saluda ella.
//
// DOS TIEMPOS, porque Meta quiere un 200 enseguida:
//   1. en el pedido (recibirMensajes): el registro crudo en whatsapp_entrantes (una vez por
//      wamid: Meta reintenta), la charla y la fila del hilo. Son escrituras chicas: así la
//      bandeja muestra el mensaje aunque lo de después falle;
//   2. después (after): bajar los adjuntos a Storage (los links de Meta vencen), transcribir
//      los audios y, si está prendido, el mensaje fijo. Si eso se corta, el adjunto queda
//      «pendiente» y se reintenta cuando alguien abre la charla (reintentarPendientes).

import type { SupabaseClient } from "@supabase/supabase-js";
import { hayVoz, transcribir } from "@/lib/voz/elevenlabs";
import { bajarMedio } from "@/lib/whatsapp/api";
import { variantesTelefono } from "@/lib/whatsapp/tandas";
import { RESPUESTA_FIJA, debeResponderFijo, esBaja, extension, leerEntrante, nombreSeguro, respuestaFijaActivada, type AdjuntoPendiente, type MensajeCliente } from "./entrante";
import { avanza, leerStatus, type EstadoHilo, type StatusMeta } from "./estados";
import { mandarTexto } from "./envio";
import { palabraGamaAlta } from "./facil";

export const BUCKET = "comercial";
/** Un adjunto que no se pudo bajar se reintenta hasta esta cantidad de veces. */
const MAX_INTENTOS = 3;
/** Un adjunto pendiente hace más de esto quedó de una función que se cortó. */
const PENDIENTE_VIEJO_MS = 90_000;

const ahora = () => new Date().toISOString();

export type AvisoClientes = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: MensajeCliente[];
  statuses?: StatusMeta[];
};

/** Lo que queda para después del 200. `charlas`: las que recibieron algo (para Sofía). */
export type Pendientes = { adjuntos: string[]; respuestasFijas: { conversacionId: string; telefono: string }[]; charlas: string[] };

/** Cómo entra una charla nueva (o una cerrada que se reabre sin dueño): con Sofía o sin tomar. */
export type OpcionesRecibir = { iaActiva: boolean };

type Charla = { id: string; nueva: boolean; reabierta: boolean; optOut: boolean };

/**
 * La charla abierta de este teléfono; si no hay, la última cerrada se reabre (vuelve a quien la
 * tenía, o queda sin tomar); si nunca escribió, una nueva. Una sola abierta por teléfono: si dos
 * mensajes simultáneos la crean a la vez, el índice único frena al segundo y se vuelve a buscar.
 */
export async function charlaPara(db: SupabaseClient, telefono: string, numero: string, nombre: string | null, o: OpcionesRecibir = { iaActiva: false }): Promise<Charla> {
  const sinDueno = o.iaActiva ? "bot" : "derivada";
  const tels = variantesTelefono(telefono);
  for (let intento = 0; intento < 3; intento++) {
    const { data: abierta, error: e1 } = await db
      .from("cli_conversaciones")
      .select("id, opt_out, nombre_perfil")
      .in("telefono", tels)
      .eq("phone_number_id", numero)
      .neq("estado", "cerrada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw new Error(`No se pudo buscar la charla: ${e1.message}`);
    if (abierta) {
      if (nombre && nombre !== abierta.nombre_perfil) {
        await db.from("cli_conversaciones").update({ nombre_perfil: nombre, updated_at: ahora() }).eq("id", abierta.id);
      }
      return { id: abierta.id as string, nueva: false, reabierta: false, optOut: !!abierta.opt_out };
    }

    const { data: cerrada } = await db
      .from("cli_conversaciones")
      .select("id, opt_out, asistente_id")
      .in("telefono", tels)
      .eq("phone_number_id", numero)
      .eq("estado", "cerrada")
      .order("cerrada_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (cerrada) {
      const { data: reabierta, error } = await db
        .from("cli_conversaciones")
        .update({
          estado: cerrada.asistente_id ? "humano" : sinDueno,
          cerrada_at: null,
          cerrada_por: null,
          // Con Sofía, una charla que se reabre es una charla nueva para el saludo (las columnas
          // ia_* existen sólo con la migración del paso 5, que va antes de prender el interruptor).
          ...(o.iaActiva ? { ia_saludo_at: null, motivo: null } : {}),
          ...(nombre ? { nombre_perfil: nombre } : {}),
          updated_at: ahora(),
        })
        .eq("id", cerrada.id)
        .eq("estado", "cerrada")
        .select("id");
      if (error && error.code !== "23505") throw new Error(`No se pudo reabrir la charla: ${error.message}`);
      if (reabierta?.length) {
        await anotarEvento(db, cerrada.id as string, "El cliente volvió a escribir: la charla se reabrió.");
        return { id: cerrada.id as string, nueva: false, reabierta: true, optOut: !!cerrada.opt_out };
      }
      continue; // otro la reabrió o creó una: se vuelve a buscar
    }

    const { data: nueva, error } = await db
      .from("cli_conversaciones")
      .insert({ telefono, phone_number_id: numero, nombre_perfil: nombre, estado: sinDueno })
      .select("id")
      .single();
    if (!error && nueva) return { id: nueva.id as string, nueva: true, reabierta: false, optOut: false };
    if (error?.code !== "23505") throw new Error(`No se pudo crear la charla: ${error?.message ?? "sin detalle"}`);
  }
  throw new Error("No se pudo ubicar la charla del cliente (tres choques seguidos).");
}

/**
 * Pidió multidireccional: la charla queda de gama alta (ficha.segmento), aunque Sofía esté
 * apagada o la tenga una persona. Así va arriba en la bandeja desde el primer mensaje. Sofía
 * lo vuelve a marcar en su turno (turno.ts), con lo que lee de la ficha y el texto.
 */
async function marcarGamaAlta(db: SupabaseClient, conversacionId: string): Promise<void> {
  const { data } = await db.from("cli_conversaciones").select("ficha").eq("id", conversacionId).maybeSingle();
  const ficha = data?.ficha && typeof data.ficha === "object" ? (data.ficha as Record<string, unknown>) : {};
  if (ficha.segmento === "gama_alta") return;
  await db.from("cli_conversaciones").update({ ficha: { ...ficha, segmento: "gama_alta" }, updated_at: ahora() }).eq("id", conversacionId);
}

export async function anotarEvento(db: SupabaseClient, conversacionId: string, texto: string, autorId: string | null = null): Promise<void> {
  await db.from("cli_hilo").insert({
    conversacion_id: conversacionId,
    direccion: "evento",
    autor: autorId ? "persona" : "sistema",
    autor_id: autorId,
    tipo: "evento",
    texto,
    estado: "recibido",
  });
}

/** Paso 1, dentro del pedido de Meta. Si falla algo, el error vuelve como 500 y Meta reintenta. */
export async function recibirMensajes(db: SupabaseClient, valor: AvisoClientes, numero: string, o: OpcionesRecibir = { iaActiva: false }): Promise<Pendientes> {
  const pend: Pendientes = { adjuntos: [], respuestasFijas: [], charlas: [] };
  const nombres = new Map((valor.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name?.trim() || null]));
  // Con Sofía prendida, el saludo lo manda ella: el mensaje fijo de la etapa 0 no sale.
  const fijaActivada = respuestaFijaActivada() && !o.iaActiva;

  for (const m of valor.messages ?? []) {
    if (!m?.id || !m.from) continue;
    const enviado = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null;
    const { data: nuevo, error: eReg } = await db
      .from("whatsapp_entrantes")
      .upsert(
        { wamid: m.id, telefono: m.from, tipo: m.type || "otro", contenido: m, enviado_at: enviado, phone_number_id: numero, estado: "procesando", procesado_at: ahora() },
        { onConflict: "wamid", ignoreDuplicates: true },
      )
      .select("wamid");
    if (eReg) throw new Error(`No se pudo anotar el mensaje de WhatsApp: ${eReg.message}`);
    // Ya estaba: Meta reintentó. Si la vez anterior se cortó antes del hilo, igual se sigue
    // (el hilo tiene el wamid único y no se duplica).
    if (!nuevo?.length) {
      const { data: previo } = await db.from("whatsapp_entrantes").select("cli_conversacion_id").eq("wamid", m.id).maybeSingle();
      if (previo?.cli_conversacion_id) continue;
    }

    const charla = await charlaPara(db, m.from, numero, nombres.get(m.from) ?? null, o);
    if (!pend.charlas.includes(charla.id)) pend.charlas.push(charla.id);
    const e = leerEntrante(m);
    const momento = enviado ?? ahora();
    const { data: fila, error: eHilo } = await db
      .from("cli_hilo")
      .insert({
        conversacion_id: charla.id,
        direccion: "entrante",
        autor: "cliente",
        wamid: m.id,
        tipo: e.tipo,
        texto: e.texto,
        adjunto: e.adjunto,
        estado: "recibido",
        responde_a: e.respondeA,
        momento,
      })
      .select("id")
      .maybeSingle();
    if (eHilo && eHilo.code !== "23505") throw new Error(`No se pudo guardar el mensaje en la bandeja: ${eHilo.message}`);
    if (fila) {
      const { error: eAnotar } = await db.rpc("cli_anotar_entrante", { p_conversacion: charla.id, p_momento: momento, p_resumen: e.resumen });
      if (eAnotar) throw new Error(`cli_anotar_entrante: ${eAnotar.message}`);
      if (e.adjunto && "pendiente" in e.adjunto) pend.adjuntos.push(fila.id as string);
    }
    if (fila && e.tipo === "text" && e.texto && palabraGamaAlta(e.texto)) {
      await marcarGamaAlta(db, charla.id).catch((err) => console.error("[clientes] no se pudo marcar gama alta", charla.id, err));
    }
    if (e.tipo === "text" && esBaja(e.texto)) {
      await db.from("cli_conversaciones").update({ opt_out: true, updated_at: ahora() }).eq("id", charla.id);
      charla.optOut = true;
    }
    await db
      .from("whatsapp_entrantes")
      .update({ cli_conversacion_id: charla.id, estado: e.adjunto && "pendiente" in e.adjunto ? "procesando" : "ok", procesado_at: ahora() })
      .eq("wamid", m.id);

    if (debeResponderFijo({ activado: fijaActivada, nueva: charla.nueva, reabierta: charla.reabierta, optOut: charla.optOut })) {
      pend.respuestasFijas.push({ conversacionId: charla.id, telefono: m.from });
    }
  }
  return pend;
}

/**
 * Los avisos de entrega de lo que salió (enviado, entregado, leído, error). Sólo avanzan
 * (estados.ts). Un wamid que no está en el hilo se ignora.
 */
export async function registrarStatuses(db: SupabaseClient, statuses: StatusMeta[]): Promise<void> {
  for (const s of statuses) {
    const st = leerStatus(s);
    if (!st) continue;
    const { data: fila } = await db.from("cli_hilo").select("id, estado").eq("wamid", st.wamid).maybeSingle();
    if (!fila || !avanza(fila.estado as EstadoHilo, st.estado)) continue;
    await db
      .from("cli_hilo")
      .update({
        estado: st.estado,
        estado_at: st.at,
        ...(st.error ? { error_codigo: st.error.codigo, error_detalle: st.error.detalle } : {}),
      })
      .eq("id", fila.id)
      .eq("estado", fila.estado);
  }
}

/** Paso 2, después del 200. Cada cosa por su lado: que un audio roto no frene a los demás. */
export async function despuesDeRecibir(db: SupabaseClient, pend: Pendientes): Promise<void> {
  await Promise.all([
    ...pend.adjuntos.map((id) => bajarAdjunto(db, id).catch((e) => console.error("[clientes] adjunto", id, e))),
    ...pend.respuestasFijas.map((r) =>
      mandarTexto(db, r.conversacionId, r.telefono, RESPUESTA_FIJA, { autor: "sistema" }).catch((e) => console.error("[clientes] respuesta fija", r.conversacionId, e)),
    ),
  ]);
}

type AdjuntoGuardado = AdjuntoPendiente & { intentos?: number; error?: string; intento_at?: string };

/** Baja un adjunto de Meta, lo sube a Storage y, si es un audio, lo transcribe. */
export async function bajarAdjunto(db: SupabaseClient, hiloId: string): Promise<void> {
  const { data: fila } = await db.from("cli_hilo").select("id, conversacion_id, wamid, tipo, adjunto").eq("id", hiloId).maybeSingle();
  const adj = fila?.adjunto as AdjuntoGuardado | null;
  if (!fila || !adj?.pendiente || !adj.media_id) return;
  // Marca que se está bajando: el reintento del detalle (que se consulta seguido) no lo repite.
  await db.from("cli_hilo").update({ adjunto: { ...adj, intento_at: ahora() } }).eq("id", fila.id);
  try {
    const { datos, mime } = await bajarMedio(adj.media_id);
    const nombre = adj.nombre || `archivo.${extension(mime)}`;
    const path = `clientes/${fila.conversacion_id}/${fila.id}-${nombreSeguro(nombre)}`;
    const { error } = await db.storage.from(BUCKET).upload(path, datos, { contentType: mime, upsert: true });
    if (error) throw new Error(`No se pudo guardar el adjunto: ${error.message}`);

    let transcripcion: string | null = null;
    let errorTranscripcion: string | null = null;
    if (fila.tipo === "audio") {
      if (!hayVoz().transcripcion) errorTranscripcion = "La transcripción no está configurada.";
      else {
        try {
          transcripcion = (await transcribir(datos, mime, `audio.${extension(mime)}`)).texto || "(sin palabras que se entiendan)";
        } catch (e) {
          errorTranscripcion = `No se pudo transcribir: ${e instanceof Error ? e.message : e}`;
        }
      }
    }
    await db
      .from("cli_hilo")
      .update({
        adjunto: { path, mime, nombre, bytes: datos.length, ...(errorTranscripcion ? { transcripcion_error: errorTranscripcion } : {}) },
        transcripcion,
      })
      .eq("id", fila.id);
    if (fila.wamid) await db.from("whatsapp_entrantes").update({ estado: "ok", procesado_at: ahora() }).eq("wamid", fila.wamid);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    const intentos = (adj.intentos ?? 0) + 1;
    const sigue = intentos < MAX_INTENTOS;
    await db.from("cli_hilo").update({ adjunto: { ...adj, intentos, error: msg, pendiente: sigue, intento_at: ahora() } }).eq("id", fila.id);
    if (!sigue && fila.wamid) await db.from("whatsapp_entrantes").update({ estado: "error", error: msg, procesado_at: ahora() }).eq("wamid", fila.wamid);
    throw e;
  }
}

/**
 * Los adjuntos de una charla que quedaron pendientes de una función que se cortó (o que
 * fallaron y todavía tienen intentos). Lo llama el detalle de la charla, después de responder.
 */
export async function reintentarPendientes(db: SupabaseClient, conversacionId: string): Promise<void> {
  const limite = new Date(Date.now() - PENDIENTE_VIEJO_MS).toISOString();
  const { data } = await db
    .from("cli_hilo")
    .select("id, adjunto")
    .eq("conversacion_id", conversacionId)
    .eq("adjunto->>pendiente", "true")
    .lt("created_at", limite)
    .limit(5);
  const vencido = (a: AdjuntoGuardado | null) => !a?.intento_at || Date.now() - Date.parse(a.intento_at) > PENDIENTE_VIEJO_MS;
  for (const f of (data ?? []).filter((f) => vencido(f.adjunto as AdjuntoGuardado | null))) {
    await bajarAdjunto(db, f.id as string).catch((e) => console.error("[clientes] reintento adjunto", f.id, e));
  }
}
