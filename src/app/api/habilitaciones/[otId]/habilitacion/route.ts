import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contarReversiones, declararHabilitacion, fetchGestionDe,
} from "@/lib/habilitaciones/servicio";
import { fetchOt, leerOt } from "@/lib/odoo/habilitaciones";
import { claveDe, crearAlertas } from "@/lib/alertas/servicio";
import { errorResponse, invalido, parseOtId, sesion, sincronizarLuego } from "../../_comun";

// POST /api/habilitaciones/:otId/habilitacion — declarar la obra habilitada, o revertir.
//
// HABILITAR ES UNA DECISIÓN, NO UN EFECTO. Antes la obra pasaba sola a habilitada al
// aprobar el último papel: el semáforo se ponía verde y la obra se destrababa en el
// tablero sin que nadie se hiciera cargo, y sin que quedara registrado quién fue.
//
// El motivo es obligatorio cuando se habilita con requisitos sin aprobar —esa excepción
// existe a propósito: a veces el cliente autoriza por teléfono y los papeles llegan
// después, y un sistema que no admite eso se termina esquivando por afuera— y SIEMPRE al
// revertir, porque viaja en el aviso a Operaciones (decisión de JS, 09/10).

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
  })
  .refine((v) => v.habilitar || !!v.motivo?.trim(), {
    message: "Revertir la habilitación necesita un motivo: lo lee Operaciones",
  });

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    const { habilitar, faltan } = parsed.data;
    // Al habilitar sin faltantes no hay excepción que documentar, aunque el cliente mande
    // texto. Al revertir el motivo va siempre.
    const motivo = !habilitar || faltan > 0 ? (parsed.data.motivo?.trim() ?? null) : null;
    await declararHabilitacion(db, otId, { habilitar, motivo, autorId: userId });
    sincronizarLuego(db, otId);
    avisar(db, otId, { habilitada: habilitar, porExcepcion: habilitar && faltan > 0, motivo });
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Avisa a operaciones lo que pasó con la habilitación, en los dos sentidos.
 *
 * Es EL aviso de este módulo para la otra oficina: habilitar es el gate que destraba la
 * obra en el tablero, y hasta ahora quien planifica se enteraba sólo si volvía a mirar
 * la pantalla. Si Agustina habilita a las cuatro de la tarde, operaciones lo sabe a las
 * cuatro de la tarde.
 *
 * REVERTIR TAMBIÉN AVISA, y antes no lo hacía. Era la mitad fea del par: la habilitación
 * gritaba "ya se puede programar" y la vuelta atrás era muda. El problema no es simétrico
 * —es peor—: si la obra ya se planificó apoyada en esa habilitación, nadie tiene por qué
 * volver a mirar la ficha, así que la caída se descubría el día que la cuadrilla no podía
 * entrar. Y revertir no despanifica, así que la jornada sigue en el tablero: el aviso lo
 * dice, porque sacarla es una decisión de quien planifica.
 *
 * Va en `critica` mientras que la habilitación va en `alta`. No es que importe más: es que
 * la habilitación habilita a hacer algo —se puede ignorar y no pasa nada— y esto INVALIDA
 * algo que quizás ya se hizo.
 *
 * Corre DESPUÉS de responder, igual que el push a Odoo: necesita leer el título de la OT
 * —otro RPC— y nadie va a esperar por el texto de una notificación.
 *
 * AVISA CADA VEZ, no una por obra para siempre. La clave lleva cuántas reversiones hubo
 * (contarReversiones): antes era una por tipo y por OT, así que la segunda reversión no
 * avisaba y —peor— volver a habilitar después de revertir tampoco. Operaciones se quedaba
 * con "se revirtió, revisá las jornadas" como última noticia de una obra que ya se podía
 * armar. Pasó con Corrientes 4285. Decisión de JS (09/10): que avise.
 *
 * La primera habilitación y la primera reversión conservan la clave de siempre, así las
 * obras que ya avisaron antes de este cambio no vuelven a avisar.
 */
function avisar(
  db: SupabaseClient,
  otId: number,
  v: { habilitada: boolean; porExcepcion: boolean; motivo: string | null },
) {
  after(async () => {
    try {
      const [ot, reversiones] = await Promise.all([fetchOt(otId), contarReversiones(db, otId)]);
      const titulo = ot ? leerOt(ot.ot).titulo : `OT ${otId}`;
      await crearAlertas(db, [
        v.habilitada
          ? {
              tipo: "ot_habilitada",
              // Habilitar después de N reversiones es la novedad N+1.
              clave: claveDe("ot_habilitada", otId, reversiones > 0 ? `tras-${reversiones}` : undefined),
              titulo: `${reversiones > 0 ? "Habilitada de nuevo" : "Habilitada"} — ${titulo}`,
              descripcion: v.porExcepcion
                ? "Habilitada por excepción, con requisitos sin aprobar. Ya se puede programar."
                : "Ya se puede programar.",
              prioridad: "alta",
              enlace: `/ordenes-trabajo/${otId}`,
            }
          : {
              tipo: "ot_deshabilitada",
              // La reversión ya está en el historial, así que la primera cuenta 1.
              clave: claveDe("ot_deshabilitada", otId, reversiones > 1 ? `${reversiones}` : undefined),
              titulo: `Se revirtió la habilitación — ${titulo}`,
              descripcion:
                `${v.motivo ? `Motivo: ${v.motivo}. ` : ""}La obra volvió a estar sin habilitar. Si ya tenía jornadas planificadas, siguen en el tablero: revisalas.`,
              prioridad: "critica",
              enlace: `/ordenes-trabajo/${otId}`,
            },
      ]);
    } catch (e) {
      console.error(`[alertas] no se pudo avisar el cambio de habilitación de la OT ${otId}`, e);
    }
  });
}
