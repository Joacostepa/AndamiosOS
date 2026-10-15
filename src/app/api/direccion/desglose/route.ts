import { NextResponse, type NextRequest } from "next/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { NODOS } from "@/lib/direccion/desglose/index";
import { queryARef } from "@/lib/direccion/desglose/contrato";
import { cachePantalla } from "@/lib/direccion/cache";
import { contextoCalculo } from "@/lib/direccion/servidor";
import { hoyBA } from "@/lib/direccion/formato";
import { urlOdoo } from "@/lib/direccion/odoo-lectura";
import { MENSAJE_SIN_SOCIOS } from "@/lib/direccion/permisos";
import { ocultarCircuitos } from "@/lib/direccion/reservado";
import type { NodoDesglose, NodoRef } from "@/lib/direccion/tipos";
import { fallo } from "../_comun";

// GET /api/direccion/desglose?nodo=<tipo>&<param>=<valor>&pagina=N
//
// El drill-down (§7.3). Cada área registra sus nodos en src/lib/direccion/desglose/<área>.ts.
// Los nodos reservados (todo lo de Socios) sólo con direccion-socios: se chequea ACÁ, en el
// servidor, antes de calcular nada. Cacheado 10 min con el tag de la pantalla del nodo.

// Una función cacheada por tipo de nodo (la clave incluye hoy, los parámetros y la página).
const cacheadas = new Map<string, (hoy: string, refJson: string, pagina: number) => Promise<NodoDesglose>>();

function resolvedorCacheado(tipo: string) {
  let f = cacheadas.get(tipo);
  if (!f) {
    const def = NODOS[tipo];
    f = cachePantalla(def.pantalla, `nodo:${tipo}`, async (hoy: string, refJson: string, pagina: number) => {
      const ref = JSON.parse(refJson) as NodoRef;
      const params = Object.fromEntries(Object.entries(ref).filter(([k]) => k !== "tipo"));
      const ctx = await contextoCalculo(hoy, params);
      return def.resolver(ref, { ...ctx, pagina });
    });
    cacheadas.set(tipo, f);
  }
  return f;
}

export async function GET(req: NextRequest) {
  const s = await exigirDireccionApi();
  if (s instanceof NextResponse) return s;
  const pedido = queryARef(req.nextUrl.searchParams);
  if (!pedido) return NextResponse.json({ error: "Falta el nodo." }, { status: 400 });
  const def = NODOS[pedido.ref.tipo];
  if (!def) return NextResponse.json({ error: "Ese desglose no existe." }, { status: 404 });
  if (def.reservado && !s.conSocios) return NextResponse.json({ error: MENSAJE_SIN_SOCIOS }, { status: 403 });
  try {
    const refOrdenado = Object.fromEntries(Object.entries(pedido.ref).sort(([a], [b]) => a.localeCompare(b)));
    const nodo = await resolvedorCacheado(def.tipo)(hoyBA(), JSON.stringify(refOrdenado), pedido.pagina);
    // El link a Odoo lo arma el servidor (ODOO_URL no viaja al navegador como config).
    const conLinks: NodoDesglose = {
      ...nodo,
      secciones: nodo.secciones.map((sec) => ({
        ...sec,
        filas: sec.filas.map((f) => (f.odoo ? { ...f, odoo: { ...f.odoo, url: urlOdoo(f.odoo.modelo, f.odoo.id) } } : f)),
      })),
    };
    // Sin socios: sin el número de los comprobantes del circuito reservado (reservado.ts).
    return NextResponse.json(s.conSocios ? conLinks : ocultarCircuitos(conLinks));
  } catch (e) {
    return fallo(e);
  }
}

// Calcula en vivo contra Odoo: La semana y Ventas pueden pasar los 10–15 s del límite por defecto de Vercel.
export const maxDuration = 300;
