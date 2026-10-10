import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { read } from "@/lib/odoo/client";
import type { OdooM2O } from "@/lib/odoo/obras";
import { consumo, type MovConsumo, type PorConsumo } from "@/lib/panol/consumo";

// GET /api/panol/consumo?por=obra|cuadrilla|persona&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// El consumo neto del período, agrupado y valorizado (la cuenta está en lib/panol/consumo.ts).
// Va por una ruta y no directo a Supabase por una sola razón: los nombres de las OT están en
// Odoo, y a Odoo se le habla sólo desde el servidor. Lee con la sesión del usuario: la RLS
// del pañol decide qué se ve, igual que en las pantallas.
//
// Si Odoo no contesta, el informe sale igual con "OT 4812" pelado y un aviso: el número es
// lo que importa para cerrar una obra; el nombre es comodidad.

export const dynamic = "force-dynamic";

const CAMPOS = "id, vale_id, tipo, articulo_id, cantidad, desde, hacia, odoo_ot_id, cuadrilla_id, quien_tipo, quien_id, anula_a, created_at";
const LOTE = 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El día siguiente (YYYY-MM-DD): el período es [desde, hasta] inclusive. */
function diaSiguiente(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function leerMovimientos(db: SupabaseClient, desde: string, hasta: string): Promise<MovConsumo[]> {
  const filas: MovConsumo[] = [];
  // Las fechas son de Buenos Aires (UTC−3 todo el año: no hay horario de verano).
  for (let desdeFila = 0; ; desdeFila += LOTE) {
    const { data, error } = await db
      .from("pan_movimientos")
      .select(CAMPOS)
      .or("hacia.eq.consumo,desde.eq.consumo")
      .gte("created_at", `${desde}T00:00:00-03:00`)
      .lt("created_at", `${diaSiguiente(hasta)}T00:00:00-03:00`)
      .order("created_at")
      .range(desdeFila, desdeFila + LOTE - 1);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as MovConsumo[]));
    if (!data || data.length < LOTE) break;
  }
  return filas;
}

/** Las anulaciones (de cualquier fecha) de los movimientos del período. */
async function leerAnulados(db: SupabaseClient, ids: string[]): Promise<string[]> {
  const salida: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("pan_movimientos").select("anula_a").in("anula_a", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const f of data ?? []) if (f.anula_a) salida.push(f.anula_a as string);
  }
  return salida;
}

async function nombresDeOts(ots: number[]): Promise<{ nombres: Record<number, string>; error: string | null }> {
  if (ots.length === 0) return { nombres: {}, error: null };
  try {
    const filas = await read<{ id: number; x_name: string | false; x_obra_id: OdooM2O }>(
      "x_aba_orden_trabajo", ots, ["x_name", "x_obra_id"],
    );
    const nombres: Record<number, string> = {};
    for (const f of filas) {
      const obra = Array.isArray(f.x_obra_id) ? f.x_obra_id[1] : typeof f.x_name === "string" ? f.x_name : "";
      nombres[f.id] = obra ? `OT ${f.id} · ${obra}` : `OT ${f.id}`;
    }
    return { nombres, error: null };
  } catch (e) {
    return { nombres: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const por = (q.get("por") ?? "obra") as PorConsumo;
  const desde = q.get("desde") ?? "";
  const hasta = q.get("hasta") ?? "";
  if (!["obra", "cuadrilla", "persona"].includes(por)) return NextResponse.json({ error: "Agrupación desconocida." }, { status: 400 });
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "El período no es válido." }, { status: 400 });
  }

  try {
    const db = await createClient();
    const movs = await leerMovimientos(db, desde, hasta);
    const [anulados, art, per, ext, cua] = await Promise.all([
      leerAnulados(db, movs.filter((m) => m.tipo !== "anulacion").map((m) => m.id)),
      db.from("pan_articulos").select("id, nombre, unidad, ultimo_costo"),
      db.from("personal").select("id, nombre, apellido"),
      db.from("pan_personas_externas").select("id, nombre, apellido, empresa"),
      db.from("cuadrillas").select("id, nombre, responsable_id"),
    ]);
    for (const r of [art, per, ext, cua]) if (r.error) throw new Error(r.error.message);

    const articulos = (art.data ?? []).map((a) => ({ ...a, ultimo_costo: a.ultimo_costo === null ? null : Number(a.ultimo_costo) }));
    const resumen = consumo(movs, articulos, por, anulados);

    // Nombres de todo lo que aparece: grupos, "quién más retiró" y obras.
    const nombrePersona = new Map<string, string>();
    for (const p of per.data ?? []) nombrePersona.set(`p:${p.id}`, `${p.nombre} ${p.apellido}`.trim());
    for (const x of ext.data ?? []) nombrePersona.set(`x:${x.id}`, `${x.nombre} ${x.apellido}`.trim() + (x.empresa ? ` (${x.empresa})` : ""));
    const nombres: Record<string, string> = { sin_obra: "Sin obra · Taller/Depósito", sin_cuadrilla: "Sin cuadrilla (retiros personales)", sin_persona: "Sin persona" };
    for (const c of cua.data ?? []) {
      const capataz = c.responsable_id ? nombrePersona.get(`p:${c.responsable_id}`) : null;
      nombres[`c:${c.id}`] = capataz ? `${c.nombre} · ${capataz}` : c.nombre;
    }
    for (const [k, v] of nombrePersona) nombres[k] = v;

    const ots = [...new Set(resumen.grupos.flatMap((g) => [...g.obras, ...(g.clave.startsWith("o:") ? [Number(g.clave.slice(2))] : [])]))];
    const odoo = await nombresDeOts(ots);
    for (const ot of ots) nombres[`o:${ot}`] = odoo.nombres[ot] ?? `OT ${ot}`;

    return NextResponse.json({ por, desde, hasta, ...resumen, nombres, odooError: odoo.error });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
