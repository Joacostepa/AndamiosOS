import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { declararHabilitacion, fetchGestionDe } from "@/lib/habilitaciones/servicio";
import { fetchOt, leerOt } from "@/lib/odoo/habilitaciones";
import { claveDe, crearAlertas } from "@/lib/alertas/servicio";
import { errorResponse, invalido, parseOtId, sesion, sincronizarLuego } from "../../_comun";

// POST /api/habilitaciones/:otId/habilitacion — declarar la obra habilitada, o revertir.
//
// HABILITAR ES UNA DECISIÓN, NO UN EFECTO. Antes la obra pasaba sola a habilitada al
// aprobar el último papel: el semáforo se ponía verde y la obra se destrababa en el
// tablero sin que nadie se hiciera cargo, y sin que quedara registrado quién fue.
//
// El motivo es obligatorio SÓLO cuando se habilita con requisitos sin aprobar. Esa
// excepción existe a propósito: a veces el cliente autoriza por teléfono y los papeles
// llegan después, y un sistema que no admite eso se termina esquivando por afuera.

export const dynamic = "force-dynamic";

const schema = z
  .object({
    habilitar: z.boolean(),
    /** Requisitos sin aprobar al momento de habilitar. Lo cuenta el cliente. */
    faltan: z.number().int().min(0).default(0),
    motivo: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => !v.habilitar || v.faltan === 0 || !!v.motivo?.trim(), {
    message: "Habilitar sin todos los requisitos aprobados necesita un motivo escrito",
  });

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    await declararHabilitacion(db, otId, {
      habilitar: parsed.data.habilitar,
      // Sin faltantes no hay excepción que documentar, aunque el cliente mande texto.
      motivo: parsed.data.faltan > 0 ? (parsed.data.motivo?.trim() ?? null) : null,
      autorId: userId,
    });
    sincronizarLuego(db, otId);
    if (parsed.data.habilitar) avisarHabilitada(db, otId, parsed.data.faltan > 0);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Avisa a operaciones que la obra quedó habilitada.
 *
 * Es EL aviso de este módulo para la otra oficina: habilitar es el gate que destraba la
 * obra en el tablero, y hasta ahora quien planifica se enteraba sólo si volvía a mirar
 * la pantalla. Si Agustina habilita a las cuatro de la tarde, operaciones lo sabe a las
 * cuatro de la tarde.
 *
 * Corre DESPUÉS de responder, igual que el push a Odoo: necesita leer el título de la OT
 * —otro RPC de ~800 ms— y nadie va a esperar por el texto de una notificación. Sólo al
 * habilitar: revertir no genera aviso, y por la clave única tampoco lo genera volver a
 * habilitar después.
 */
function avisarHabilitada(db: SupabaseClient, otId: number, porExcepcion: boolean) {
  after(async () => {
    try {
      const ot = await fetchOt(otId);
      const titulo = ot ? leerOt(ot.ot).titulo : `OT ${otId}`;
      await crearAlertas(db, [
        {
          tipo: "ot_habilitada",
          clave: claveDe("ot_habilitada", otId),
          titulo: `Habilitada — ${titulo}`,
          descripcion: porExcepcion
            ? "Habilitada por excepción, con requisitos sin aprobar. Ya se puede programar."
            : "Ya se puede programar.",
          prioridad: "alta",
          enlace: `/ordenes-trabajo/${otId}`,
        },
      ]);
    } catch (e) {
      console.error(`[alertas] no se pudo avisar la habilitación de la OT ${otId}`, e);
    }
  });
}
