// El resumen del mes por contratista ("Contratistas · octubre"), del lado del servidor:
// lee las cantidades de las hojas (Supabase) y, para nombrar las cuadrillas y prorratear
// por obra, las asignaciones del tablero de esos días (Odoo, una pasada). La cuenta es
// `resumenMes` (contratistas.ts, pura y con tests).
//
// SOLO SERVER-SIDE (service role, después de que la ruta verificó Hoja del día en ver).

import { createAdminClient } from "@/lib/supabase/admin";
import { read, searchRead } from "@/lib/odoo/client";
import { parseFraccion } from "@/lib/odoo/asignaciones";
import { direccionCorta, direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import { mapContratista } from "./servicio";
import { rangoMes, resumenMes, type JornadaContratista, type ResumenContratista } from "./contratistas";

type M2O = [number, string] | false;
const idDe = (v: M2O) => (Array.isArray(v) ? v[0] : null);

export type ResumenMesContratistas = {
  mes: string;
  desde: string;
  hasta: string;
  resumen: ResumenContratista[];
  /** Odoo no contestó: sin nombres de cuadrilla ni prorrateo por obra (las jornadas valen igual). */
  sinTablero: boolean;
};

export async function resumenContratistasMes(mes: string): Promise<ResumenMesContratistas> {
  const { desde, hasta } = rangoMes(mes);
  const db = createAdminClient();
  const [kR, filasR] = await Promise.all([
    db.from("hd_contratistas").select("id, nombre, referente, celular, telegram_chat_id, valor_jornada, nota, activo").order("nombre"),
    db.from("hd_hoja_contratistas").select("fecha, contratista_id, cantidad, hd_hojas(cuadrilla_odoo_id)").gte("fecha", desde).lte("fecha", hasta),
  ]);
  if (kR.error) throw new Error(`No se pudo leer los contratistas: ${kR.error.message}`);
  if (filasR.error) throw new Error(`No se pudo leer las jornadas: ${filasR.error.message}`);
  const contratistas = (kR.data ?? []).map((f) => mapContratista(f as Record<string, unknown>));
  const filas = (filasR.data ?? []).map((f) => {
    const h = (f as { hd_hojas: { cuadrilla_odoo_id: number } | { cuadrilla_odoo_id: number }[] | null }).hd_hojas;
    const c = Array.isArray(h) ? h[0]?.cuadrilla_odoo_id : h?.cuadrilla_odoo_id;
    return { fecha: String(f.fecha), contratistaId: String(f.contratista_id), cantidad: Number(f.cantidad ?? 0), c: Number(c) };
  });

  // El tablero de esos días y esas cuadrillas (nombres y fracciones para el prorrateo).
  const cuadrillas = [...new Set(filas.map((f) => f.c))];
  const nombres = new Map<number, string>();
  const obras = new Map<string, { otId: number; nombre: string; fraccion: number }[]>();
  let sinTablero = false;
  if (filas.length) {
    try {
      const [cs, asigs] = await Promise.all([
        searchRead<{ id: number; x_name: string | false }>("x_aba_cuadrilla", [["id", "in", cuadrillas]], ["x_name"]),
        searchRead<{ x_ot_id: M2O; x_fecha: string | false; x_cuadrilla_id: M2O; x_fraccion: string | false; x_orden_dia: number | false }>(
          "x_aba_asignacion",
          [["x_fecha", ">=", desde], ["x_fecha", "<=", hasta], ["x_cuadrilla_id", "in", cuadrillas], ["x_ot_id", "!=", false]],
          ["x_ot_id", "x_fecha", "x_cuadrilla_id", "x_fraccion", "x_orden_dia"],
          { order: "x_fecha, x_orden_dia, id" },
        ),
      ]);
      for (const c of cs) nombres.set(c.id, nombrePropio(c.x_name || `Cuadrilla #${c.id}`));
      const otIds = [...new Set(asigs.map((a) => idDe(a.x_ot_id)).filter((x): x is number => x != null))];
      const ots = otIds.length ? await read<{ id: number; x_name: string | false; x_direccion_obra: string | false }>("x_aba_orden_trabajo", otIds, ["x_name", "x_direccion_obra"]) : [];
      const dir = new Map(ots.map((o) => [o.id, direccionCorta(direccionDeObra({ direccionObra: o.x_direccion_obra || null, titulo: o.x_name || null }))]));
      for (const a of asigs) {
        const ot = idDe(a.x_ot_id);
        const c = idDe(a.x_cuadrilla_id);
        if (ot == null || c == null || !a.x_fecha) continue;
        const k = `${a.x_fecha}:${c}`;
        const l = obras.get(k) ?? [];
        l.push({ otId: ot, nombre: dir.get(ot) ?? `OT ${ot}`, fraccion: parseFraccion(a.x_fraccion) });
        obras.set(k, l);
      }
    } catch (e) {
      console.error("[hoja-dia] resumen de contratistas sin el tablero", e instanceof Error ? e.message : e);
      sinTablero = true;
    }
  }
  const jornadas: JornadaContratista[] = filas.map((f) => ({
    fecha: f.fecha, cuadrillaOdooId: f.c, cuadrilla: nombres.get(f.c) ?? `Cuadrilla #${f.c}`, contratistaId: f.contratistaId, cantidad: f.cantidad,
    obras: obras.get(`${f.fecha}:${f.c}`) ?? [],
  }));
  return { mes, desde, hasta, resumen: resumenMes(contratistas, jornadas), sinTablero };
}
