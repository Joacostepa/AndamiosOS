// Las fotos que la cuadrilla mandó al grupo de Telegram, ya atadas a su obra.
//
// SOLO server-side: usa la service role key para firmar las URLs.
//
// POR QUÉ NO ESTÁN EN ODOO: son 2394 fotos de ~250 KB. Meterlas en `ir.attachment` consume
// la cuota de almacenamiento de Odoo Online, que se paga cara. Viven en Supabase Storage,
// igual que los adjuntos de habilitaciones. Ver scripts/importar-fotos-telegram.mjs.
//
// EL BUCKET ES PRIVADO, así que la foto no se sirve por una URL pública: se firma una URL
// temporal por foto. Es una llamada por lote y no por foto —`createSignedUrls` en plural—
// porque una obra puede tener veinticinco.

import { createClient } from "@supabase/supabase-js";
import type { FotoObra } from "@/lib/odoo/mapa-obras";

const BUCKET = "obras";
/**
 * Cuánto vive la URL firmada. Una hora alcanza de sobra para mirar el mapa y no obliga a
 * refirmar en cada render; la respuesta del mapa se cachea cinco minutos.
 */
const VIGENCIA_URL = 3600;

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

/**
 * Las fotos de Telegram de esas ventas, agrupadas por venta.
 *
 * Devuelve un mapa vacío ante cualquier error en vez de tirar: que Supabase esté caído no
 * tiene por qué dejar sin mapa a nadie — las fotos son un extra, los puntos son la pantalla.
 */
export async function fetchFotosTelegram(ventaIds: number[]): Promise<Map<number, FotoObra[]>> {
  const salida = new Map<number, FotoObra[]>();
  if (ventaIds.length === 0) return salida;

  try {
    const db = servicio();
    const { data, error } = await db
      .from("fotos_obra")
      .select("id, odoo_venta_id, storage_path, descripcion, tomada_el, autor")
      .in("odoo_venta_id", ventaIds)
      .eq("estado", "asignada")
      .order("tomada_el", { ascending: false })
      .limit(3000);
    if (error || !data?.length) return salida;

    const filas = data as FilaFoto[];
    const { data: firmadas } = await db.storage
      .from(BUCKET)
      .createSignedUrls(filas.map((f) => f.storage_path), VIGENCIA_URL);
    const urlPorPath = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

    for (const f of filas) {
      const url = urlPorPath.get(f.storage_path);
      // Sin URL firmada la miniatura saldría rota: mejor no mostrarla.
      if (!url) continue;
      const lista = salida.get(f.odoo_venta_id) ?? [];
      lista.push({
        id: f.id,
        fecha: f.tomada_el ? f.tomada_el.slice(0, 10) : null,
        descripcion: f.descripcion,
        url,
        origen: "telegram",
      });
      salida.set(f.odoo_venta_id, lista);
    }
    return salida;
  } catch {
    return salida;
  }
}
