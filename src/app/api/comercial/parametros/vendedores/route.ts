import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accesoDeFila, esAdmin, nivelEn } from "@/lib/auth/acceso";
import { createAdminClient } from "@/lib/supabase/admin";
import { hayWhatsapp } from "@/lib/whatsapp/api";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// GET   /api/comercial/parametros/vendedores — quién usa el asistente: el nombre que sale en
//       la propuesta y el WhatsApp con el que le escribe.
// PATCH /api/comercial/parametros/vendedores { usuarioId, nombreEnPropuesta?, whatsapp? }
//
// EL WHATSAPP LO CARGA SÓLO UN ADMIN: un número cargado acá le habla al asistente COMO esa
// persona (puede guardar presupuestos en Odoo en su nombre). El nombre en la propuesta lo
// puede cambiar quien edita los parámetros.

export const dynamic = "force-dynamic";

export type VendedorFila = {
  usuarioId: string;
  nombre: string;
  email: string;
  nivel: "ver" | "editar";
  nombreEnPropuesta: string | null;
  whatsapp: string | null;
  vinculadoOdoo: boolean;
  actualizado: string | null;
};

export async function GET() {
  const quien = await exigirModulo("parametros-cotizacion", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const [{ data: perfiles, error }, { data: filas }] = await Promise.all([
      db.from("user_profiles").select("id, nombre, apellido, email, rol, activo, permisos, debe_cambiar_clave").eq("activo", true),
      db.from("comercial_vendedores").select("usuario_id, nombre_en_propuesta, whatsapp, odoo_employee_id, odoo_vendedor_user_id, updated_at"),
    ]);
    if (error) throw error;
    const porUsuario = new Map((filas ?? []).map((f) => [f.usuario_id as string, f]));
    const vendedores: VendedorFila[] = [];
    for (const p of perfiles ?? []) {
      const nivel = nivelEn(accesoDeFila(p), "asistente-comercial");
      if (!nivel) continue;
      const f = porUsuario.get(p.id as string);
      vendedores.push({
        usuarioId: p.id as string,
        nombre: [p.nombre, p.apellido].filter(Boolean).join(" ") || (p.email as string),
        email: p.email as string,
        nivel,
        nombreEnPropuesta: (f?.nombre_en_propuesta as string | null) ?? null,
        whatsapp: (f?.whatsapp as string | null) ?? null,
        vinculadoOdoo: !!(f?.odoo_employee_id || f?.odoo_vendedor_user_id),
        actualizado: (f?.updated_at as string | null) ?? null,
      });
    }
    vendedores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return NextResponse.json({ vendedores, whatsappConfigurado: hayWhatsapp(), puedeCargarWhatsapp: esAdmin(quien.acceso) });
  } catch (e) {
    return errorResponse(e);
  }
}

const Cambio = z.object({
  usuarioId: z.string().uuid(),
  nombreEnPropuesta: z.string().trim().max(80).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
});

/** Celular argentino como lo informa WhatsApp: 549 + área + número (13 dígitos). Sin el 9, se agrega. */
function normalizarWhatsapp(entrada: string): string {
  const d = entrada.replace(/\D/g, "");
  if (!d.startsWith("54")) throw new Error("El WhatsApp va con el código de país: 54 9 11 5555 1234 (sin el 0 ni el 15).");
  const n = d.startsWith("549") ? d : `549${d.slice(2)}`;
  if (n.length !== 13) throw new Error("Un celular argentino son 13 dígitos: 54 9 + área + número, sin el 0 ni el 15.");
  return n;
}

export async function PATCH(req: NextRequest) {
  const parsed = Cambio.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("parametros-cotizacion", "editar");
  if (quien instanceof NextResponse) return quien;
  const { usuarioId, nombreEnPropuesta, whatsapp } = parsed.data;
  if (whatsapp !== undefined && !esAdmin(quien.acceso)) {
    return NextResponse.json({ error: "El WhatsApp lo carga un administrador: con ese número se le habla al asistente como esa persona." }, { status: 403 });
  }
  try {
    const cambios: Record<string, unknown> = { usuario_id: usuarioId, updated_at: new Date().toISOString() };
    if (nombreEnPropuesta !== undefined) cambios.nombre_en_propuesta = nombreEnPropuesta || null;
    if (whatsapp !== undefined) {
      try {
        cambios.whatsapp = whatsapp ? normalizarWhatsapp(whatsapp) : null;
      } catch (e) {
        return invalido(e instanceof Error ? e.message : String(e));
      }
    }
    const { error } = await createAdminClient().from("comercial_vendedores").upsert(cambios, { onConflict: "usuario_id" });
    if (error?.code === "23505") return invalido("Ese WhatsApp ya está cargado para otra persona.");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
