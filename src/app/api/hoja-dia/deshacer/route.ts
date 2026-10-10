import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deshacer } from "@/lib/hoja-dia/servicio";
import { conPermiso, fallo, invalidoZod, sesion } from "../_comun";

// POST /api/hoja-dia/deshacer { historialId } — el "Deshacer" de cualquier cambio: vuelve
// cada fila tocada a como estaba. Si algo cambió después (otra persona, el chofer desde su
// link), no toca nada y lo dice.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = z.object({ historialId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  try {
    return NextResponse.json({ ok: true, ...(await deshacer(await sesion(), guardia.userId, parsed.data.historialId)) });
  } catch (e) {
    return fallo(e);
  }
}
