import { NextRequest, NextResponse } from "next/server";
import { subirFotoRemito } from "@/lib/hoja-dia/publico";
import { MAX_FOTO } from "@/lib/hoja-dia/archivo-seguro";

// POST /api/public/hoja/:token/viaje/:id/foto  (multipart: foto) — la foto del remito que
// saca el chofer desde su link. Sin sesión: lo protege el token, y el viaje tiene que ser
// suyo y de ese día (subirFotoRemito). Sólo imágenes de verdad (por los bytes), hasta 4 MB;
// el celular la achica antes. Se guarda en el bucket privado `hoja-dia`.

export const dynamic = "force-dynamic";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Viaje inválido" }, { status: 400, headers: NOINDEX });
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_FOTO + 64 * 1024) return NextResponse.json({ error: "La foto es muy pesada (más de 4 MB)." }, { status: 413, headers: NOINDEX });
  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "Falta la foto" }, { status: 400, headers: NOINDEX });
  if (foto.size > MAX_FOTO) return NextResponse.json({ error: "La foto es muy pesada (más de 4 MB)." }, { status: 413, headers: NOINDEX });
  try {
    const r = await subirFotoRemito(token, id, new Uint8Array(await foto.arrayBuffer()));
    return r.ok ? NextResponse.json(r, { headers: NOINDEX }) : NextResponse.json({ error: r.error }, { status: r.status, headers: NOINDEX });
  } catch (e) {
    console.error("[hoja-dia] foto del remito", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo guardar la foto. Probá de nuevo." }, { status: 502, headers: NOINDEX });
  }
}
