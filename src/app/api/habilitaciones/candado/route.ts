import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { permisosDeOts } from "@/lib/odoo/habilitaciones";
import { friccionDelTablero } from "@/lib/habilitaciones/derivacion";
import {
  contarConsultas, hayConsultaReciente, registrarGestion,
} from "@/lib/habilitaciones/servicio";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { db as clienteDeSesion, errorResponse, invalido } from "../_comun";
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
//
// Y SÓLO APLICA A LO QUE ARMA. El permiso vive en la venta, o sea que es de la obra
// entera: sin mirar qué hace cada OT, el desarme heredaba el freno del armado y
// Operaciones tenía que escribir un motivo para sacar de la calle un andamio que ya
// estaba puesto. Por eso se lee el tipo de OT junto con el permiso.
//
// LO USA QUIEN PLANIFICA, NO SÓLO HABILITACIONES. En APIS (acceso.ts) este prefijo admite
// Habilitaciones o Planificación: Depósito y Campo planifican sin el módulo de
// habilitaciones, recibían 403 y el tablero confirmaba sin fricción (el candado fallaba
// abierto; auditoría del 08/10, guardias-contrato.md §3). Sigue con la sesión y no con la
// service role: la RLS de hab_gestiones deja leer e insertar a cualquier autenticado (es
// append-only: sin UPDATE ni DELETE), así que Depósito y Campo ya pasan y no hace falta la
// llave maestra. Lo que separa a quien mira de quien registra es la segunda llave del POST.

export const dynamic = "force-dynamic";

export type FriccionDeOt = { otId: number; friccion: Friccion; pedidosPrevios: number };

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("otIds") ?? "";
  const otIds = raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (otIds.length === 0) return NextResponse.json({ fricciones: [] });

  try {
    // Sin auth.getUser(): la lectura no tiene autor y la RLS la aplica Postgres con el JWT.
    const db = await clienteDeSesion();
    const permisos = await permisosDeOts(otIds);

    const fricciones: FriccionDeOt[] = await Promise.all(
      otIds.map(async (otId) => {
        const fila = permisos.get(otId);
        const friccion = fila ? friccionDelTablero(fila.permiso, fila.tipoOt) : null;
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
  // Segunda llave: Habilitaciones o Planificación en "editar" (la misma regla que el proxy).
  // El autor de la gestión sale de acá, sin volver a preguntarle a Supabase quién es.
  const llave = await exigirPermisoDeApi(req);
  if (llave instanceof NextResponse) return llave;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  const { otId, tipo, motivo } = parsed.data;

  // Una excepción sin motivo es una excepción que no se puede auditar, que es lo mismo
  // que no registrarla. Acá el dato lo tiene quien confirma, así que se le puede exigir.
  if (tipo === "excepcion" && !motivo?.trim()) {
    return invalido("La excepción necesita un motivo escrito");
  }

  try {
    const db = await clienteDeSesion();
    const userId = llave.userId;

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
