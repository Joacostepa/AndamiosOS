import { NextResponse } from "next/server";
import { authenticate, OdooError, searchRead } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { cruzarCuadrillas } from "@/lib/panol/kiosco";
import { hoyBA } from "@/lib/panol/estado";

// GET /api/panol/kiosco/hoy
//
// Lo que el kiosco necesita de Odoo para PROPONER la obra: en qué OT está hoy cada
// cuadrilla según Planificación (x_aba_asignacion) y la lista de OTs activas para elegir
// otra. La obra no es obligatoria (docs §3): si esto falla, el kiosco sigue andando con
// "Sin obra · Taller/Depósito" y la última que usó cada uno.
//
// No usa fetchTablero: trae la semana entera con todos los campos del tablero, y acá
// alcanza con tres lecturas chicas.
//
// Las cuadrillas de Odoo se cruzan con las de AndamiosOS POR NOMBRE (ver cruzarCuadrillas):
// el vale se firma con `cuadrillas.id` de Supabase.

export const dynamic = "force-dynamic";

type M2O = [number, string] | false;

export type OtKiosco = { id: number; titulo: string; direccion: string | null };
export type CuadrillaHoy = { odooId: number; nombre: string; cuadrillaId: string | null; otId: number | null };
export type HoyKiosco = { fecha: string; cuadrillas: CuadrillaHoy[]; ots: OtKiosco[] };

const texto = (v: string | false | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET() {
  const fecha = hoyBA();
  try {
    await authenticate();
    const [cuadrillas, asignaciones, ots, locales] = await Promise.all([
      searchRead<{ id: number; x_name: string | false }>("x_aba_cuadrilla", [["x_activa", "=", true]], ["id", "x_name"], { order: "x_name" }),
      searchRead<{ x_ot_id: M2O; x_cuadrilla_id: M2O; x_orden_dia: number | false }>(
        "x_aba_asignacion",
        [["x_fecha", "=", fecha]],
        ["x_ot_id", "x_cuadrilla_id", "x_orden_dia"],
        { order: "x_orden_dia, id" },
      ),
      // Las mismas candidatas que el tablero: pendientes o en proceso, de contratos "Obra ".
      searchRead<{ id: number; x_name: string | false; x_direccion_obra: string | false }>(
        "x_aba_orden_trabajo",
        [["x_estado", "in", ["pendiente", "en_proceso"]], ["x_order_id.x_studio_tipo_de_contrato", "=", "Obra "]],
        ["id", "x_name", "x_direccion_obra"],
        { order: "id desc" },
      ),
      createClient().then((db) => db.from("cuadrillas").select("id, nombre")),
    ]);

    // Una cuadrilla con dos obras en el día: se propone la primera del orden del día.
    const otDe = new Map<number, number>();
    for (const a of asignaciones) {
      const c = Array.isArray(a.x_cuadrilla_id) ? a.x_cuadrilla_id[0] : null;
      const ot = Array.isArray(a.x_ot_id) ? a.x_ot_id[0] : null;
      if (c && ot && !otDe.has(c)) otDe.set(c, ot);
    }

    const otsKiosco: OtKiosco[] = ots.map((o) => ({ id: o.id, titulo: texto(o.x_name) ?? `OT ${o.id}`, direccion: texto(o.x_direccion_obra) }));
    // Una OT asignada hoy que ya no es candidata (se cerró ayer): igual se tiene que poder nombrar.
    const faltan = [...new Set(otDe.values())].filter((id) => !otsKiosco.some((o) => o.id === id));
    if (faltan.length) {
      const extra = await searchRead<{ id: number; x_name: string | false; x_direccion_obra: string | false }>(
        "x_aba_orden_trabajo", [["id", "in", faltan]], ["id", "x_name", "x_direccion_obra"],
      );
      otsKiosco.push(...extra.map((o) => ({ id: o.id, titulo: texto(o.x_name) ?? `OT ${o.id}`, direccion: texto(o.x_direccion_obra) })));
    }

    const respuesta: HoyKiosco = {
      fecha,
      cuadrillas: cruzarCuadrillas(
        cuadrillas.map((c) => ({ odooId: c.id, nombre: texto(c.x_name) ?? `Cuadrilla #${c.id}`, otId: otDe.get(c.id) ?? null })),
        (locales.data ?? []) as { id: string; nombre: string }[],
      ),
      ots: otsKiosco,
    };
    return NextResponse.json(respuesta);
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
