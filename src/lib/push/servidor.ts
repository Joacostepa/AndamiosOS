// Notificaciones push de la app (Web Push con VAPID). Del lado del servidor: manda un aviso a
// las suscripciones de push_suscripciones y borra las que el servicio de push da por muertas.
//
// Las claves: VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (Vercel). El «subject» es la URL de la app
// (NEXT_PUBLIC_APP_URL): los servicios de push (Google, Apple, Mozilla) lo usan de contacto.
// Sin las claves, no se manda nada y pushConfigurado() da false.

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type AvisoPush = {
  titulo: string;
  cuerpo: string;
  /** Adónde lleva al tocarlo (ruta de la app). */
  url: string;
  /** Avisos con el mismo tag se reemplazan (uno por charla, no uno por mensaje). */
  tag: string;
};

export type SuscripcionPush = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; modo: "todo" | "necesita" };

export const clavePublicaPush = () => process.env.VAPID_PUBLIC_KEY?.trim() || null;

export function pushConfigurado(): boolean {
  return !!(clavePublicaPush() && process.env.VAPID_PRIVATE_KEY?.trim());
}

let configurado = false;
function configurar() {
  if (configurado) return;
  const sujeto = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://andamios-os.vercel.app";
  webpush.setVapidDetails(sujeto, clavePublicaPush()!, process.env.VAPID_PRIVATE_KEY!.trim());
  configurado = true;
}

/** El cuerpo, corto: los servicios de push aceptan ~4 KB y el celular muestra dos o tres renglones. */
export function recortar(texto: string, max = 180): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Manda el aviso a esas suscripciones, en paralelo. Nunca tira: un aviso que no sale no puede
 * frenar el mensaje que lo originó. Las que ya no existen (404/410) se borran.
 */
export async function mandarPush(db: SupabaseClient, subs: SuscripcionPush[], aviso: AvisoPush): Promise<number> {
  if (!subs.length || !pushConfigurado()) return 0;
  configurar();
  const cuerpo = JSON.stringify({ titulo: aviso.titulo, cuerpo: recortar(aviso.cuerpo), url: aviso.url, tag: aviso.tag });
  const ahora = new Date().toISOString();
  const res = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 6 * 3600, urgency: "high", timeout: 8000 });
        await db.from("push_suscripciones").update({ ultimo_ok_at: ahora, fallas: 0 }).eq("id", s.id);
        return true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_suscripciones").delete().eq("id", s.id);
        else {
          console.error("[push] no salió", status ?? "", e instanceof Error ? e.message : e);
          await db.rpc("push_sumar_falla", { p_id: s.id }).then(() => {}, () => {});
        }
        return false;
      }
    }),
  );
  return res.filter(Boolean).length;
}
