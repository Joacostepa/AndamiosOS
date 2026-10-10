import { NextRequest, NextResponse } from "next/server";
import { read } from "@/lib/odoo/client";
import { archivoPermitido } from "@/lib/hoja-dia/publico";

// GET /api/public/hoja/:token/archivo/:id — un plano o una foto de una OT de la hoja de ese
// token, servido POR LA APP (§10): en Odoo sólo se ve con sesión de Odoo abierta, que en el
// celular del capataz no hay. Verifica que el adjunto sea de una obra de esa hoja; si no, 404.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  const adjunto = Number(id);
  if (!Number.isInteger(adjunto) || adjunto <= 0) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  try {
    if (!(await archivoPermitido(token, adjunto))) return NextResponse.json({ error: "El archivo no existe" }, { status: 404 });
    const [a] = await read<{ name: string | false; mimetype: string | false; datas: string | false }>("ir.attachment", [adjunto], ["name", "mimetype", "datas"]);
    if (!a?.datas) return NextResponse.json({ error: "El archivo está vacío" }, { status: 404 });
    const nombre = (a.name || `archivo-${adjunto}`).replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(Buffer.from(a.datas, "base64"), {
      headers: {
        "Content-Type": a.mimetype || "application/octet-stream",
        "Content-Disposition": `inline; filename="${nombre}"`,
        // Privado: lo guarda el celular (sin señal se sigue viendo), no un CDN.
        "Cache-Control": "private, max-age=3600",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    console.error("[hoja-dia] archivo público", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo traer el archivo" }, { status: 502 });
  }
}
