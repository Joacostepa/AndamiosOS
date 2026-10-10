import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desvincular, estadoTelegram, linkDeVinculacion } from "@/lib/hoja-dia/envios";
import { conPermiso, fallo, invalidoZod } from "../_comun";

// GET /api/hoja-dia/telegram — si el bot está configurado, su usuario y quiénes vincularon.
// POST /api/hoja-dia/telegram { accion: "vincular", personaId } → { link, waLink, texto }:
//   el link t.me/<bot>?start=<código> de un solo uso, que se le manda UNA VEZ a la persona
//   (por WhatsApp o en persona). Al tocarlo, el webhook la vincula.
// POST { accion: "desvincular", personaId } — las hojas se le vuelven a mandar a mano.

export const dynamic = "force-dynamic";

const schema = z.object({ accion: z.enum(["vincular", "desvincular"]), personaId: z.string().uuid() });

export async function GET() {
  const guardia = await conPermiso(["hoja-dia"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  try {
    return NextResponse.json(await estadoTelegram());
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    if (parsed.data.accion === "vincular") return NextResponse.json({ ok: true, ...(await linkDeVinculacion(guardia.userId, parsed.data.personaId)) });
    return NextResponse.json(await desvincular(guardia.userId, parsed.data.personaId));
  } catch (e) {
    return fallo(e);
  }
}
