// Ciudad Armada: categorías, Para decidir, contadores y línea de tiempo (12/10/2026).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObraMapa } from "./tipos.ts";
import {
  categoriaDe, conteoCategorias, curvaDe, decisiones, desarmadasPorMes, itemsTv, kpis,
  lineaCalle, lineaHistorico, ordenarCalle, presenteEn, resumenFotos, semanas, semanaParaVer,
  subtituloDe, coincide, tieneUbicacion,
} from "./categorias.ts";

const HOY = "2026-10-12";
let sec = 1;

function obra(p: Partial<ObraMapa> = {}): ObraMapa {
  const id = sec++;
  return {
    ventaId: id,
    venta: `S0${id}`,
    cliente: null,
    direccion: "Av. Olazábal 2939, CABA",
    direccionCorta: "Av. Olazábal 2939",
    referencia: null,
    estado: "armada",
    lat: -34.56,
    lng: -58.47,
    ubicacion: "ok",
    fachada: null,
    fechaArmado: "2026-09-12",
    fechaDeImportacion: false,
    fechaDesarme: null,
    desarmeProgramado: null,
    finEstimado: null,
    vencida: false,
    diasArmado: 30,
    tipo: "pantalla_proteccion",
    medidas: { largo: 9, ancho: 1.25, alto: 2.5, estimadas: false },
    queEstaArmado: "Pantalla 9m x 1,25m x 2,50m H",
    queEstaArmadoFuente: "obra",
    queEstaArmadoFecha: "2026-09-12",
    fotos: [],
    url: "https://odoo/venta",
    ...p,
  };
}

test("categoría de la calle: por días, con importación, sin fecha y pendiente", () => {
  assert.equal(categoriaDe(obra({ diasArmado: 30 }), "calle"), "reciente");
  assert.equal(categoriaDe(obra({ diasArmado: 31 }), "calle"), "media");
  assert.equal(categoriaDe(obra({ diasArmado: 90 }), "calle"), "media");
  assert.equal(categoriaDe(obra({ diasArmado: 91 }), "calle"), "larga");
  assert.equal(categoriaDe(obra({ fechaDeImportacion: true, diasArmado: 202 }), "calle"), "importacion");
  assert.equal(categoriaDe(obra({ fechaArmado: null, diasArmado: null }), "calle"), "sinFecha");
  assert.equal(categoriaDe(obra({ estado: "pendiente_desarme", diasArmado: 200 }), "calle"), "pendiente");
});

test("categoría del histórico: sigue o ya se desarmó", () => {
  assert.equal(categoriaDe(obra(), "historico", "2026-05-01"), "sigue");
  assert.equal(categoriaDe(obra({ estado: "desarmada" }), "historico", "2026-05-01"), "desarmada");
});

test("presenteEn: armada antes y desarmada después de la fecha", () => {
  const d = obra({ estado: "desarmada", fechaArmado: "2026-04-01", fechaDesarme: "2026-06-01" });
  assert.equal(presenteEn(d, "2026-03-31"), false);
  assert.equal(presenteEn(d, "2026-04-01"), true);
  assert.equal(presenteEn(d, "2026-05-31"), true);
  assert.equal(presenteEn(d, "2026-06-01"), false);
  assert.equal(presenteEn(obra({ estado: "desarmada", fechaDesarme: null }), HOY), false);
  assert.equal(presenteEn(obra({ fechaArmado: null }), HOY), false);
  assert.equal(presenteEn(obra(), HOY), true);
});

test("subtítulo de la etiqueta", () => {
  assert.equal(subtituloDe(obra({ diasArmado: 28 })), "28 días armada · pantalla");
  assert.equal(
    subtituloDe(obra({ diasArmado: 202, fechaDeImportacion: true, tipo: "torre" })),
    "202 días armada (desde la importación)",
  );
  assert.equal(subtituloDe(obra({ estado: "pendiente_desarme", ubicacion: "sin_altura" })), "pendiente de desarme · pantalla · sin altura");
  assert.equal(subtituloDe(obra({ estado: "desarmada", fechaDesarme: "2026-08-03", tipo: null })), "desarmada 03/08/2026");
  assert.equal(subtituloDe(obra({ diasArmado: null, tipo: null })), "sin fecha");
});

test("líneas de la lista", () => {
  assert.equal(lineaCalle(obra({ diasArmado: 12 })), "12 días · pantalla 9 m");
  assert.equal(lineaCalle(obra({ estado: "pendiente_desarme", tipo: "torre", medidas: { largo: 4.5, ancho: 1, alto: 8, estimadas: true } })), "pendiente de desarme · 4,5 m");
  assert.equal(
    lineaHistorico(obra({ estado: "desarmada", fechaArmado: "2026-04-01", fechaDesarme: "2026-06-01" })),
    "01/04 → 01/06 · 61 días",
  );
  assert.equal(lineaHistorico(obra({ estado: "desarmada", fechaArmado: null, fechaDesarme: "2026-06-01" })), "desarmada 01/06/2026");
});

test("ubicación: lejos y sin ubicación no se dibujan; sin altura sí", () => {
  assert.equal(tieneUbicacion(obra()), true);
  assert.equal(tieneUbicacion(obra({ ubicacion: "sin_altura" })), true);
  assert.equal(tieneUbicacion(obra({ ubicacion: "lejos" })), false);
  assert.equal(tieneUbicacion(obra({ ubicacion: "sin_ubicacion", lat: null, lng: null })), false);
});

test("buscador sin tildes ni mayúsculas, también por la calle del mapa", () => {
  const o = obra({
    fachada: { lng: 0, lat: 0, normal: [0, 1], calle: "Avenida Corrientes", coincideCalle: false },
  });
  assert.equal(coincide(o, "olazabal"), true);
  assert.equal(coincide(o, "CORRIENTES"), true);
  assert.equal(coincide(o, "guido"), false);
  assert.equal(coincide(o, "  "), true);
});

test("Para decidir: reparte por tipo, máximo 6, más urgente primero", () => {
  const obras = [
    obra({ estado: "pendiente_desarme" }),
    obra({ estado: "pendiente_desarme", desarmeProgramado: "2026-10-20" }),
    obra({ ubicacion: "sin_altura" }),
    obra({ ubicacion: "lejos" }),
    ...[10, 50, 5, 30].map((d) => obra({ vencida: true, finEstimado: `2026-10-${String(12 - Math.min(d, 11)).padStart(2, "0")}` })),
    obra({ queEstaArmado: null }),
    obra({ queEstaArmado: null }),
    obra({ estado: "desarmada", queEstaArmado: null }),
  ];
  const d = decisiones(obras, HOY);
  assert.equal(d.length, 6);
  // Primera ronda: uno de cada tipo, en orden de urgencia.
  assert.deepEqual(d.slice(0, 4).map((x) => x.tipo), ["desarme", "direccion", "fin", "armado"]);
  assert.equal(d[0].accion, "Programar desarme");
  assert.equal(d[1].accion, "Corregir dirección");
  // Segunda ronda.
  assert.deepEqual(d.slice(4).map((x) => x.tipo), ["desarme", "direccion"]);
  assert.equal(d[4].accion, "Ver en el tablero");
  assert.equal(d[5].accion, "Completar dirección");
  assert.ok(d.every((x) => x.obra.estado !== "desarmada"));
});

test("Para decidir: el fin vencido dice hace cuántos días", () => {
  const [d] = decisiones([obra({ vencida: true, finEstimado: "2026-10-02" })], HOY);
  assert.equal(d.motivo, "Pasó el fin estimado hace 10 días");
  assert.equal(d.accion, "Confirmar con el cliente");
});

test("todas en la calle: pendientes primero y después por días", () => {
  const a = obra({ diasArmado: 10 });
  const b = obra({ diasArmado: 200 });
  const p = obra({ estado: "pendiente_desarme", diasArmado: 5 });
  const x = obra({ estado: "desarmada" });
  assert.deepEqual(ordenarCalle([a, b, p, x]).map((o) => o.ventaId), [p.ventaId, b.ventaId, a.ventaId]);
});

test("desarmadas por mes de desarme", () => {
  const g = desarmadasPorMes([
    obra({ estado: "desarmada", fechaDesarme: "2026-08-03" }),
    obra({ estado: "desarmada", fechaDesarme: "2026-09-20" }),
    obra({ estado: "desarmada", fechaDesarme: "2026-09-01" }),
    obra({ estado: "desarmada", fechaDesarme: null }),
    obra(),
  ]);
  assert.deepEqual(g.map((x) => [x.mes, x.obras.length]), [
    ["septiembre 2026", 2], ["agosto 2026", 1], ["Sin fecha de desarme", 1],
  ]);
});

test("contadores de la calle y del histórico", () => {
  const obras = [
    obra({ vencida: true }),
    obra({ ubicacion: "sin_ubicacion", lat: null, lng: null }),
    obra({ estado: "pendiente_desarme", medidas: { largo: 3, ancho: 1, alto: 2, estimadas: true } }),
    obra({ estado: "desarmada", fechaArmado: "2026-04-01", fechaDesarme: "2026-06-01" }),
    obra({ estado: "desarmada", fechaArmado: "2026-03-24", fechaDeImportacion: true, fechaDesarme: "2026-05-01", lat: null, lng: null, ubicacion: "sin_ubicacion" }),
  ];
  assert.deepEqual(kpis(obras, "calle"), {
    vista: "calle", armadas: 2, pendientes: 1, metrosLineales: 21, vencidas: 1, sinUbicacion: 1,
  });
  assert.deepEqual(kpis(obras, "historico", "2026-04-15"), {
    vista: "historico", desarmadas: 2, conUbicacion: 1, diasPromedio: 61, enLaCalle: 2, enLaCalleEnMapa: 1,
  });
});

test("conteo de la leyenda", () => {
  const obras = [obra({ diasArmado: 5 }), obra({ diasArmado: 5 }), obra({ estado: "pendiente_desarme" }), obra({ estado: "desarmada" })];
  const c = conteoCategorias(obras, "calle", null);
  assert.equal(c.get("reciente"), 2);
  assert.equal(c.get("pendiente"), 1);
  assert.equal(c.get("desarmada"), undefined);
});

test("semanas y curva local cuando el servidor no la manda", () => {
  const s = semanas("2026-03-24", "2026-04-10");
  assert.deepEqual(s, ["2026-03-24", "2026-03-31", "2026-04-07", "2026-04-10"]);
  const c = curvaDe([obra({ fechaArmado: "2026-04-01" })], [], "2026-04-10");
  assert.equal(c[0].enLaCalle, 0);
  assert.equal(c[c.length - 1].enLaCalle, 1);
  const delServidor = [{ fecha: "2026-03-24", enLaCalle: 3 }, { fecha: "2026-03-31", enLaCalle: 4 }];
  assert.equal(curvaDe([], delServidor, HOY), delServidor);
});

test("semana para ver una desarmada: la del medio de su armado", () => {
  const f = semanas("2026-03-24", HOY);
  const i = semanaParaVer(obra({ estado: "desarmada", fechaArmado: "2026-04-01", fechaDesarme: "2026-06-01" }), f);
  assert.ok(i != null && f[i] >= "2026-05-01" && f[i] < "2026-05-08");
});

test("modo TV: Para decidir con ubicación más las tres más viejas, sin repetir", () => {
  const vieja = obra({ diasArmado: 300 });
  const obras = [
    obra({ estado: "pendiente_desarme" }),
    obra({ estado: "pendiente_desarme", lat: null, lng: null, ubicacion: "sin_ubicacion" }),
    vieja,
    obra({ diasArmado: 200 }),
    obra({ diasArmado: 100, vencida: true, finEstimado: "2026-10-01" }),
    obra({ diasArmado: 250, fechaDeImportacion: true }),
  ];
  const items = itemsTv(obras, decisiones(obras, HOY));
  const ids = items.map((x) => x.obra.ventaId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(vieja.ventaId));
  assert.equal(items.find((x) => x.obra === vieja)?.motivo, "300 días armada");
  assert.ok(items.every((x) => tieneUbicacion(x.obra)));
});

test("resumen de fotos: partes por día y la última", () => {
  const f = (id: number, fecha: string | null) => ({ id, fecha, descripcion: null, url: `/f/${id}`, origen: "parte" as const });
  assert.deepEqual(resumenFotos([f(1, "2026-10-01"), f(2, "2026-10-01"), f(3, "2026-09-03"), f(4, null)]), {
    n: 4, partes: 2, ultima: "2026-10-01",
  });
  assert.deepEqual(resumenFotos([]), { n: 0, partes: 0, ultima: null });
});
