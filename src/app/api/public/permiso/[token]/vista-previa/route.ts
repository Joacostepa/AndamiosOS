import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tramiteDeToken } from "@/lib/permisos-via-publica/portal";
import { generarActaCompromiso, generarNotaAutorizacion } from "@/lib/permisos-via-publica/documentos-firmados";
import type { TipoDueno } from "@/lib/permisos-via-publica/tipos";

// POST /api/public/permiso/:token/vista-previa — el acta de compromiso o la nota, como van a
// quedar, para que el cliente LAS LEA antes de firmar (JS, 15/09: en el portal no había forma
// de leerlas).
//
// Devuelve el PDF armado en el momento con lo que viene completando, SIN la firma y marcado
// como borrador. No guarda nada, no toca el legajo ni el estado del trámite: es sólo lectura.
// Lo que todavía no completó sale como "(a completar)" para que se vea dónde va cada dato.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FALTA = "(a completar)";

const schema = z.object({
  documento: z.enum(["acta", "nota"]),
  firmante: z.string().trim().max(120).optional(),
  dni: z.string().trim().max(20).optional(),
  caracter: z.string().trim().max(60).optional(),
  domicilio: z.string().trim().max(200).optional(),
  trabajos: z.string().trim().max(200).optional(),
});

function seisMesesDesdeHoy(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "No se pudo armar la vista previa" }, { status: 400 });

  const db = createAdminClient();
  const t = await tramiteDeToken(db, token);
  if (!t) return NextResponse.json({ error: "El link no es válido" }, { status: 404 });
  if (!t.titular_cargado_at || !t.tipo_dueno) {
    return NextResponse.json({ error: "Primero cargá quién es el dueño del lote." }, { status: 400 });
  }

  const d = parsed.data;
  const datos = {
    firmante: d.firmante?.trim() || FALTA,
    dni: d.dni?.replace(/\D/g, "") || FALTA,
    caracter: d.caracter?.trim() || FALTA,
    domicilio: d.domicilio?.trim() || FALTA,
    trabajos: d.trabajos?.trim() || FALTA,
  };
  const ahora = new Date();
  const contexto = {
    tipoDueno: t.tipo_dueno as TipoDueno,
    titularNombre: t.titular_nombre as string,
    titularCuit: t.titular_cuit as string,
    desde: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    hasta: (t.permiso_hasta as string | null) ?? seisMesesDesdeHoy(),
    domicilioElectronico: process.env.PERMISOS_MAIL ?? "js@andamiosbuenosaires.com.ar",
    firmadoAt: ahora,
  };

  try {
    let pdf: Uint8Array;
    if (d.documento === "acta") {
      pdf = await generarActaCompromiso(datos, null, contexto);
    } else {
      const logo = await db.storage.from("empresa").download("logo.png")
        .then(async (r) => (r.data ? Buffer.from(await r.data.arrayBuffer()) : null))
        .catch(() => null);
      pdf = await generarNotaAutorizacion(datos, null, contexto, logo);
    }
    const nombre = d.documento === "acta" ? "acta-de-compromiso-borrador.pdf" : "nota-borrador.pdf";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
