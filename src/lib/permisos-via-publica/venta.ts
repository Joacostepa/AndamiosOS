import { read } from "@/lib/odoo/client";
import { urlOdooVenta } from "@/lib/odoo/habilitaciones";
import type { VentaOdoo } from "./tipos";

// La venta de Odoo de un permiso, EN VIVO: para confirmar un vínculo hay que ver la dirección y el
// cliente de la venta al lado de los de la carátula, y después de confirmado, lo que la venta dice
// hoy. Si Odoo no responde, la ficha igual se muestra (ventaError).

type FilaVenta = {
  id: number;
  name: string;
  x_direccion_obra: string | false;
  partner_id: [number, string] | false;
  date_order: string | false;
  x_permiso_modalidad: string | false;
  x_tramite_estado: string | false;
  x_expediente_nro: string | false;
  x_permiso_fecha: string | false;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function ventaDeOdoo(ventaId: number): Promise<{ venta: VentaOdoo | null; ventaError: string | null }> {
  try {
    const [v] = await read<FilaVenta>("sale.order", [ventaId], [
      "name", "x_direccion_obra", "partner_id", "date_order", "x_permiso_modalidad",
      "x_tramite_estado", "x_expediente_nro", "x_permiso_fecha",
    ]);
    if (!v) return { venta: null, ventaError: "La venta ya no existe en Odoo" };
    return {
      venta: {
        id: v.id,
        nombre: v.name,
        direccion: str(v.x_direccion_obra),
        cliente: v.partner_id ? v.partner_id[1] : null,
        fecha: str(v.date_order)?.slice(0, 10) ?? null,
        modalidad: str(v.x_permiso_modalidad),
        tramite: str(v.x_tramite_estado),
        expedienteNro: str(v.x_expediente_nro),
        permisoFecha: str(v.x_permiso_fecha),
        url: urlOdooVenta(v.id),
      },
      ventaError: null,
    };
  } catch (e) {
    return { venta: null, ventaError: e instanceof Error ? e.message : String(e) };
  }
}
