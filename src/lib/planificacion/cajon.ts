// Cajón de planificación, contra Supabase (plan_cajon_notas, plan_cajon_pendientes).
//
// Recibe el cliente por parámetro y no lo crea: así el módulo no arrastra nada
// server-only y las políticas de RLS corren con la sesión de quien pide, igual que
// src/lib/planificacion/notas.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIAS_RETENCION_HECHOS,
  type Cajon,
  type CambioPendiente,
  type NotaCajon,
  type Pendiente,
} from "@/lib/tablero/tipos-cajon";

type DB = SupabaseClient;

const TABLA_NOTA = "plan_cajon_notas";
const TABLA_PENDIENTES = "plan_cajon_pendientes";

/** La fila única de notas. El PK es fijo por CHECK; ver la migración. */
const NOTA_ID = "unica";

/** Lo tira `guardarNota` cuando alguien más escribió entre la lectura y el guardado. */
export class ConflictoDeNota extends Error {
  constructor(readonly actual: NotaCajon) {
    super("Alguien más editó las notas mientras escribías");
    this.name = "ConflictoDeNota";
  }
}

type FilaNota = {
  texto: string;
  updated_at: string;
  user_profiles?: { nombre: string } | null;
};

type FilaPendiente = {
  id: string;
  texto: string;
  hecho: boolean;
  posicion: number;
  hecho_at: string | null;
  user_profiles?: { nombre: string } | null;
};

const CAMPOS_NOTA = "texto, updated_at, user_profiles(nombre)";
const CAMPOS_PENDIENTE = "id, texto, hecho, posicion, hecho_at, user_profiles(nombre)";

function mapearNota(f: FilaNota): NotaCajon {
  return {
    texto: f.texto,
    updatedAt: f.updated_at,
    autorNombre: f.user_profiles?.nombre ?? null,
  };
}

function mapearPendiente(f: FilaPendiente): Pendiente {
  return {
    id: f.id,
    texto: f.texto,
    hecho: f.hecho,
    posicion: f.posicion,
    hechoAt: f.hecho_at,
    autorNombre: f.user_profiles?.nombre ?? null,
  };
}

async function leerNota(db: DB): Promise<NotaCajon> {
  const { data, error } = await db
    .from(TABLA_NOTA)
    .select(CAMPOS_NOTA)
    .eq("id", NOTA_ID)
    .single();
  if (error) throw new Error(error.message);
  return mapearNota(data as unknown as FilaNota);
}

/**
 * Borra los pendientes tildados hace más de DIAS_RETENCION_HECHOS.
 *
 * VA EN LA LECTURA a propósito, y no en un cron: no hay scheduler en este proyecto, la
 * tabla es diminuta, y lo que se busca es que la lista esté limpia CUANDO ALGUIEN LA
 * ABRE. Si nadie abre el cajón nada se purga, que es exactamente lo que corresponde:
 * no hay a quién molestarle la vista.
 */
async function purgarHechosViejos(db: DB): Promise<void> {
  const corte = new Date(Date.now() - DIAS_RETENCION_HECHOS * 86_400_000).toISOString();
  const { error } = await db
    .from(TABLA_PENDIENTES)
    .delete()
    .eq("hecho", true)
    .lt("hecho_at", corte);
  // No se propaga: que falle la purga no puede impedir que se lea el cajón. Es
  // mantenimiento, no el dato que vino a buscar el que abrió el panel.
  if (error) console.error("[cajon] no se pudo purgar hechos viejos:", error.message);
}

export async function leerCajon(db: DB): Promise<Cajon> {
  await purgarHechosViejos(db);

  const [nota, pendientes] = await Promise.all([
    leerNota(db),
    db
      .from(TABLA_PENDIENTES)
      .select(CAMPOS_PENDIENTE)
      .order("posicion")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []).map((f) => mapearPendiente(f as unknown as FilaPendiente));
      }),
  ]);

  return { nota, pendientes };
}

/**
 * Guarda las notas, pero sólo si nadie las tocó desde `updatedAtEsperado`.
 *
 * El `.eq("updated_at", …)` es todo el control de concurrencia: si otro guardó primero,
 * el UPDATE no matchea ninguna fila, devuelve vacío, y en vez de haber pisado el texto
 * ajeno se tira ConflictoDeNota con lo que hay ahora. La alternativa —guardar y ya— es
 * pérdida de datos silenciosa, que con debounce nadie llega a ver nunca.
 */
export async function guardarNota(
  db: DB,
  texto: string,
  updatedAtEsperado: string,
  autorId: string | null,
): Promise<NotaCajon> {
  const { data, error } = await db
    .from(TABLA_NOTA)
    .update({ texto, updated_by: autorId })
    .eq("id", NOTA_ID)
    .eq("updated_at", updatedAtEsperado)
    .select(CAMPOS_NOTA);
  if (error) throw new Error(error.message);

  if (!data || data.length === 0) throw new ConflictoDeNota(await leerNota(db));
  return mapearNota(data[0] as unknown as FilaNota);
}

/**
 * Agrega un pendiente al final.
 *
 * La posición se calcula leyendo el máximo, que es una carrera si dos personas agregan
 * en el mismo instante. Se acepta: el peor caso es que dos ítems compartan posición y
 * queden ordenados por created_at, que es el desempate del ORDER BY. Serializarlo
 * costaría una secuencia o un lock para evitar un empate sin consecuencias.
 */
export async function agregarPendiente(
  db: DB,
  texto: string,
  autorId: string | null,
): Promise<void> {
  const { data, error: errorMax } = await db
    .from(TABLA_PENDIENTES)
    .select("posicion")
    .order("posicion", { ascending: false })
    .limit(1);
  if (errorMax) throw new Error(errorMax.message);

  const posicion = (data?.[0]?.posicion ?? 0) + 1;
  const { error } = await db
    .from(TABLA_PENDIENTES)
    .insert({ texto, posicion, autor_id: autorId });
  if (error) throw new Error(error.message);
}

/**
 * Tilda / destilda o corrige el texto de un pendiente.
 *
 * `hecho_at` se mueve junto con `hecho` y no puede no hacerlo: la tabla tiene un CHECK
 * que exige que uno implique al otro, porque de ese sello depende que la purga funcione.
 */
export async function actualizarPendiente(
  db: DB,
  id: string,
  cambio: CambioPendiente,
): Promise<void> {
  const fila: Record<string, unknown> = {};
  if (cambio.texto !== undefined) fila.texto = cambio.texto;
  if (cambio.hecho !== undefined) {
    fila.hecho = cambio.hecho;
    fila.hecho_at = cambio.hecho ? new Date().toISOString() : null;
  }
  if (Object.keys(fila).length === 0) return;

  const { error } = await db.from(TABLA_PENDIENTES).update(fila).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function borrarPendiente(db: DB, id: string): Promise<void> {
  const { error } = await db.from(TABLA_PENDIENTES).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
