import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { escribirPermiso, fetchOt } from "@/lib/odoo/habilitaciones";
import { registrarGestion } from "@/lib/habilitaciones/servicio";
import { hoyISO } from "@/lib/habilitaciones/derivacion";
import { errorResponse, invalido, parseOtId, sesion } from "../../_comun";

// PATCH /api/habilitaciones/:otId/permiso
//
// EL PERMISO SE ESCRIBE EN LA VENTA, NO EN LA OT: es municipal, por dirección, y el
// armado y el desarme de la misma obra lo comparten. Por eso la ruta recibe la OT
// —que es lo que el usuario tiene delante— y resuelve la venta antes de escribir.
//
// Esta escritura SÍ va en el camino crítico, a diferencia del resto del módulo: son los
// tres campos que decide el candado del tablero, y una modalidad que tarda en llegar a
// Odoo es una jornada que se confirma con el dato viejo.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z
  .object({
    modalidad: z.enum(["sin_permiso", "con_expediente", "esperar_permiso"]).nullable().optional(),
    tramite: z.enum(["no_presentado", "presentado", "emitido"]).nullable().optional(),
    expedienteNro: z.string().trim().max(120).nullable().optional(),
    expedienteFecha: fecha.nullable().optional(),
    permisoFecha: fecha.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para actualizar");

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    const enOdoo = await fetchOt(otId);
    if (!enOdoo) return NextResponse.json({ error: "La OT no existe en Odoo" }, { status: 404 });
    if (!enOdoo.permiso.ventaId) {
      return invalido("La OT no tiene venta asociada: el permiso no tiene dónde guardarse");
    }

    const cambio = { ...parsed.data };
    // Sellar cuándo el técnico contestó es el dato que hoy no existe y que hace que 297
    // obras lleven una mediana de 399 días sin que nadie lo vea.
    const definiendo = "modalidad" in cambio && cambio.modalidad && !enOdoo.permiso.modalidad;
    if (definiendo) Object.assign(cambio, { modalidadDefinida: hoyISO() });

    await escribirPermiso(enOdoo.permiso.ventaId, cambio);

    const detalle = [
      definiendo ? `Modalidad: ${cambio.modalidad}` : null,
      "tramite" in cambio && cambio.tramite ? `Trámite: ${cambio.tramite}` : null,
      "expedienteNro" in cambio && cambio.expedienteNro ? `Expediente ${cambio.expedienteNro}` : null,
    ].filter(Boolean).join(" · ");
    if (detalle) await registrarGestion(db, otId, "permiso", detalle, userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
