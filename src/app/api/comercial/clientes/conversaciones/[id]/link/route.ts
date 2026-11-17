import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearLink, cortarLinks, linkVigente, urlDelLink, type LinkCharla } from "@/lib/clientes/link-charla";
import { anotarEvento } from "@/lib/clientes/webhook";
import { leerCharla, nombresDe } from "@/lib/clientes/bandeja";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// El link para compartir la charla (JS, 16/11). Ver src/lib/clientes/link-charla.ts.
// GET    — el vigente ({ link: null } si no hay).
// POST   — el vigente o uno nuevo por 30 días. Queda como evento en el hilo.
// DELETE — corta los vigentes (dejan de abrir enseguida).

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
/** El dominio por el que entró quien lo pide (en producción, andamios-os.vercel.app). */
const origen = (req: NextRequest) => req.nextUrl.origin;
const vista = (req: NextRequest, l: LinkCharla | null) => ({ link: l ? { url: urlDelLink(origen(req), l.token), venceAt: l.venceAt, visitas: l.visitas } : null });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    return NextResponse.json(vista(req, await linkVigente(createAdminClient(), id)));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    if (!(await leerCharla(db, id))) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const antes = await linkVigente(db, id);
    const l = await crearLink(db, id, quien.userId);
    if (!antes) {
      const nombre = (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien";
      await anotarEvento(db, id, `${nombre} generó un link para compartir la charla (vence el ${new Date(l.venceAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}).`, quien.userId);
    }
    return NextResponse.json(vista(req, l));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const n = await cortarLinks(db, id, quien.userId);
    if (n) {
      const nombre = (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien";
      await anotarEvento(db, id, `${nombre} cortó el link de la charla: ya no abre.`, quien.userId);
    }
    return NextResponse.json({ ok: true, cortados: n });
  } catch (e) {
    return errorResponse(e);
  }
}
