// Creación de alertas. Un solo lugar por el que pasan todos los avisos de la app.
//
// POR QUÉ NO SON TRIGGERS DE POSTGRES: los tres avisos hablan de OTs, y las OTs viven en
// Odoo. Un trigger sobre `hab_ots` sólo tendría el `odoo_ot_id` a mano, así que el aviso
// diría "OT 8412" en vez de "Armado · S01933 · Granz SRL" — que es lo único que le
// permite a alguien decidir si le importa sin abrir nada. El título hay que ir a
// buscarlo a Odoo, y eso no se hace desde un trigger.
//
// LA IDEMPOTENCIA ES DE LA BASE, NO DEL CÓDIGO: `alertas.clave` tiene un índice único, y
// acá se inserta con ignoreDuplicates. Por eso el barrido diario puede reinsertar los
// mismos avisos sin pensar, y por eso dos pestañas abiertas a la vez no duplican nada.
// Ningún llamador necesita saber qué ya avisó.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rol } from "@/lib/auth/roles";

type DB = SupabaseClient;

/**
 * Los tres avisos que existen hoy.
 *
 * `ot_urgente` sale de `x_urgencia = alta` en Odoo, un campo que hoy nadie marca (medido
 * el 2026-09-01: 60 OTs activas en baja, 4 en media, 0 en alta). El aviso está bien y no
 * va a sonar hasta que alguien marque una — por eso la ficha de OT ahora tiene el botón
 * para marcarla desde la app, que antes obligaba a entrar a Odoo.
 */
export type TipoAlerta = "ot_nueva" | "ot_habilitada" | "ot_urgente";

export type Prioridad = "baja" | "media" | "alta" | "critica";

export type NuevaAlerta = {
  tipo: TipoAlerta;
  /** Identidad de negocio. Ver claveDe(). */
  clave: string;
  titulo: string;
  descripcion?: string | null;
  prioridad?: Prioridad;
  /** Ruta interna de la app. El aviso tiene que llevar a algún lado. */
  enlace?: string | null;
  /** null = todos. Por defecto van a operaciones. */
  destinatarioRol?: Rol | null;
};

/**
 * La clave que hace idempotente al aviso.
 *
 * Un aviso por tipo y por OT, PARA SIEMPRE: si una obra se habilita, se revierte y se
 * vuelve a habilitar, el segundo aviso no se crea. Es a propósito — la campanita cuenta
 * novedades, no transiciones, y repetir el mismo cartel es la forma más rápida de que la
 * gente deje de mirarlo. El historial de idas y vueltas ya vive en hab_gestiones.
 */
export function claveDe(tipo: TipoAlerta, otId: number): string {
  return `${tipo}:${otId}`;
}

/**
 * Inserta las que falten y devuelve cuántas se crearon de verdad.
 *
 * No tira si algo falla: un aviso que no se pudo crear no puede voltear la operación que
 * lo originó —habilitar una obra, abrir la bandeja—. Queda en el log del servidor.
 */
export async function crearAlertas(db: DB, alertas: NuevaAlerta[]): Promise<number> {
  if (alertas.length === 0) return 0;

  const filas = alertas.map((a) => ({
    tipo: a.tipo,
    clave: a.clave,
    titulo: a.titulo,
    descripcion: a.descripcion ?? null,
    prioridad: a.prioridad ?? "media",
    enlace: a.enlace ?? null,
    destinatario_rol: a.destinatarioRol === undefined ? "operativo" : a.destinatarioRol,
  }));

  const { data, error } = await db
    .from("alertas")
    .upsert(filas, { onConflict: "clave", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("[alertas] no se pudieron crear los avisos", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
