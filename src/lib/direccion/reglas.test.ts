// Reglas puras de Dirección: caché, permisos, recorte de lo reservado, Supabase sin tablas,
// diccionario y secciones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveParams, ESPERA_ACTUALIZAR_MS, puedeActualizar, tagPantalla, tagsAInvalidar } from "./cache-reglas.ts";
import { permisosDireccion } from "./permisos.ts";
import { filtrarReservado, variantes } from "./reservado.ts";
import { esTablaFaltante, esSinPermiso } from "./supabase.ts";
import { cumpleMeta, DEF, DICC, polaridadDe } from "./diccionario.ts";
import { seccionDeRuta, seccionesVisibles, SECCIONES } from "./secciones.ts";
import { filasDeSnapshot } from "./snapshot.ts";
import type { Acceso } from "../auth/acceso.ts";
import type { Cifra, ResultadoCalculador, ResultadoPantalla } from "./tipos.ts";

const persona = (rol: Acceso["rol"], permisos: Acceso["permisos"] = {}): Acceso => ({ rol, activo: true, permisos, debeCambiarClave: false });

test("Actualizar ahora: como mucho una vez cada 5 minutos", () => {
  assert.deepEqual(puedeActualizar(null, 1_000), { ok: true });
  const r = puedeActualizar(0, 60_000);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.esperarSeg, 240);
    assert.match(r.mensaje, /4 minutos/);
  }
  assert.deepEqual(puedeActualizar(0, ESPERA_ACTUALIZAR_MS), { ok: true });
});

test("tags: La semana relee todo; otra pantalla, ella y La semana", () => {
  assert.equal(tagPantalla("caja"), "direccion:caja");
  assert.deepEqual(tagsAInvalidar("caja"), ["direccion:caja", "direccion:semana"]);
  assert.equal(tagsAInvalidar("semana").length, 8);
  assert.equal(claveParams({ vs: "anterior", g: "mes", p: "2026-10", x: "" }), "g=mes&p=2026-10&vs=anterior");
});

test("permisos: socios exige las dos llaves y el admin no lo trae solo", () => {
  assert.deepEqual(permisosDireccion(persona("admin")), { nivel: "editar", puedeVer: true, puedeEditar: true, conSocios: false });
  assert.equal(permisosDireccion(persona("admin", { "direccion-socios": "ver" })).conSocios, true);
  assert.equal(permisosDireccion(persona("operativo", { "direccion-socios": "ver" })).conSocios, false, "socios sin direccion no alcanza");
  assert.deepEqual(permisosDireccion(persona("operativo", { direccion: "ver" })), { nivel: "ver", puedeVer: true, puedeEditar: false, conSocios: false });
  assert.equal(permisosDireccion(null).puedeVer, false);
});

test("lo reservado no viaja a quien no tiene direccion-socios", () => {
  const r: ResultadoCalculador<{ tabla: number[]; reservado: { retiros: number } }> = {
    pantalla: "semana",
    tc: null,
    cifras: [
      { kpi: "caja_disponible", valor: { tipo: "monto", monto: { ars: 1 } }, confianza: { nivel: "ok" } },
      { kpi: "retiros", valor: { tipo: "monto", monto: { ars: 2 } }, confianza: { nivel: "inc" } },
      { kpi: "resultado", id: "x", valor: { tipo: "monto", monto: { ars: 3 } }, confianza: { nivel: "inc" }, reservado: true },
    ],
    avisos: [
      { id: "a", nivel: "ver", aviso: ["x"], afecta: [], quien: "", que: "", origen: "auto" },
      { id: "b", nivel: "inc", aviso: ["y"], afecta: ["retiros"], quien: "", que: "", origen: "auto", reservado: true },
    ],
    decisiones: [{ id: "d", sev: "rojo", pantalla: "socios", duenoSugerido: null, vence: null, corto: [], que: [], pregunta: "", reservado: true }],
    oraciones: [{ id: "o1", frase: ["a"] }, { id: "o2", frase: ["b"], reservado: true }],
    detalle: { tabla: [1], reservado: { retiros: 9 } },
  };
  const sin = filtrarReservado(r, false);
  assert.deepEqual(sin.cifras.map((c) => c.kpi), ["caja_disponible"]);
  assert.deepEqual(sin.avisos.map((a) => a.id), ["a"]);
  assert.deepEqual(sin.decisiones, []);
  assert.deepEqual(sin.oraciones?.map((o) => o.id), ["o1"]);
  assert.deepEqual(sin.detalle, { tabla: [1] });
  assert.equal(JSON.stringify(sin).includes("retiros\":9"), false);
  assert.deepEqual(filtrarReservado(r, true), r);
});

test("Supabase sin la migración: se reconoce la tabla faltante", () => {
  assert.equal(esTablaFaltante({ code: "42P01", message: "relation \"direccion_notas\" does not exist" }), true);
  assert.equal(esTablaFaltante({ code: "PGRST205", message: "Could not find the table 'public.direccion_notas' in the schema cache" }), true);
  assert.equal(esTablaFaltante({ code: "23505", message: "duplicate key" }), false);
  assert.equal(esTablaFaltante(null), false);
  assert.equal(esSinPermiso({ code: "42501", message: "new row violates row-level security policy" }), true);
});

test("diccionario: ids únicos, polaridad y metas sin semáforo inventado", () => {
  assert.equal(new Set(DICC.map((d) => d.id)).size, DICC.length);
  assert.equal(DEF.retiros.reservado, true);
  assert.equal(polaridadDe("vencido_30"), "↓");
  assert.equal(polaridadDe("nueva_vs_renov"), null);
  assert.equal(cumpleMeta("vencido_30", 10, 15), true);
  assert.equal(cumpleMeta("vencido_30", 20, 15), false);
  assert.equal(cumpleMeta("facturado_neto", 20, null), null);
  assert.equal(cumpleMeta("nueva_vs_renov", 20, 10), null);
  // Sin cifras del snapshot del 15/10 metidas en los textos.
  for (const d of DICC) assert.doesNotMatch(`${d.para} ${d.calc} ${d.ojo} ${d.motivo}`, /ARS \d|USD \d|\d+ (obras|contratos|órdenes)/, d.id);
});

test("secciones: Socios sólo con permiso y la ruta más larga gana", () => {
  assert.equal(SECCIONES.length, 7);
  assert.equal(seccionesVisibles(false).some((s) => s.id === "socios"), false);
  assert.equal(seccionesVisibles(true).length, 7);
  assert.equal(seccionDeRuta("/direccion").id, "semana");
  assert.equal(seccionDeRuta("/direccion/caja").id, "caja");
  assert.equal(seccionDeRuta("/direccion/socios/algo").id, "socios");
});

test("snapshot: una fila '*' y una por cifra; Socios entero reservado", () => {
  const r: ResultadoPantalla = {
    pantalla: "caja", tc: { valor: 1000, fecha: "2026-10-15" }, avisos: [], detalle: null,
    lectura: { tomadoAt: "2026-10-15T07:30:00Z", fuente: "vivo" },
    cifras: [
      { kpi: "caja_disponible", valor: { tipo: "monto", monto: { ars: 2_000_000 } }, confianza: { nivel: "ver" } },
      { kpi: "cobertura", valor: { tipo: "sin_dato", motivo: "x" }, confianza: { nivel: "inc" } },
    ],
  };
  const f = filasDeSnapshot(r);
  assert.deepEqual(f.map((x) => x.kpi_id), ["*", "caja_disponible", "cobertura"]);
  assert.equal(f[1].valor_usd, 2000);
  assert.equal(f[2].valor_ars, null, "sin dato se guarda como null, no 0");
  assert.equal(filasDeSnapshot({ ...r, pantalla: "socios" }).every((x) => x.reservado), true);
});

test("variantes: iguales van una vez; distintas, la de socios reservada y la pública soloSinSocios", () => {
  type X = { id: string; t: string; reservado?: boolean; soloConSocios?: boolean; soloSinSocios?: boolean };
  const a: X[] = [{ id: "caja", t: "igual" }];
  assert.deepEqual(variantes(a, [{ id: "caja", t: "igual" }]), a);
  const socios: X[] = [{ id: "caja", t: "con retiros" }, { id: "ret", t: "x", reservado: true }];
  const publico: X[] = [{ id: "caja", t: "sin retiros" }, { id: "ret", t: "x", reservado: true }];
  const v = variantes(socios, publico);
  assert.deepEqual(v, [
    { id: "caja", t: "con retiros", soloConSocios: true },
    { id: "ret", t: "x", reservado: true },
    { id: "caja", t: "sin retiros", soloSinSocios: true },
  ]);
  const r: ResultadoCalculador<null> = { pantalla: "caja", tc: null, cifras: [], avisos: [], detalle: null, oraciones: v.map((x) => ({ id: x.id, frase: [x.t], reservado: x.reservado, soloConSocios: x.soloConSocios, soloSinSocios: x.soloSinSocios })) };
  assert.deepEqual(filtrarReservado(r, true).oraciones?.map((o) => o.frase[0]), ["con retiros", "x"]);
  assert.deepEqual(filtrarReservado(r, false).oraciones?.map((o) => o.frase[0]), ["sin retiros"]);
});

test("snapshot: la versión de socios de una variante va en una fila reservada", () => {
  const r: ResultadoPantalla = {
    pantalla: "caja", tc: null, avisos: [], detalle: null, lectura: { tomadoAt: "2026-10-15T07:30:00Z", fuente: "vivo" },
    cifras: variantes<Cifra>(
      [{ kpi: "cobertura", valor: { tipo: "fecha", iso: "2026-11-25" }, confianza: { nivel: "inc" } }],
      [{ kpi: "cobertura", valor: { tipo: "fecha", iso: "2026-12-09" }, confianza: { nivel: "inc" } }],
    ),
  };
  const filas = filasDeSnapshot(r);
  assert.deepEqual(filas.filter((f) => f.kpi_id === "cobertura").map((f) => f.reservado), [true, false]);
  const estrellas = filas.filter((f) => f.kpi_id === "*");
  assert.equal(estrellas.length, 2);
  assert.doesNotMatch(JSON.stringify(estrellas[1].detalle), /2026-11-25/);
});

test("circuitos: sin socios no se ve el número de los comprobantes del diario sin documentos fiscales", async () => {
  const { ocultarCircuitos } = await import("./reservado.ts");
  const nodo = { filas: [{ titulo: "1/2026/00314", sub: "15/10/2026 · Cliente" }, { titulo: "FA-A 00007-00001184", sub: "vence 15/10" }] };
  assert.deepEqual(ocultarCircuitos(nodo), { filas: [{ titulo: "Comprobante", sub: "15/10/2026 · Cliente" }, { titulo: "FA-A 00007-00001184", sub: "vence 15/10" }] });
  assert.equal(ocultarCircuitos("FA-B 585 y 1/2026/00313"), "FA-B 585 y Comprobante");
  assert.equal(ocultarCircuitos("BILL1/2026/09/0003 · R1/2026/00003"), "Comprobante · Comprobante");
  // Los movimientos de banco y caja no son un circuito: quedan. Fechas y montos tampoco se tocan.
  assert.equal(ocultarCircuitos("El rechazo BNK1/2026/03388"), "El rechazo BNK1/2026/03388");
  assert.equal(ocultarCircuitos("CSH1/2026/00011 y 11/2026/00001"), "CSH1/2026/00011 y 11/2026/00001");
  assert.equal(ocultarCircuitos("del 08/10/2026 al 30/11/2026"), "del 08/10/2026 al 30/11/2026");
  const r = filtrarReservado({ pantalla: "ventas", tc: null, cifras: [], avisos: [], detalle: { x: "1/2026/00001" }, lectura: { tomadoAt: "", fuente: "vivo" } }, false);
  assert.deepEqual(r.detalle, { x: "Comprobante" });
  const s = filtrarReservado({ pantalla: "ventas", tc: null, cifras: [], avisos: [], detalle: { x: "1/2026/00001" }, lectura: { tomadoAt: "", fuente: "vivo" } }, true);
  assert.deepEqual(s.detalle, { x: "1/2026/00001" });
});
