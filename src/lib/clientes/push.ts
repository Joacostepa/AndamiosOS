// Notificaciones push de la bandeja de clientes (JS, 16/11: «me gustaría que en principio me
// llegue todo, más ahora que quiero ir viendo las respuestas»).
//
// Tres tipos de aviso:
//   · cliente: escribió el cliente («Oscar Brito: ¿cuánto sale?»).
//   · tomas: salió una respuesta de Tomás o un texto fijo («Tomás → Oscar: …»).
//   · necesita: algo necesita a una persona (Tomás la pasó, una tarjeta espera el OK, te pasaron
//     una charla). Va con su propio tag, así no lo tapa el próximo mensaje.
// Quién recibe qué (quienesReciben, puro): con «todo», todo; con «necesita», sólo los avisos
// «necesita» (o los que son para esa persona) y lo que escribe el cliente en una charla suya.
// Siempre, sólo quien tiene la bandeja (ver o editar).

import type { SupabaseClient } from "@supabase/supabase-js";
import { nivelEn, type Acceso } from "../auth/acceso.ts";
import { mandarPush, pushConfigurado, type SuscripcionPush } from "../push/servidor.ts";

export type TipoAvisoPush = "cliente" | "tomas" | "necesita";

export type EventoPush = {
  tipo: TipoAvisoPush;
  conversacionId: string;
  /** Lo que se muestra debajo del título. */
  texto: string;
  /** Un aviso «necesita» para una sola persona (te pasaron la charla). */
  soloPara?: string | null;
};

type FilaSub = SuscripcionPush & { user_profiles: { rol: Acceso["rol"]; activo: boolean; permisos: Acceso["permisos"] | null } | null };

/** Las suscripciones que reciben este aviso. `dueno`: quien tiene la charla (estado humano). */
export function quienesReciben<T extends Pick<SuscripcionPush, "user_id" | "modo">>(subs: T[], ev: Pick<EventoPush, "tipo" | "soloPara">, dueno: string | null): T[] {
  return subs.filter((s) => {
    if (ev.soloPara) return s.user_id === ev.soloPara;
    if (s.modo === "todo") return true;
    if (ev.tipo === "necesita") return true;
    return ev.tipo === "cliente" && !!dueno && s.user_id === dueno;
  });
}

/** «Oscar Brito», o el perfil de WhatsApp, o el teléfono. */
function nombreDe(c: { telefono: string; nombre_perfil: string | null; nombre: string | null }): string {
  return c.nombre?.trim() || c.nombre_perfil?.trim() || `+${c.telefono}`;
}

export function tituloAviso(tipo: TipoAvisoPush, nombre: string): string {
  if (tipo === "cliente") return nombre;
  if (tipo === "tomas") return `Tomás → ${nombre}`;
  return `⚠️ ${nombre}`;
}

/** Manda el aviso a quien corresponda. Nunca tira. */
export async function avisarPush(db: SupabaseClient, ev: EventoPush): Promise<void> {
  if (!pushConfigurado()) return;
  try {
    const [{ data: charla }, { data: subs }] = await Promise.all([
      db.from("cli_conversaciones").select("telefono, nombre_perfil, nombre:ficha->>nombre, estado, asistente_id").eq("id", ev.conversacionId).maybeSingle(),
      db.from("push_suscripciones").select("id, user_id, endpoint, p256dh, auth, modo, user_profiles(rol, activo, permisos)"),
    ]);
    if (!charla || !subs?.length) return;
    const c = charla as { telefono: string; nombre_perfil: string | null; nombre: string | null; estado: string; asistente_id: string | null };
    const conBandeja = (subs as unknown as FilaSub[]).filter((s) => {
      const p = s.user_profiles;
      return !!p && !!nivelEn({ rol: p.rol, activo: p.activo, permisos: p.permisos ?? {}, debeCambiarClave: false }, "clientes-whatsapp");
    });
    const dueno = c.estado === "humano" ? c.asistente_id : null;
    const destino = quienesReciben(conBandeja, ev, dueno);
    if (!destino.length) return;
    await mandarPush(db, destino, {
      titulo: tituloAviso(ev.tipo, nombreDe(c)),
      cuerpo: ev.texto,
      url: `/comercial/clientes?c=${ev.conversacionId}`,
      tag: ev.tipo === "necesita" ? `necesita-${ev.conversacionId}` : `charla-${ev.conversacionId}`,
    });
  } catch (e) {
    console.error("[push] aviso de la bandeja", ev.conversacionId, e);
  }
}
