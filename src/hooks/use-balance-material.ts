"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Balance de material por obra: el cómputo madre (planeado) contra lo que realmente
// se movió (entregado / sobrante / devuelto), derivado de los documentos fuente
// (no de stock_por_obra), para máxima fiabilidad. en_obra = entregado − sobrante −
// devuelto (lo que quedó sin volver = faltante si la obra ya se desarmó).
export type BalancePieza = {
  pieza_id: string;
  codigo: string;
  descripcion: string;
  planeado: number;
  entregado: number;
  sobrante: number;
  devuelto: number;
  en_obra: number;
  desvio_computo: number; // entregado − planeado (cuánto se desvió del cómputo)
};

type Cat = { codigo: string; descripcion: string } | null;

export function useBalanceMaterialObra(obraId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["balance-material", obraId],
    enabled: !!obraId,
    queryFn: async (): Promise<BalancePieza[]> => {
      // 1) Cómputo madre: el último cómputo de la obra (vía proyecto técnico).
      const { data: computos, error: ce } = await supabase
        .from("computos")
        .select("created_at, computo_items(pieza_id, cantidad_requerida, catalogo_piezas(codigo, descripcion)), proyectos_tecnicos!inner(obra_id)")
        .eq("proyectos_tecnicos.obra_id", obraId)
        .order("created_at", { ascending: false });
      if (ce) throw ce;
      const computoItems = (computos?.[0]?.computo_items ?? []) as unknown as Array<{
        pieza_id: string; cantidad_requerida: number | null; catalogo_piezas: Cat;
      }>;

      // 2) Remitos recibidos de la obra (entrega / sobrante / devolución).
      const { data: remitos, error: re } = await supabase
        .from("remitos")
        .select("tipo, remito_items(pieza_id, cantidad_remitida, cantidad_recibida, catalogo_piezas(codigo, descripcion))")
        .eq("obra_id", obraId)
        .in("estado", ["recibido", "con_diferencia", "cerrado"]);
      if (re) throw re;

      const map = new Map<string, BalancePieza>();
      const ensure = (pid: string, cat: Cat) => {
        let b = map.get(pid);
        if (!b) {
          b = { pieza_id: pid, codigo: cat?.codigo ?? "—", descripcion: cat?.descripcion ?? "", planeado: 0, entregado: 0, sobrante: 0, devuelto: 0, en_obra: 0, desvio_computo: 0 };
          map.set(pid, b);
        } else if (cat && b.codigo === "—") {
          b.codigo = cat.codigo; b.descripcion = cat.descripcion;
        }
        return b;
      };

      for (const ci of computoItems) {
        ensure(ci.pieza_id, ci.catalogo_piezas).planeado += ci.cantidad_requerida ?? 0;
      }
      for (const r of (remitos ?? []) as unknown as Array<{ tipo: string; remito_items: Array<{ pieza_id: string; cantidad_remitida: number; cantidad_recibida: number | null; catalogo_piezas: Cat }> }>) {
        for (const it of r.remito_items ?? []) {
          const q = it.cantidad_recibida ?? it.cantidad_remitida ?? 0;
          const b = ensure(it.pieza_id, it.catalogo_piezas);
          if (r.tipo === "entrega") b.entregado += q;
          else if (r.tipo === "sobrante") b.sobrante += q;
          else if (r.tipo === "devolucion") b.devuelto += q;
        }
      }

      const rows = [...map.values()];
      for (const b of rows) {
        b.en_obra = b.entregado - b.sobrante - b.devuelto;
        b.desvio_computo = b.entregado - b.planeado;
      }
      rows.sort((a, b) => a.codigo.localeCompare(b.codigo));
      return rows;
    },
  });
}
