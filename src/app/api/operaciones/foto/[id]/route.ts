import { NextResponse } from "next/server";
import { fetchFotoBinaria } from "@/lib/odoo/mapa-obras";
import { OdooError } from "@/lib/odoo/client";

// GET /api/operaciones/foto/[id] → el JPEG de una foto de parte diario.
//
// POR QUÉ NO SE USA /web/image DE ODOO: esa ruta sirve el binario con la sesión de Odoo del
// usuario en el browser, y la app no puede dar por hecho que quien mira el mapa tenga esa
// sesión abierta. Acá el binario se lee con la API key del servidor y se devuelve como
// imagen, así que funciona para cualquiera que esté logueado en la app.
//
// SE CACHEA FUERTE. Una foto de un parte ya cargado no cambia nunca: es un registro
// histórico de cómo quedó la obra ese día. Sin cache, cada apertura de la ficha del mapa
// serían ~200 KB por foto atravesando Odoo de nuevo.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const crudo = (await ctx.params).id;
  const id = Number(crudo);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Id de foto inválido" }, { status: 400 });
  }
  try {
    const bytes = await fetchFotoBinaria(id);
    if (!bytes) return NextResponse.json({ error: "La foto no existe" }, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        // `private`: es contenido de la empresa, no tiene que quedar en caches compartidas.
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
