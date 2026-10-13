// Las fotos que la cuadrilla mandó al grupo de Telegram, ya atadas a su obra.
//
// SOLO server-side: usa la service role key para firmar las URLs.
//
// POR QUÉ NO ESTÁN EN ODOO: son ~2400 fotos de ~250 KB. Meterlas en `ir.attachment` consume
// la cuota de almacenamiento de Odoo Online, que se paga cara. Viven en Supabase Storage,
// igual que los adjuntos de habilitaciones. Ver scripts/importar-fotos-telegram.mjs.
//
// EL BUCKET ES PRIVADO, así que la foto no se sirve por una URL pública: se firma una URL
// temporal por foto. Es una llamada por lote y no por foto —`createSignedUrls` en plural—
// porque una obra puede tener veinticinco.

import { createClient } from "@supabase/supabase-js";
import type { FotoObra } from "@/lib/mapa-obras/tipos";
import { hoyAr } from "@/lib/mapa-obras/curva";

const BUCKET = "obras";
/**
 * Cuánto vive la URL firmada. Una hora alcanza de sobra para mirar el mapa y no obliga a
 * refirmar en cada render. El modo TV de la oficina recarga la respuesta antes de que venza.
 */
const VIGENCIA_URL = 3600;

/**
 * De a cuántas filas se lee. PostgREST corta cada respuesta en su `max-rows` (1000 por
 * defecto en Supabase) SIN avisar: con un `.limit(3000)` de una sola vez se perdían en
 * silencio todas las fotos después de la mil. Se pagina hasta que una página viene corta.
 */
const PAGINA = 1000;
/** Red contra un bucle: 20 000 fotos son ocho veces lo que hay hoy. Si se llega, se avisa. */
const TOPE_FILAS = 20_000;
/** Paths por llamada a createSignedUrls: el cuerpo del pedido no puede ser infinito. */
const LOTE_FIRMA = 300;

type FilaFoto = {
  id: string;
  odoo_venta_id: number;
  storage_path: string;
  descripcion: string | null;
  tomada_el: string | null;
  autor: string | null;
};

function servicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** "2026-09-01T14:00:00+00:00" → "2026-09-01" en Buenos Aires (una foto de las 22 h no salta de día). */
function diaDe(tomadaEl: string | null): string | null {
  if (!tomadaEl) return null;
  const d = new Date(tomadaEl);
  return Number.isNaN(d.getTime()) ? null : hoyAr(d);
}

/**
 * Las fotos de Telegram de esas ventas, agrupadas por venta, la más nueva primero.
 *
 * Devuelve un mapa vacío ante cualquier error en vez de tirar: que Supabase esté caído no
 * tiene por qué dejar sin mapa a nadie — las fotos son un extra, los puntos son la pantalla.
 */
export async function fetchFotosTelegram(ventaIds: number[]): Promise<Map<number, FotoObra[]>> {
  const salida = new Map<number, FotoObra[]>();
  if (ventaIds.length === 0) return salida;

  try {
    const db = servicio();
    const filas: FilaFoto[] = [];
    for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
      const { data, error } = await db
        .from("fotos_obra")
        .select("id, odoo_venta_id, storage_path, descripcion, tomada_el, autor")
        .in("odoo_venta_id", ventaIds)
        .eq("estado", "asignada")
        // `id` desempata: sin un orden total, dos páginas pueden repetir o saltear filas.
        .order("tomada_el", { ascending: false })
        .order("id")
        .range(desde, desde + PAGINA - 1);
      if (error) {
        console.error("[mapa-obras] fotos de Telegram:", error.message);
        break;
      }
      filas.push(...((data ?? []) as FilaFoto[]));
      if (!data || data.length < PAGINA) break;
      if (desde + PAGINA >= TOPE_FILAS) console.warn(`[mapa-obras] fotos de Telegram: se llegó al tope de ${TOPE_FILAS}, faltan fotos`);
    }
    if (!filas.length) return salida;

    // Los lotes se firman en paralelo: firmar es lo que más tarda de toda la respuesta del mapa.
    const lotes: string[][] = [];
    for (let i = 0; i < filas.length; i += LOTE_FIRMA) lotes.push(filas.slice(i, i + LOTE_FIRMA).map((f) => f.storage_path));
    const urlPorPath = new Map<string, string>();
    for (const { data: firmadas, error } of await Promise.all(lotes.map((l) => db.storage.from(BUCKET).createSignedUrls(l, VIGENCIA_URL)))) {
      if (error) console.error("[mapa-obras] firmar fotos de Telegram:", error.message);
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) urlPorPath.set(f.path, f.signedUrl);
    }

    for (const f of filas) {
      const url = urlPorPath.get(f.storage_path);
      // Sin URL firmada la miniatura saldría rota: mejor no mostrarla.
      if (!url) continue;
      const lista = salida.get(f.odoo_venta_id) ?? [];
      lista.push({ id: f.id, fecha: diaDe(f.tomada_el), descripcion: f.descripcion, url, origen: "telegram" });
      salida.set(f.odoo_venta_id, lista);
    }
    return salida;
  } catch (e) {
    console.error("[mapa-obras] fotos de Telegram:", e instanceof Error ? e.message : e);
    return salida;
  }
}
