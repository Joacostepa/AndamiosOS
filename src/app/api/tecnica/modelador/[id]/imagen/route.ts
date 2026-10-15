import { NextRequest, NextResponse } from "next/server";
import { BUCKET_MODELOS, firmar, rutaPortada, traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { esPng, TOPE_IMAGEN_BYTES } from "@/lib/tecnica/persistencia/validar";
import { fallo, guardia, idInvalido, idValido, sesion } from "../../_comun";

// POST /api/tecnica/modelador/[id]/imagen — body: el PNG crudo (Content-Type: image/png, ≤ 5 MB)
// Sube la portada a Storage (bucket privado tec-modelos, <id>/portada.png, se reescribe) y la anota en
// tec_modelos.imagen_path. → { imagen_path, url } (url firmada por 10 minutos).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > TOPE_IMAGEN_BYTES) return NextResponse.json({ error: "La imagen pesa más de 5 MB." }, { status: 413 });
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > TOPE_IMAGEN_BYTES) return NextResponse.json({ error: "La imagen pesa más de 5 MB." }, { status: 413 });
    if (!esPng(bytes)) return NextResponse.json({ error: "La portada tiene que ser un PNG." }, { status: 400 });

    const db = await sesion();
    const { data: existe, error: e0 } = await db.from("tec_modelos").select("id").eq("id", id).is("archivado_at", null).maybeSingle();
    if (e0) throw traducirErrorDb(e0);
    if (!existe) return NextResponse.json({ error: "No encuentro el modelo." }, { status: 404 });

    const path = rutaPortada(id);
    const { error: eUp } = await db.storage.from(BUCKET_MODELOS).upload(path, bytes, { contentType: "image/png", upsert: true, cacheControl: "60" });
    if (eUp) {
      const sinBucket = /bucket.*not found/i.test(eUp.message);
      return NextResponse.json(
        { error: sinBucket ? "Falta crear el bucket tec-modelos (migración 20261015000003)." : `No se pudo subir la portada: ${eUp.message}` },
        { status: sinBucket ? 503 : 400 },
      );
    }
    const { error } = await db.from("tec_modelos").update({ imagen_path: path }).eq("id", id);
    if (error) throw traducirErrorDb(error);
    return NextResponse.json({ imagen_path: path, url: await firmar(db, path) });
  } catch (e) {
    return fallo(e);
  }
}
