import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { permisosDeOts } from "@/lib/odoo/habilitaciones";
import { friccionDelTablero } from "@/lib/habilitaciones/derivacion";
import {
  contarConsultas, hayConsultaReciente, registrarGestion,
} from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, sesion } from "../_comun";
import type { Friccion } from "@/lib/habilitaciones/derivacion";

// El candado del tablero.
//
//   GET  ?otIds=1,2,3 → qué fricción tiene cada OT al confirmar
//   POST              → registra el pedido al técnico o la excepción, al confirmar
//
// SÓLO LEE ODOO. Los tres campos que deciden —x_permiso_modalidad, x_tramite_estado,
// x_expediente_nro— viven todos en sale.order, así que el tablero nunca necesita a
// Supabase para saber si una jornada se puede confirmar. Si Supabase estuviera caído la
// planificación sigue funcionando y sólo se pierde la gestión documental.
//
// LA DOCUMENTACIÓN NO ENTRA ACÁ. Sigue siendo advertencia, como hoy: es papelería
// nuestra que se resuelve en el día. La modalidad de permiso es una instrucción del
// cliente sobre cómo asumir un riesgo legal, y saltearla no es un atraso administrativo.

export const dynamic = "force-dynamic";

export type FriccionDeOt = { otId: number; friccion: Friccion; pedidosPrevios: number };

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("otIds") ?? "";
  const otIds = raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (otIds.length === 0) return NextResponse.json({ fricciones: [] });

  try {
    const { db } = await sesion();
    const permisos = await permisosDeOts(otIds);

    const fricciones: FriccionDeOt[] = await Promise.all(
      otIds.map(async (otId) => {
        const permiso = permisos.get(otId);
        const friccion = permiso ? friccionDelTablero(permiso) : null;
        return {
          otId,
          friccion,
          pedidosPrevios:
            friccion?.tipo === "pedir_modalidad" ? await contarConsultas(db, otId) : 0,
        };
      }),
    );
    return NextResponse.json({ fricciones });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  otId: z.number().int().positive(),
  // `consulta` = se confirmó sin modalidad definida y se registra el pedido al técnico.
  // `excepcion` = se salteó un bloqueo o se confirmó sin número de expediente.
  tipo: z.enum(["consulta", "excepcion"]),
  motivo: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  const { otId, tipo, motivo } = parsed.data;

  // Una excepción sin motivo es una excepción que no se puede auditar, que es lo mismo
  // que no registrarla. Acá el dato lo tiene quien confirma, así que se le puede exigir.
  if (tipo === "excepcion" && !motivo?.trim()) {
    return invalido("La excepción necesita un motivo escrito");
  }

  try {
    const { db, userId } = await sesion();

    if (tipo === "consulta") {
      // DEDUPLICADO: un bloque de 4 jornadas confirmadas no puede dejar 4 pedidos
      // idénticos al mismo técnico. Si hay uno reciente se omite y se avisa.
      if (await hayConsultaReciente(db, otId)) {
        return NextResponse.json({ ok: true, registrada: false, motivo: "ya_pedido" });
      }
      const previos = await contarConsultas(db, otId);
      await registrarGestion(
        db, otId, "consulta",
        `${previos + 1}º pedido de modalidad de permiso al técnico`,
        userId,
      );
      return NextResponse.json({ ok: true, registrada: true, pedido: previos + 1 });
    }

    await registrarGestion(db, otId, "excepcion", motivo!.trim(), userId);
    return NextResponse.json({ ok: true, registrada: true });
  } catch (e) {
    return errorResponse(e);
  }
}
