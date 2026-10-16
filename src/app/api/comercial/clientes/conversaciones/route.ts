import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin, nivelEn } from "@/lib/auth/acceso";
import { numeroClientes } from "@/lib/whatsapp/api";
import { listarCharlas } from "@/lib/clientes/bandeja";
import { iaClientesActiva } from "@/lib/clientes/interruptor";
import type { ListaCharlas } from "@/lib/clientes/vista";
import { errorResponse, exigirModulo } from "../../_comun";

// GET /api/comercial/clientes/conversaciones — la bandeja: todas las abiertas y las últimas
// cerradas, lo último primero. Todos ven todas (docs/clientes/crm-propuesta.md §7): los
// filtros «Para vos», «Todas» y «Cerradas» los hace la pantalla. La pantalla consulta cada
// pocos segundos.

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const [charlas, iaActiva] = await Promise.all([listarCharlas(db), iaClientesActiva(db)]);
    const cuerpo: ListaCharlas = {
      yo: quien.userId,
      puedeEditar: nivelEn(quien.acceso, "clientes-whatsapp") === "editar",
      iaActiva,
      esAdmin: esAdmin(quien.acceso),
      numeroConfigurado: !!numeroClientes(),
      charlas,
    };
    return NextResponse.json(cuerpo);
  } catch (e) {
    return errorResponse(e);
  }
}
