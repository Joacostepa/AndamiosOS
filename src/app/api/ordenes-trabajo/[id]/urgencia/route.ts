import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { marcarUrgencia } from "@/lib/odoo/ordenes";
import { OdooError, read } from "@/lib/odoo/client";
import { claveDe, crearAlertas } from "@/lib/alertas/servicio";

// POST /api/ordenes-trabajo/:id/urgencia — marcar (o desmarcar) la OT como urgente.
//
// LA URGENCIA VIVE EN ODOO (`x_urgencia`), donde ya la leen el tablero y el listado.
// Esta ruta no inventa un segundo lugar donde guardarla: escribe en el mismo campo que
// una persona escribiría entrando a Odoo. Lo que agrega es poder hacerlo desde donde se
// trabaja — que es el motivo por el que el campo estaba en cero.
//
// NO ESPERA A ODOO PARA RESPONDER: acá sí espera. La escritura es un RPC de ~800 ms y es
// el resultado que el usuario pidió; devolver "listo" antes de saberlo sería mentir sobre
// el único gesto de la pantalla. El aviso, en cambio, no puede voltear la marcación.
//
// LA SEGUNDA LLAVE (exigirPermisoDeApi: Órdenes de trabajo o Planificación en "editar", la
// misma regla que el proxy). Antes sólo miraba que hubiera sesión, y la urgencia abre las
// guardias: una OT alta o media creada en los últimos 3 días hábiles usa una guardia sin
// pedirle nada a JS (guardias-contrato.md §1.3). Quien sólo mira el tablero (Comercial) no
// puede volver urgente una obra para que entre en una guardia.
//
// EL AVISO VA CON LA SERVICE ROLE, DESPUÉS DE LA LLAVE. La política de `alertas` sólo deja
// insertar a admin y operativo (get_user_role), así que cuando "Meter urgente" lo tocaba
// Depósito o Campo —que sí pueden marcar— la OT quedaba urgente y nadie se enteraba (el
// error se tragaba en el log). Es el mismo criterio que la Hoja del día y Sistemas: quien
// llama ya está validado, y el contenido del aviso lo arma esta ruta, no el cuerpo.

export const dynamic = "force-dynamic";

const schema = z
  .object({
    urgencia: z.enum(["baja", "media", "alta"]),
    motivo: z.string().trim().max(500).nullable().optional(),
  })
  // El motivo es obligatorio al marcar urgente: una OT que salta al tope de la bandeja
  // sin decir por qué obliga a preguntarle a quien la marcó, y eso es exactamente el
  // WhatsApp que este módulo existe para no necesitar.
  .refine((v) => v.urgencia !== "alta" || !!v.motivo?.trim(), {
    message: "Marcar una OT como urgente necesita un motivo escrito",
  });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;

  const otId = Number((await ctx.params).id);
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" · ") },
      { status: 400 },
    );
  }

  const { urgencia, motivo } = parsed.data;
  const texto = motivo?.trim() || null;

  try {
    await marcarUrgencia(otId, urgencia, texto);
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // El aviso se crea acá y no sólo en el barrido para que sea inmediato: si alguien marca
  // una OT urgente a las diez, el resto de operaciones lo ve a las diez y no al día
  // siguiente. El barrido sigue existiendo para lo que se marque directo en Odoo, y la
  // clave única hace que el segundo intento no duplique nada.
  //
  // Después de responder: el título sale de otro RPC y nadie espera por el texto de una
  // notificación. El título va en el aviso —y no sólo el id— porque "Urgente — OT 8412"
  // no le dice a nadie si le toca.
  if (urgencia === "alta") {
    after(async () => {
      try {
        const [fila] = await read<{ x_name: string | false }>(
          "x_aba_orden_trabajo", [otId], ["x_name"],
        );
        const titulo = typeof fila?.x_name === "string" && fila.x_name.trim() ? fila.x_name : `OT #${otId}`;
        await crearAlertas(createAdminClient(), [
          {
            tipo: "ot_urgente",
            clave: claveDe("ot_urgente", otId),
            titulo: `Urgente — ${titulo}`,
            descripcion: texto,
            prioridad: "critica",
            enlace: `/ordenes-trabajo/${otId}`,
          },
        ]);
      } catch (e) {
        console.error(`[alertas] no se pudo avisar la urgencia de la OT ${otId}`, e);
      }
    });
  }

  return NextResponse.json({ ok: true, urgencia, motivo: urgencia === "alta" ? texto : null });
}
