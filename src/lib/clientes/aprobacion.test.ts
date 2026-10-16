// La tarjeta de aprobación (paso 6) con los escenarios de la propuesta y de la maqueta: Marcela
// en Los Aromos 1234 (escenario 1), el 14 → 11 (escenario 9), la ventana vencida (escenario 11),
// la racha del tablero (escenario 8) y Rocío con Jorge (escenario 2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import type { Lote } from "../catastro/caba.ts";
import { armarBorradorFacil, fichaVacia, type FichaCliente } from "./facil.ts";
import {
  aplicarCorreccion, avisoVentana, destinoDespues, estadosDesde, mensajeDesdeCalculo, mensajePresupuesto, modoEnvio, motivoYaDecidida,
  racha, recalcularBorrador, textoPareja, textoRacha, tomarUnaVez, validarCorreccion, verificarRecalculo,
  type DecisionRacha, type EstadoAprobacion, type FilaDecision, type RepoUnaVez,
} from "./aprobacion.ts";

const HOY = "2026-10-15";
const PARAMS = { maxMl: 25, jornadas: 1, renderId: "render-bandeja-generico", empresasConPersona: false };

function lote(direccion: string, frente = 12.4): Lote {
  return {
    fuente: "catastro", direccionConsultada: direccion, smp: "045-123-007", direccionOficial: direccion.toUpperCase(),
    frenteCatastro: frente, caras: [frente], tramosCortos: [], esquina: false, calles: [], fondo: 30, superficie: 372, pisos: 2,
    nota: null, consultado: "2026-10-15T12:00:00Z",
  };
}

function ficha(direccion = "Los Aromos 1234", frente = 12.4, nombre = "Marcela Ríos"): FichaCliente {
  return {
    ...fichaVacia(), nombre, telefono: "5491100001234", tipoCliente: "particular", trabajo: "bandeja", alturaBandeja: 3, necesitaAndamio: false,
    direccion, enCaba: true, lote: lote(direccion, frente), cubreTodoElFrente: true,
  };
}

const borrador = (f = ficha()) => armarBorradorFacil(f, T, { parametros: PARAMS, hoy: HOY, conflictoCanal: null });

// ── Una sola vez ────────────────────────────────────────────────────────────────────────

type Fila = FilaDecision & { decidido_por?: string };

/** Un repositorio en memoria con el mismo UPDATE condicionado que Supabase (atómico por fila). */
function repoEnMemoria(inicial: Fila[]): RepoUnaVez<Fila> & { filas: Map<string, Fila> } {
  const filas = new Map(inicial.map((f) => [f.id, { ...f }]));
  return {
    filas,
    async actualizarSi(id, desde, cambios) {
      // Una vuelta al loop de eventos, como un pedido a la base: así dos llamadas se cruzan.
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const f = filas.get(id);
      if (!f || !desde.includes(f.estado)) return null;
      const nueva = { ...f, ...cambios };
      filas.set(id, nueva);
      return nueva;
    },
    async leer(id) {
      return filas.get(id) ?? null;
    },
  };
}

const pendiente = (id = "a1", cambios: Partial<Fila> = {}): Fila => ({ id, estado: "pendiente", tipo: "precio", decididoPor: null, updatedAt: "2026-10-15T12:00:00Z", ...cambios });
const nombres = async (id: string | null) => ({ sandra: "Sandra", js: "Joaquín" })[id ?? ""] ?? null;

test("una sola vez: si Sandra y Joaquín tocan Aprobar a la vez, gana uno y el otro lee quién", async () => {
  for (let i = 0; i < 20; i++) {
    const repo = repoEnMemoria([pendiente()]);
    const [a, b] = await Promise.all([
      tomarUnaVez(repo, "a1", "aprobar", { estado: "ejecutando", decididoPor: "sandra" }, nombres),
      tomarUnaVez(repo, "a1", "aprobar", { estado: "ejecutando", decididoPor: "js" }, nombres),
    ]);
    assert.equal([a, b].filter((x) => x.ok).length, 1, "gana exactamente uno");
    const perdedor = a.ok ? b : a;
    const ganador = repo.filas.get("a1")!.decididoPor === "sandra" ? "Sandra" : "Joaquín";
    assert.ok(!perdedor.ok);
    assert.equal(perdedor.motivo, `Ya lo aprobó ${ganador}: se está guardando en Odoo.`);
  }
});

test("una sola vez: lo ya aprobado, rechazado o descartado no se vuelve a decidir", async () => {
  const repo = repoEnMemoria([
    pendiente("ok", { estado: "aprobada", decididoPor: "sandra" }),
    pendiente("no", { estado: "rechazada", decididoPor: "js" }),
    pendiente("tec", { estado: "aprobada", decididoPor: "js", tipo: "tecnico" }),
  ]);
  const r1 = await tomarUnaVez(repo, "ok", "aprobar", { estado: "ejecutando" }, nombres);
  assert.deepEqual([r1.ok, !r1.ok && r1.motivo], [false, "Ya lo aprobó Sandra."]);
  const r2 = await tomarUnaVez(repo, "no", "rechazar", { estado: "rechazada" }, nombres);
  assert.deepEqual([r2.ok, !r2.ok && r2.motivo], [false, "Joaquín decidió no mandarlo."]);
  const r3 = await tomarUnaVez(repo, "tec", "aprobar", { estado: "ejecutando" }, nombres);
  assert.equal(!r3.ok && r3.motivo, "Ya lo confirmó Joaquín.");
  assert.equal(repo.filas.get("ok")!.estado, "aprobada");
  const r4 = await tomarUnaVez(repo, "nada", "aprobar", { estado: "ejecutando" }, nombres);
  assert.equal(!r4.ok && r4.motivo, "Esa aprobación ya no existe.");
});

test("reintentar: sólo desde error, o desde ejecutando si quedó colgada más de 6 minutos", async () => {
  const ahora = Date.parse("2026-10-15T12:10:00Z");
  const repo = repoEnMemoria([
    pendiente("err", { estado: "error", decididoPor: "js" }),
    pendiente("corre", { estado: "ejecutando", decididoPor: "js", updatedAt: "2026-10-15T12:08:00Z" }),
    pendiente("colgada", { estado: "ejecutando", decididoPor: "js", updatedAt: "2026-10-15T12:00:00Z" }),
    pendiente("pend"),
  ]);
  assert.equal((await tomarUnaVez(repo, "err", "reintentar", { estado: "ejecutando" }, nombres, ahora)).ok, true);
  const corre = await tomarUnaVez(repo, "corre", "reintentar", { estado: "ejecutando" }, nombres, ahora);
  assert.equal(!corre.ok && corre.motivo, "Se está guardando ahora: esperá un momento.");
  assert.equal((await tomarUnaVez(repo, "colgada", "reintentar", { estado: "ejecutando" }, nombres, ahora)).ok, true);
  assert.equal((await tomarUnaVez(repo, "pend", "reintentar", { estado: "ejecutando" }, nombres, ahora)).ok, false);
  // La que quedó «falta la plantilla» se manda cuando el cliente vuelve a escribir.
  const repo3 = repoEnMemoria([pendiente("fp", { estado: "falta_plantilla", decididoPor: "js" }), pendiente("ap", { estado: "aprobada", decididoPor: "js" })]);
  assert.equal((await tomarUnaVez(repo3, "fp", "reintentar", { estado: "ejecutando" }, nombres, ahora)).ok, true);
  const ya = await tomarUnaVez(repo3, "ap", "reintentar", { estado: "ejecutando" }, nombres, ahora);
  assert.equal(!ya.ok && ya.motivo, "Ya lo aprobó Joaquín.");
  // Dos reintentos a la vez sobre el mismo error: uno solo.
  const repo2 = repoEnMemoria([pendiente("e2", { estado: "error" })]);
  const rs = await Promise.all([1, 2, 3].map(() => tomarUnaVez(repo2, "e2", "reintentar", { estado: "ejecutando" }, nombres, ahora)));
  assert.equal(rs.filter((r) => r.ok).length, 1);
});

test("los estados desde los que se puede decidir", () => {
  assert.deepEqual(estadosDesde("aprobar"), ["pendiente"]);
  assert.deepEqual(estadosDesde("rechazar"), ["pendiente"]);
  assert.deepEqual(estadosDesde("reintentar"), ["error", "ejecutando", "falta_plantilla"]);
  const todos: EstadoAprobacion[] = ["pendiente", "ejecutando", "error", "aprobada", "corregida", "falta_plantilla", "rechazada", "tomada", "vencida", "descartada"];
  for (const e of todos) assert.ok(motivoYaDecidida(e, "Sandra").length > 5, e);
  assert.match(motivoYaDecidida("falta_plantilla", "Sandra"), /falta mandarlo con la plantilla/);
});

// ── Recalcular y corregir ───────────────────────────────────────────────────────────────

test("recalcular: con la misma tarifa da lo mismo que armó Sofía; si cambió, no se manda", () => {
  const b = borrador();
  const r = recalcularBorrador(b.datos, T, HOY);
  assert.equal(r.totales.subtotal, 1_736_000);
  assert.equal(r.totales.subtotal, b.resultado.totales.subtotal);
  assert.deepEqual(verificarRecalculo(1_736_000, r.totales.subtotal), { ok: true });
  assert.deepEqual(verificarRecalculo(1_736_001, r.totales.subtotal), { ok: true }, "un peso es redondeo");

  // Subió la tarifa entre que se abrió la tarjeta y se tocó Aprobar.
  const T2 = { ...T, bandeja: { ...T.bandeja, m3: 150_000 } };
  const r2 = recalcularBorrador(b.datos, T2, HOY);
  assert.equal(r2.totales.subtotal, 1_860_000);
  const v = verificarRecalculo(1_736_000, r2.totales.subtotal);
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.texto.includes("$ 1.860.000") && v.texto.includes("$ 1.736.000") && /No se mandó nada/.test(v.texto));
  assert.equal(verificarRecalculo(null, 10).ok, false);
});

test("corregir metros (escenario 9: 14 → 11): recalcula y rehace los textos del PDF", () => {
  const b = borrador(ficha("Av. Ficticia 800", 14, "Consorcio Av. Ficticia 800"));
  assert.equal(b.resultado.totales.subtotal, 14 * 140_000);
  const c = { tipo: "metros" as const, motivo: "Pasé por la obra: la bandeja va sólo por 11 m", metros: 11 };
  assert.equal(validarCorreccion(c), null);
  const d = aplicarCorreccion(b.datos, c, T);
  const r = recalcularBorrador(d, T, HOY);
  assert.equal(r.totales.subtotal, 11 * 140_000);
  assert.match(d.seccion1 ?? "", /11 m\.l\./);
  assert.equal(d.referencia, "Bandeja de protección 11 m.l.");
  assert.equal(b.datos.calculos.bandeja!.metros, 14, "el original no cambia");
  assert.deepEqual(r.avisos.filter((a) => a.nivel === "bloqueo"), []);
});

test("corregir precio y piezas: el precio lleva el motivo como desvío; las piezas mueven concertina y gestoría", () => {
  const b = borrador();
  const p = aplicarCorreccion(b.datos, { tipo: "precio", motivo: "Precio pactado con el consorcio", precioMl: 120_000 }, T);
  const rp = recalcularBorrador(p, T, HOY);
  assert.equal(rp.totales.subtotal, Math.round(12.4 * 120_000));
  assert.equal(rp.lineas.find((l) => l.id === "bandeja")?.desvio?.motivo, "Precio pactado con el consorcio");

  const s = aplicarCorreccion(b.datos, { tipo: "piezas", motivo: "Quiere la gestoría incluida", gestoria: "base", concertina: "no" }, T);
  const rs = recalcularBorrador(s, T, HOY);
  assert.equal(rs.lineas.find((l) => l.id === "gestoria")?.seccion, "base");
  assert.equal(rs.lineas.find((l) => l.id === "bandeja:concertina"), undefined);
  assert.equal(rs.totales.subtotal, 1_736_000 + 350_000);

  const t = aplicarCorreccion(b.datos, { tipo: "texto", motivo: "Cambié el saludo", texto: "Hola" }, T);
  assert.deepEqual(t, b.datos, "el texto no toca los números");
});

test("corregir: el motivo es obligatorio y cada tipo pide lo suyo", () => {
  assert.match(validarCorreccion({ tipo: "metros", motivo: "", metros: 11 }) ?? "", /motivo/);
  assert.match(validarCorreccion({ tipo: "metros", motivo: "medí", metros: 0 }) ?? "", /metros/);
  assert.match(validarCorreccion({ tipo: "precio", motivo: "pactado" }) ?? "", /precio/);
  assert.match(validarCorreccion({ tipo: "piezas", motivo: "sin concertina" }) ?? "", /concertina/);
  assert.match(validarCorreccion({ tipo: "texto", motivo: "saludo", texto: "  " }) ?? "", /texto/);
  assert.equal(validarCorreccion({ tipo: "otro", motivo: "el cliente pidió otra fecha" }), null);
});

// ── La ventana ──────────────────────────────────────────────────────────────────────────

test("ventana: abierta sale libre; con menos de 2 h avisa; cerrada (64 h, escenario 11) falta la plantilla", () => {
  const ahora = Date.parse("2026-10-19T12:00:00Z"); // lunes 9:00 en Buenos Aires
  const hace = (h: number) => new Date(ahora - h * 3_600_000).toISOString();
  assert.equal(modoEnvio(hace(1), ahora), "libre");
  assert.equal(avisoVentana(hace(1), ahora).nivel, "ok");
  assert.equal(avisoVentana(hace(1), ahora).texto, "Ventana: quedan 23 h");
  const porVencer = avisoVentana(hace(22 + 20 / 60), ahora);
  assert.equal(porVencer.nivel, "por_vencer");
  assert.match(porVencer.texto, /1 h 40 min/);
  assert.equal(modoEnvio(hace(22 + 20 / 60), ahora), "libre");
  const cerrada = avisoVentana(hace(64), ahora);
  assert.equal(cerrada.nivel, "cerrada");
  assert.match(cerrada.texto, /Ventana cerrada \(64 h\)/);
  assert.match(cerrada.texto, /falta la plantilla/);
  assert.equal(modoEnvio(hace(64), ahora), "plantilla");
  // En el último minuto ya no da: entre el botón y Meta pasan segundos.
  assert.equal(modoEnvio(new Date(ahora - 24 * 3_600_000 + 60_000).toISOString(), ahora), "plantilla");
  assert.equal(modoEnvio(null, ahora), "plantilla");
});

// ── Los textos ──────────────────────────────────────────────────────────────────────────

test("el mensaje del presupuesto de Marcela es el texto fijo de §2, con los números del motor", () => {
  const b = borrador();
  const m = mensajeDesdeCalculo({ datos: b.datos, resultado: b.resultado, tarifas: T, nombre: "Marcela Ríos", asistente: "Sandra", tecnico: "Gabriel" });
  assert.equal(
    m,
    [
      "Hola Marcela, ¿cómo estás? Te mando el presupuesto de la bandeja de protección para Los Aromos 1234. Te lo preparó Sandra, que trabaja con Gabriel Stepansky.",
      "Bandeja de 12,40 m por 30 días: $ 1.736.000 + IVA (total $ 2.100.560). Si la obra sigue después de los 30 días, cada mes adicional sale $ 607.600 + IVA (lo ves en el PDF). " +
        "El permiso de vía pública, la concertina, seguridad e higiene y la memoria van aparte, como opcionales, y están en el PDF.",
      "El presupuesto vale 15 días. Cualquier duda escribime y lo vemos. ¡Muchas gracias por tenernos en cuenta!",
    ].join("\n"),
  );
});

test("el mensaje: de usted, sin nombre para un consorcio, con el mínimo de 10 m y sin pareja", () => {
  const base = {
    nombre: "Consorcio Las Lilas 400", direccion: "Las Lilas 400", metros: 8, minimoMl: 10, periodoDias: 30, neto: 1_400_000, total: 1_694_000,
    renovacion: 490_000, validezDias: 15, opcionales: ["gestoria"], asistente: null, tecnico: null,
  };
  const m = mensajePresupuesto({ ...base, trato: "usted" });
  assert.match(m, /^Hola, ¿cómo está\? Le mando el presupuesto de la bandeja de protección para Las Lilas 400\.\n/);
  assert.match(m, /Bandeja de 8 m \(se cobra el mínimo de 10 m\) por 30 días: \$ 1\.400\.000 \+ IVA \(total \$ 1\.694\.000\)/);
  assert.match(m, /\(lo ve en el PDF\)/);
  assert.match(m, /El permiso de vía pública va aparte, como opcional, y está en el PDF\./);
  assert.match(m, /escríbame/);
  assert.doesNotMatch(m, /preparó/);
  // Sin montos de más: sólo el neto, el total y la renovación.
  assert.deepEqual(m.match(/\$ [\d.]+/g), ["$ 1.400.000", "$ 1.694.000", "$ 490.000"]);
});

test("el texto de la pareja (§5): siempre la asistente con su técnico, nunca «te escribe Gabriel»", () => {
  assert.equal(textoPareja({ asistente: "Rocío", tecnico: "Jorge" }), "Ya tiene tu pedido Rocío, que trabaja con Jorge Riveros. Te escribe por acá.");
  assert.equal(textoPareja({ asistente: "Rocío", tecnico: "Jorge", trato: "usted" }), "Ya tiene su pedido Rocío, que trabaja con Jorge Riveros. Le escribe por acá.");
  assert.equal(textoPareja({ asistente: "Tamara", tecnico: null }), "Ya tiene tu pedido Tamara. Te escribe por acá.");
  assert.equal(textoPareja({ asistente: null, tecnico: null }), null);
});

// ── Después de decidir ──────────────────────────────────────────────────────────────────

test("después de decidir: precio vuelve a Sofía; técnico, texto bloqueado y «Lo tomo yo» quedan con la persona", () => {
  assert.equal(destinoDespues({ tipo: "precio", accion: "aprobar", iaActiva: true }), "sofia");
  assert.equal(destinoDespues({ tipo: "tecnico", accion: "aprobar", iaActiva: true }), "persona");
  assert.equal(destinoDespues({ tipo: "texto_bloqueado", accion: "aprobar", iaActiva: true }), "persona");
  assert.equal(destinoDespues({ tipo: "precio", accion: "rechazar", iaActiva: true }), "persona");
  assert.equal(destinoDespues({ tipo: "tecnico", accion: "aprobar", iaActiva: true, propuesta: "sofia" }), "sofia", "lo dice la propuesta");
  assert.equal(destinoDespues({ tipo: "precio", accion: "aprobar", iaActiva: true, elegido: "persona" }), "persona", "lo eligió quien aprueba");
  assert.equal(destinoDespues({ tipo: "precio", accion: "aprobar", iaActiva: false, elegido: "sofia" }), "persona", "con Sofía apagada, siempre una persona");
});

// ── La racha ────────────────────────────────────────────────────────────────────────────

const dec = (i: number, estado: EstadoAprobacion = "aprobada", correccionTipo: DecisionRacha["correccionTipo"] = null): DecisionRacha => ({
  estado, correccionTipo, decididoAt: `2026-11-${String(1 + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00Z`,
});

test("la racha (escenario 8): 11 sin tocar, 1 de texto que no corta, 1 de metros que la vuelve a 0, y 10 después", () => {
  const ds: DecisionRacha[] = [];
  let i = 0;
  for (let k = 0; k < 11; k++) ds.push(dec(i++));
  ds.push(dec(i++, "corregida", "texto"));
  ds.push(dec(i++, "corregida", "metros"));
  for (let k = 0; k < 10; k++) ds.push(dec(i++, k === 3 ? "falta_plantilla" : "aprobada"));
  const r = racha(ds.reverse()); // el orden de entrada no importa
  assert.equal(r.actual, 10);
  assert.equal(r.sinTocar, 10);
  assert.equal(r.completa, false);
  assert.equal(r.ultimoCorte, dec(12).decididoAt);
  assert.equal(textoRacha(r), "racha 10 de 20");
});

test("la racha: precio y piezas también cortan; rechazadas y tomadas no suman ni cortan; 20 la completan", () => {
  assert.equal(racha([dec(0), dec(1, "corregida", "precio")]).actual, 0);
  assert.equal(racha([dec(0), dec(1, "corregida", "piezas"), dec(2)]).actual, 1);
  assert.equal(racha([dec(0), dec(1, "rechazada"), dec(2, "tomada"), dec(3, "error"), dec(4)]).actual, 2);
  const r = racha([...Array(20)].map((_, k) => dec(k, "aprobada", k === 5 ? "otro" : null)));
  assert.deepEqual([r.actual, r.sinTocar, r.completa], [20, 19, true]);
  assert.equal(textoRacha(r), "racha completa (20 de 20)");
  assert.equal(racha([]).actual, 0);
});
