import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { DemasiadosPedidos, accionPublica, anotarVista, vistaPublica } from "@/lib/hoja-dia/publico";

// GET /api/public/hoja/:token — lo que ve el capataz o el chofer en su celular (§12), sin
// usuario: la hoja de su cuadrilla o sus viajes de ese día, y nada más. Lo protege el token
// (32 caracteres al azar, de esa persona y ese día, vence a las 23:59 del día siguiente).
// Si el link no sirve, dice por qué ("Ya no estás a cargo", "Este link era de…") sin datos.
// Abrirlo marca "Abierta" en el escritorio (después de responder).
//
// POST /api/public/hoja/:token { accion: "recibido" | "entendido", version } — confirma la versión que vio
//   (si la hoja cambió después de esa versión: 409, "Esa hoja cambió, mirá la nueva").
// POST { accion: "hecho" | "deshacer", viajeId } y { accion: "no_pude", viajeId, motivo } — el chofer,
//   sólo sobre SUS viajes. `at` (ISO, opcional): cuándo se tocó, si se mandó después sin señal.

export const dynamic = "force-dynamic";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const { vista, link } = await vistaPublica(token);
    if (link && vista.situacion !== "invalido") after(() => anotarVista(link));
    return NextResponse.json(vista, { status: vista.situacion === "invalido" ? 404 : 200, headers: NOINDEX });
  } catch (e) {
    if (e instanceof DemasiadosPedidos) return NextResponse.json({ error: e.message }, { status: 429, headers: NOINDEX });
    console.error("[hoja-dia] link público", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo cargar la hoja. Probá de nuevo en un rato." }, { status: 502, headers: NOINDEX });
  }
}

const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.enum(["recibido", "entendido"]), version: z.number().int().min(0).nullable().optional(), at: z.string().datetime().nullable().optional() }),
  z.object({ accion: z.enum(["hecho", "deshacer"]), viajeId: z.string().uuid(), at: z.string().datetime().nullable().optional() }),
  z.object({ accion: z.literal("no_pude"), viajeId: z.string().uuid(), motivo: z.string().trim().min(1).max(120), at: z.string().datetime().nullable().optional() }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido" }, { status: 400, headers: NOINDEX });
  const { at, ...accion } = parsed.data;
  const r = await accionPublica(token, accion, at);
  return r.ok ? NextResponse.json(r, { headers: NOINDEX }) : NextResponse.json({ error: r.error }, { status: r.status, headers: NOINDEX });
}
