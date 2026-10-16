import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErrorTarjeta, pdfVistaPrevia } from "@/lib/clientes/aprobar";
import type { CorreccionPedida } from "@/lib/clientes/vista-aprobacion";
import { errorResponse, exigirModulo, invalido } from "../../../../../../_comun";

// GET /api/comercial/clientes/conversaciones/:id/aprobaciones/:aprobacionId/pdf — la vista
// previa del PDF que le va a llegar al cliente (marca BORRADOR y sin número: el número lo pone
// Odoo al aprobar). ?correccion=<JSON> la arma con la corrección que se está probando. No guarda
// nada: se genera en el momento.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const correccion = z.object({
  tipo: z.enum(["metros", "piezas", "precio", "texto", "otro"]),
  motivo: z.string().trim().min(3).max(500),
  metros: z.number().positive().max(500).optional(),
  precioMl: z.number().positive().max(100_000_000).optional(),
  concertina: z.enum(["opcional", "base", "no"]).optional(),
  gestoria: z.enum(["opcional", "base", "no"]).optional(),
  texto: z.string().max(5000).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; aprobacionId: string }> }) {
  const { id, aprobacionId } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(aprobacionId).success) return invalido("Id inválido");
  let pedida: CorreccionPedida | null = null;
  const crudo = req.nextUrl.searchParams.get("correccion");
  if (crudo) {
    let json: unknown = null;
    try {
      json = JSON.parse(crudo);
    } catch {
      return invalido("La corrección no se pudo leer.");
    }
    const p = correccion.safeParse(json);
    if (!p.success) return invalido(p.error);
    pedida = p.data;
  }
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const { pdf, nombre } = await pdfVistaPrevia(createAdminClient(), id, aprobacionId, pedida);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErrorTarjeta) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
