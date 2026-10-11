import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatas,
  ciudadUtil,
  consultasDe,
  elegirAlVuelo,
  elegirVentas,
  esCaba,
  geocodificarFilas,
  limpiarDireccion,
  masUrgente,
  necesitaGeo,
  partesEsquina,
  resolverDireccion,
  validarPunto,
  type FilaVenta,
  type Odoo,
  type Punto,
} from "./geocodificar-reglas.ts";

const fila = (id: number, extra: Partial<FilaVenta> = {}): FilaVenta => ({
  id, name: `S0${id}`, x_direccion_obra: `Calle ${id} 100`, x_obra_ciudad: "CABA",
  x_obra_lat: false, x_obra_lng: false, x_obra_geo_dir: false, ...extra,
});

const HUERGO: Punto = { lat: -34.6195, lng: -58.3672 };

test("la ciudad: basura y códigos postales no acotan; CABA, Buenos Aires y vacía son CABA", () => {
  assert.equal(ciudadUtil("AAN"), null);
  assert.equal(ciudadUtil("C1406GXZ"), null);
  assert.equal(ciudadUtil("--"), null);
  assert.equal(ciudadUtil(false), null);
  assert.equal(ciudadUtil("C.A.B.A."), "C.A.B.A.");
  for (const c of ["CABA", "Caba", "C.A.B.A.", "Buenos Aires", "Cdad. Autónoma de Buenos Aires", "Capital Federal", "", false, "BXB"] as (string | false)[]) assert.equal(esCaba(c), true, String(c));
  for (const c of ["Avellaneda", "La Plata", "San Carlos de Bariloche"]) assert.equal(esCaba(c), false, c);
});

test("limpiar la dirección: saca el 02, piso, dto, PB; deja la altura", () => {
  assert.equal(limpiarDireccion("Ing. Huergo 913 esq. Estados Unidos 02"), "Ing. Huergo 913 esq. Estados Unidos");
  assert.equal(limpiarDireccion("Corrientes 1234 Piso 3 Dto B"), "Corrientes 1234");
  assert.equal(limpiarDireccion("Corrientes 1234, PB"), "Corrientes 1234");
  assert.equal(limpiarDireccion("Corrientes 1234 3°B"), "Corrientes 1234");
  assert.equal(limpiarDireccion("Av. Rivadavia 6150"), "Av. Rivadavia 6150");
  assert.equal(limpiarDireccion("Alsina 2028"), "Alsina 2028");
});

test("limpiar: notas entre paréntesis, '- Lado …' y 'RETIRA' adelante", () => {
  assert.equal(limpiarDireccion("Av. Gral. Las Heras 2670 (Capilla Nuestra Señora del Huerto, Hospital Rivadavia)"), "Av. Gral. Las Heras 2670");
  assert.equal(limpiarDireccion("Aristóbulo del Valle 1496 - Lado Jovellanos"), "Aristóbulo del Valle 1496");
  assert.equal(limpiarDireccion("RETIRA CUCHA CUCHA 2345 - DEPOSITO ANDAMIOS BUENOS AIRES"), "CUCHA CUCHA 2345");
});

test("sin ciudad, si la dirección ya dice dónde no se le pega CABA", () => {
  assert.deepEqual(consultasDe("Moreno 1228 CABA", false), ["Moreno 1228 CABA, Argentina"]);
  assert.deepEqual(consultasDe("Corrientes 1448, Olivos, Prov. de Bs.As", false), ["Corrientes 1448, Olivos, Prov. de Bs.As, Argentina"]);
  assert.deepEqual(consultasDe("Aristóbulo del Valle 1496 - Lado Jovellanos", false), [
    "Aristóbulo del Valle 1496 - Lado Jovellanos, Ciudad Autónoma de Buenos Aires, Argentina",
    "Aristóbulo del Valle 1496, Ciudad Autónoma de Buenos Aires, Argentina",
    "Aristóbulo del Valle 1496, Buenos Aires, Argentina",
    "Aristóbulo del Valle 1496 - Lado Jovellanos, Argentina",
  ]);
});

test("esquinas", () => {
  assert.deepEqual(partesEsquina("Ing. Huergo 913 esq. Estados Unidos"), { calle: "Ing. Huergo 913", cruce: "Estados Unidos" });
  assert.deepEqual(partesEsquina("Paraná esquina Corrientes"), { calle: "Paraná", cruce: "Corrientes" });
  assert.equal(partesEsquina("Av. Rivadavia 6150"), null);
});

test("las consultas de S02385: la de siempre primero, después las variantes", () => {
  assert.deepEqual(consultasDe("Ing. Huergo 913 esq. Estados Unidos 02", "CABA"), [
    "Ing. Huergo 913 esq. Estados Unidos 02, CABA, Argentina",
    "Ing. Huergo 913 esq. Estados Unidos, CABA, Argentina",
    "Ing. Huergo 913, CABA, Argentina",
    "Ing. Huergo y Estados Unidos, CABA, Argentina",
  ]);
});

test("sin ciudad se asume CABA (y se prueba también 'Buenos Aires'); una simple no repite", () => {
  assert.deepEqual(consultasDe("Alsina 2028", false), [
    "Alsina 2028, Ciudad Autónoma de Buenos Aires, Argentina",
    "Alsina 2028, Buenos Aires, Argentina",
    "Alsina 2028, Argentina",
  ]);
  assert.deepEqual(consultasDe("Avenida Belgrano 2366", "AAN"), [
    "Avenida Belgrano 2366, Ciudad Autónoma de Buenos Aires, Argentina",
    "Avenida Belgrano 2366, Buenos Aires, Argentina",
    "Avenida Belgrano 2366, AAN, Argentina",
  ]);
  assert.deepEqual(consultasDe("Alsina 2028", "Avellaneda"), ["Alsina 2028, Avellaneda, Argentina"]);
});

test("el punto: fuera de Argentina; CABA lejos del AMBA; otra ciudad lejos vale", () => {
  assert.equal(validarPunto(HUERGO, "CABA"), "ok");
  assert.equal(validarPunto({ lat: 19.43, lng: -99.13 }, "CABA"), "fuera_de_argentina");
  assert.equal(validarPunto({ lat: -38.0, lng: -57.55 }, "CABA"), "fuera_del_amba"); // Mar del Plata
  assert.equal(validarPunto({ lat: -38.0, lng: -57.55 }, false), "fuera_del_amba");
  assert.equal(validarPunto({ lat: -34.92, lng: -57.95 }, "CABA"), "ok"); // La Plata, 55 km
  assert.equal(validarPunto({ lat: -41.13, lng: -71.3 }, "San Carlos de Bariloche"), "ok");
});

test("resolver: sigue con las variantes si no hay resultado o el punto no sirve", async () => {
  const pedidas: string[] = [];
  const buscar = async (t: string) => {
    pedidas.push(t);
    if (t.endsWith("Estados Unidos 02, CABA, Argentina")) return null;
    if (t.startsWith("Ing. Huergo 913 esq. Estados Unidos,")) return { lat: -38, lng: -57.55 };
    return HUERGO;
  };
  const r = await resolverDireccion("Ing. Huergo 913 esq. Estados Unidos 02", "CABA", buscar);
  assert.equal(r.estado, "ok");
  assert.equal(r.consultas, 3);
  assert.deepEqual(r.estado === "ok" && r.punto, HUERGO);
  assert.equal(r.estado === "ok" && r.consulta, "Ing. Huergo 913, CABA, Argentina");

  const nada = await resolverDireccion("Alsina 2028", "Avellaneda", async () => null);
  assert.equal(nada.estado, "sin_resultado");
  const lejos = await resolverDireccion("Alsina 2028", "CABA", async () => ({ lat: 40, lng: -3 }));
  assert.equal(lejos.estado, "fuera_de_argentina");
  const cortada = await resolverDireccion("Ing. Huergo 913 esq. Estados Unidos 02", "CABA", async () => null, 2);
  assert.equal(cortada.consultas, 2);
});

test("necesitaGeo: idempotente por x_obra_geo_dir", () => {
  assert.equal(necesitaGeo(fila(1)), true);
  assert.equal(necesitaGeo(fila(1, { x_obra_lat: -34.6, x_obra_lng: -58.4, x_obra_geo_dir: "Calle 1 100" })), false);
  assert.equal(necesitaGeo(fila(1, { x_obra_lat: -34.6, x_obra_lng: -58.4, x_obra_geo_dir: "otra" })), true);
  assert.equal(necesitaGeo(fila(1, { x_obra_lat: 0, x_obra_lng: 0, x_obra_geo_dir: "Calle 1 100" })), true);
  assert.equal(necesitaGeo(fila(1, { x_direccion_obra: false })), false);
});

test("elegir: primero el tablero (la próxima jornada), después lo pasado, después Armado; sin repetir", () => {
  const hoy = "2026-10-11";
  const fechaDe = new Map([[1, "2026-10-20"], [2, "2026-10-11"], [3, "2026-10-05"], [4, "2026-10-12"], [7, "2026-10-08"]]);
  const plan = [fila(1), fila(2), fila(3), fila(4, { x_obra_lat: -34, x_obra_lng: -58, x_obra_geo_dir: "Calle 4 100" }), fila(7)];
  const armado = [fila(5), fila(2), fila(6, { x_obra_lat: -34, x_obra_lng: -58, x_obra_geo_dir: "Calle 6 100" })];
  assert.deepEqual(elegirVentas(armado, plan, fechaDe, hoy).map((f) => f.id), [2, 1, 7, 3, 5]);
});

test("masUrgente: la próxima de hoy en adelante; si no, la pasada más reciente", () => {
  const hoy = "2026-10-11";
  assert.equal(masUrgente(undefined, "2026-10-05", hoy), "2026-10-05");
  assert.equal(masUrgente("2026-10-05", "2026-10-20", hoy), "2026-10-20");
  assert.equal(masUrgente("2026-10-20", "2026-10-12", hoy), "2026-10-12");
  assert.equal(masUrgente("2026-10-12", "2026-10-05", hoy), "2026-10-12");
  assert.equal(masUrgente("2026-10-05", "2026-10-08", hoy), "2026-10-08");
});

test("al vuelo: sólo sin coordenadas, a lo sumo N, y no otra vez antes de 30 min", () => {
  const intentos = new Map<number, number>();
  const obras = [
    { ventaId: 1, lat: null, lng: null }, { ventaId: 1, lat: null, lng: null }, { ventaId: 2, lat: -34, lng: -58 },
    { ventaId: null, lat: null, lng: null }, { ventaId: 3, lat: null, lng: null }, { ventaId: 4, lat: null, lng: null },
  ];
  assert.deepEqual(elegirAlVuelo(obras, intentos, 0, 2), [1, 3]);
  assert.deepEqual(elegirAlVuelo(obras, intentos, 60_000, 2), [4]);
  assert.deepEqual(elegirAlVuelo(obras, intentos, 10 * 60_000, 5), []);
  assert.deepEqual(elegirAlVuelo(obras, intentos, 30 * 60_000, 5), [1, 3]);
  assert.deepEqual(elegirAlVuelo(obras, intentos, 31 * 60_000, 5), [4]);
});

test("geocodificarFilas: escribe la dirección (no la variante), respeta el tope y devuelve los fallos", async () => {
  const escritos: { ids: number[]; v: Record<string, unknown> }[] = [];
  const odoo = { write: async (_m: string, ids: number[], v: Record<string, unknown>) => { escritos.push({ ids, v }); } };
  const filas = [
    fila(2385, { x_direccion_obra: "Ing. Huergo 913 esq. Estados Unidos 02" }),
    fila(7, { x_direccion_obra: "Nada 1", x_obra_ciudad: "Avellaneda" }),
    fila(8, { x_direccion_obra: "Lejos 1", x_obra_ciudad: "Avellaneda" }),
    fila(9, { x_obra_lat: -34, x_obra_lng: -58, x_obra_geo_dir: "Calle 9 100" }),
  ];
  const buscar = async (t: string) => (t.startsWith("Ing. Huergo 913,") ? HUERGO : t.startsWith("Lejos") ? { lat: 40, lng: -3 } : null);
  const r = await geocodificarFilas(filas, buscar, odoo);
  assert.equal(r.candidatas, 3);
  assert.equal(r.geocodificadas, 1);
  assert.deepEqual(escritos, [{ ids: [2385], v: { x_obra_lat: HUERGO.lat, x_obra_lng: HUERGO.lng, x_obra_geo_dir: "Ing. Huergo 913 esq. Estados Unidos 02" } }]);
  assert.deepEqual(r.sinResultado.map((x) => x.venta), ["S07"]);
  assert.deepEqual(r.fueraDeArgentina.map((x) => [x.venta, x.motivo]), [["S08", "fuera_de_argentina"]]);
  assert.equal(r.truncado, false);

  const corta = await geocodificarFilas(filas, async () => null, odoo, 2);
  assert.equal(corta.truncado, true);
  assert.equal(corta.consultas, 2);
});

test("candidatas: Armado + las ventas de las OTs del tablero (asignación → OT → venta)", async () => {
  const llamadas: unknown[][] = [];
  const odoo: Odoo = {
    searchRead: async <T,>(model: string, domain: unknown[]) => {
      llamadas.push([model, domain]);
      if (model === "sale.order") return [fila(5)] as T[];
      return [
        { x_ot_id: [1290, "OT"], x_fecha: "2026-10-11" },
        { x_ot_id: [1290, "OT"], x_fecha: "2026-10-12" },
        { x_ot_id: [1300, "OT"], x_fecha: "2026-10-30" },
      ] as T[];
    },
    read: async <T,>(model: string, ids: number[]) => {
      if (model === "x_aba_orden_trabajo") return ids.map((id) => ({ id, x_order_id: id === 1290 ? [2385, "S02385"] : [5, "S05"] })) as T[];
      return ids.map((id) => fila(id)) as T[];
    },
    write: async () => {},
  };
  const c = await candidatas(odoo, "2026-10-11");
  assert.deepEqual(c.lista.map((f) => f.id), [2385, 5]);
  assert.equal(c.fechaDe.get(2385), "2026-10-11");
  const asig = llamadas.find((l) => l[0] === "x_aba_asignacion")!;
  assert.deepEqual(asig[1], [["x_fecha", ">=", "2026-10-04"], ["x_fecha", "<=", "2026-11-25"], ["x_ot_id", "!=", false]]);
});
