// El "servidor" de las pruebas de la Hoja del día: contesta /api/hoja-dia* desde el navegador
// con `page.route`, sin Supabase ni Odoo ni sesión. El día sale del escenario de los tests
// (src/lib/hoja-dia/escenario.test-fixture.ts, el martes 13 de la maqueta) y cada gesto se
// aplica con optimista.ts (las mismas reglas que acciones.ts, sin escribir nada): así el GET
// que viene después del gesto trae lo mismo que el servidor de verdad.
//
// `retardoMs` demora cada POST (1,5 s por defecto): lo que se mide es que la ficha se vea
// ANTES de que conteste.

import type { BrowserContext, Page, Route } from "playwright";
import type { DiaHoja } from "../../src/lib/hoja-dia/tipos.ts";
import { aplicarPlan, martesPrecargado, martesVacio } from "../../src/lib/hoja-dia/escenario.test-fixture.ts";
import { aplicarOptimista, aplicarOptimistaAusencia, aplicarOptimistaPedido, aplicarOptimistaViaje } from "../../src/lib/hoja-dia/optimista.ts";
import { planPrecarga } from "../../src/lib/hoja-dia/estado.ts";

export const MARTES = "2026-10-13";

export type Opciones = { retardoMs?: number; escenario?: () => DiaHoja };

/** Un día sin obras (cualquier otra fecha que se pida). */
function diaSinObras(fecha: string): DiaHoja {
  return { ...martesVacio(), fecha, obras: [], anterior: null, ausencias: [] };
}

export type Servidor = { dias: Map<string, DiaHoja>; posts: { url: string; body: unknown }[] };

export async function servirHojaDia(destino: Page | BrowserContext, o: Opciones = {}): Promise<Servidor> {
  const retardo = o.retardoMs ?? 1500;
  const dias = new Map<string, DiaHoja>([[MARTES, (o.escenario ?? martesPrecargado)()]]);
  const historial = new Map<string, { fecha: string; dia: DiaHoja }>();
  const posts: Servidor["posts"] = [];
  let n = 0;
  const responder = (route: Route, cuerpo: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(cuerpo) });

  await destino.route(/\/api\/hoja-dia(\/|\?|$)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const camino = url.pathname;
    if (req.method() === "GET") {
      if (camino === "/api/hoja-dia") {
        const f = url.searchParams.get("fecha") ?? MARTES;
        if (!dias.has(f)) dias.set(f, diaSinObras(f));
        return responder(route, dias.get(f));
      }
      if (camino === "/api/hoja-dia/envios") return responder(route, { filas: [] });
      if (camino === "/api/hoja-dia/ausencias") return responder(route, { ausencias: [] });
      // "Otra dirección" (F4): cualquier dirección cae a 3 cuadras de Juramento.
      if (camino === "/api/hoja-dia/geocodificar") return responder(route, { ok: true, lat: -34.5642, lng: -58.4593, consulta: url.searchParams.get("dir") });
      return responder(route, {});
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    posts.push({ url: camino, body });
    await new Promise((r) => setTimeout(r, retardo));
    const f = (typeof body.fecha === "string" ? body.fecha : typeof body.fechaVista === "string" ? body.fechaVista : MARTES) as string;
    const dia = dias.get(f) ?? dias.get(MARTES)!;
    const id = `h-${++n}`;
    let nuevo: DiaHoja | null = null;
    if (camino === "/api/hoja-dia") nuevo = aplicarOptimista(dia, body as never);
    else if (camino === "/api/hoja-dia/viajes") nuevo = body.accion === "crear" ? crearViaje(dia, body, id) : aplicarOptimistaViaje(dia, body as never);
    else if (camino === "/api/hoja-dia/ausencias") nuevo = aplicarOptimistaAusencia(dia, body as never);
    else if (camino === "/api/hoja-dia/pedidos") nuevo = aplicarOptimistaPedido(dia, body as never);
    else if (camino === "/api/hoja-dia/precarga") nuevo = aplicarPlan(dia, planPrecarga(dia, body.modo as "hoy").hojas);
    else if (camino === "/api/hoja-dia/deshacer") {
      const h = historial.get(String(body.historialId));
      if (!h) return responder(route, { error: "Ya no se puede deshacer" }, 400);
      dias.set(h.fecha, h.dia);
      return responder(route, { ok: true, texto: "Deshecho" });
    } else if (camino === "/api/hoja-dia/envios") return responder(route, { ok: true, enviados: [], aMano: [], errores: [], texto: "" });
    else return responder(route, { ok: true, texto: "Hecho", historialId: null });
    if (nuevo) {
      historial.set(id, { fecha: dia.fecha, dia });
      dias.set(dia.fecha, nuevo);
    }
    return responder(route, { ok: true, texto: `Listo: ${String(body.accion ?? "precarga")}`, historialId: nuevo ? id : null, avisos: [] });
  });
  return { dias, posts };
}

/** "+ Parada" del recorrido (crear): el viaje nuevo, como lo dejaría acciones.ts (sin chofer, planeado). */
function crearViaje(dia: DiaHoja, b: Record<string, unknown>, id: string): DiaHoja {
  const v: DiaHoja["viajes"][number] = {
    id: `v-${id}`, fecha: dia.fecha, vehiculoId: (b.vehiculoId as string) ?? null, choferId: null, fleteExterno: null, tipo: b.tipo as DiaHoja["viajes"][number]["tipo"],
    hojaId: null, hojaVehiculoId: null, cuadrillaOdooId: null, hacia: b.hacia as DiaHoja["viajes"][number]["hacia"], desde: null, orden: Number(b.orden ?? 999),
    hora: (b.hora as string) ?? null, noAntesDe: null, duracionMin: null, vuelta: b.tipo === "trae_material", vueltaCarga: null, vueltaLlega: null, carga: (b.carga as string) ?? null,
    cargaDeposito: null, okTodoElDia: false, estado: "planeado", hechoMin: null, hechoPor: null, noPudoMotivo: null, anuladoMotivo: null, foto: false, creadoMin: 0, version: 1,
    accion: (b.queHace as DiaHoja["viajes"][number]["accion"]) ?? null, horaAprox: !!b.horaAprox,
  };
  return { ...dia, viajes: [...dia.viajes, v] };
}
