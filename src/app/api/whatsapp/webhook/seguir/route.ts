import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaInternaValida, hayWhatsapp } from "@/lib/whatsapp/api";
import { procesarTelefono } from "@/lib/whatsapp/procesar";

// POST /api/whatsapp/webhook/seguir { telefono } — una función le pide a otra que siga con un
// teléfono. procesar.ts atiende UNA tanda por invocación (un turno puede durar 240 s y la
// función vive 300) y deja el resto pendiente: esto lo retoma en una función nueva.
//
// Cuelga de /api/whatsapp/webhook para quedar dentro de la misma excepción del proxy (sin
// sesión). La protege la firma interna (HMAC con la clave de la app y un prefijo propio).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Pedido = z.object({ telefono: z.string().regex(/^\d{8,15}$/) });

export async function POST(req: NextRequest) {
  const crudo = await req.text();
  if (!hayWhatsapp() || !firmaInternaValida(crudo, req.headers.get("x-firma-interna"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  let telefono: string;
  try {
    telefono = Pedido.parse(JSON.parse(crudo)).telefono;
  } catch {
    return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
  }
  const origen = req.nextUrl.origin;
  after(async () => {
    await procesarTelefono(createAdminClient(), telefono, { origen, esperar: false }).catch((e) => console.error("[whatsapp] seguir", telefono, e));
  });
  return NextResponse.json({ ok: true });
}
