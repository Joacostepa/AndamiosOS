// Espeja la planilla de operaciones ("OBRAS A REALIZAR") contra Odoo, desde el corte
// de la importación masiva del 15/08/2026 hasta hoy.
//
// La unidad de espejado es el PARTE DIARIO, no la OT: en x_aba_orden_trabajo los campos
// x_fecha_ejecucion, x_fecha_fin_ejecucion, x_dias_obra, x_periodo, x_horas_hombre y los
// costos son computados desde x_parte_diario_ids. Escribir fechas en la OT no haría nada.
// Por eso: una fila de la planilla = una jornada = un parte + su línea de mano de obra.
// Con eso las fechas y los costos de la OT caen solos.
//
// Idempotente: la OT se ubica por (orden de venta, tipo) — y para adicionales, además por
// fecha, vía x_andamios_id. El parte se ubica por (OT, fecha). Re-correr no duplica.
//
// Dry-run por defecto. Para escribir: --escribir
//   node --env-file=.env.local scripts/odoo-espejar-planilla-obras.mjs
//   node --env-file=.env.local scripts/odoo-espejar-planilla-obras.mjs --escribir

import { readFileSync } from "node:fs";
import { authenticate, searchRead, create, write } from "./odoo-rpc.mjs";

const CSV = process.env.PLANILLA_CSV
  || "/Users/joaquinstepansky/Downloads/Copia de OBRAS A REALIZAR 2026 - Obras.csv";
const CORTE = "2026-08-15";                    // última fecha que entró en la importación masiva
const HOY = new Date().toISOString().slice(0, 10);
const ESCRIBIR = process.argv.includes("--escribir");

// ── Planilla ────────────────────────────────────────────────────────────────
function parseCsv(txt) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const p2 = (n) => String(n).padStart(2, "0");

/** "18/06/2026" | "8/6/2026" | "05/06" → ISO. Años imposibles (0226) se leen como 2026. */
function fecha(s) {
  if (!s) return null;
  s = s.trim().split(" ")[0];
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; y = +y; if (y < 100) y += 2000; if (y < 2000 || y > 2100) y = 2026;
    if (+mo > 12 || +d > 31) return null; return `${y}-${p2(+mo)}-${p2(+d)}`; }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m && +m[2] <= 12 && +m[1] <= 31) return `2026-${p2(+m[2])}-${p2(+m[1])}`;
  return null;
}
/** Primera fecha suelta dentro del texto de FECHA DE OBRA ("CONFIRMADO VIERNES 28/08 8HS"). */
function pista(txt) {
  const m = (txt || "").match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3] || 2026}-${p2(mo)}-${p2(d)}`;
}
const fechaHeader = (s) => { const m = (s || "").match(/(\d{1,2})-(\d{1,2})-(\d{4})/); return m ? `${m[3]}-${p2(+m[2])}-${p2(+m[1])}` : null; };
const codOrden = (s) => { const m = (s || "").match(/S\d{5}/); return m ? m[0] : null; };

function leerPlanilla() {
  const raw = parseCsv(readFileSync(CSV, "utf8"));
  const filas = []; let seccion = "CALENDARIO", secFecha = null;
  raw.slice(1).forEach((r, i) => {
    const marca = ((r[6] || "") + " " + (r[7] || "")).trim();
    if (!codOrden(r[0])) {
      if (/OBRAS NUEVAS/i.test(marca)) { seccion = "NUEVAS"; secFecha = null; }
      else if (/OBRAS TERMINADAS/i.test(marca)) { seccion = "CALENDARIO"; secFecha = null; }
      else { const f = fechaHeader(marca); if (f) { seccion = "CALENDARIO"; secFecha = f; } }
      return;
    }
    filas.push({
      linea: i + 2, orden: codOrden(r[0]),
      tipo: (r[8] || "").trim().toUpperCase() === "D" ? "desarme" : "armado",
      fechaEj: fecha(r[4]), secFecha, seccion,
      estadoPlan: (r[9] || "").trim().toUpperCase(), fechaObra: (r[10] || "").trim(),
      tecnico: (r[5] || "").trim(), puntero: (r[11] || "").trim(),
      urgencia: (r[12] || "").trim().toUpperCase(), tipoObra: (r[17] || "").trim(),
      detalle: (r[18] || "").trim(), incidencias: (r[20] || "").trim(),
      reporte: (r[23] || "").trim(), dias: (r[24] || "").trim(),
      person: (r[25] || "").trim(), opInc: (r[28] || "").trim(),
    });
  });
  return filas;
}

// ── Fecha efectiva ──────────────────────────────────────────────────────────
// La columna FECHA DE EJECUCION a veces queda vieja (típico typo de mes: 28/07 donde en
// realidad fue el 28/08) y a veces el typo está en el texto ("SABADO 29/09" por 29/08).
// El desempate confiable es el día de la semana: el texto casi siempre lo declara, y sólo
// una de las dos fechas candidatas cae en ese día. Si ninguna o ambas coinciden, manda la
// columna. El encabezado de día de la planilla, cuando existe, gana sobre todo lo demás.
const DIA_SEMANA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 };
const diaDe = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
function diaDeclarado(txt) {
  const m = (txt || "").toLowerCase().match(/\b(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/);
  return m ? DIA_SEMANA[m[1]] : null;
}

function fechasEfectivas(filas) {
  const corregidas = [];
  for (const f of filas) {
    const ph = pista(f.fechaObra);
    if (f.secFecha) { f.eff = f.secFecha; f.origen = "encabezado"; continue; }
    const dow = diaDeclarado(f.fechaObra);
    if (f.fechaEj && ph && ph !== f.fechaEj && dow !== null) {
      const colOk = diaDe(f.fechaEj) === dow, txtOk = diaDe(ph) === dow;
      if (txtOk && !colOk) {
        f.eff = ph; f.origen = "texto (el día de la semana lo confirma)";
        corregidas.push({ ...f, desde: f.fechaEj, hacia: ph });
        continue;
      }
    }
    // Sin día de la semana que desempate, queda el typo de mes puro: mismo día, mismo año,
    // mes distinto y el texto apunta más adelante ("A PARTIR DEL 28/08" con columna 28/07).
    if (f.fechaEj && ph && ph > f.fechaEj && ph.slice(8) === f.fechaEj.slice(8) && ph.slice(0, 4) === f.fechaEj.slice(0, 4)) {
      f.eff = ph; f.origen = "texto (mismo día, mes corregido)";
      corregidas.push({ ...f, desde: f.fechaEj, hacia: ph });
      continue;
    }
    if (f.fechaEj) { f.eff = f.fechaEj; f.origen = "columna"; }
    else if (ph && f.seccion !== "NUEVAS") { f.eff = ph; f.origen = "texto"; }
    else { f.eff = null; f.origen = "sin fecha"; }
  }
  return { corregidas };
}

// ── Mapeos planilla → Odoo ──────────────────────────────────────────────────
// Convención verificada contra 208 partes ya cargados: DIAS es fracción de jornada.
const HORAS_POR_DIAS = { "0.1": 1.5, "0.25": 2, "0.5": 4, "0.75": 6, "1": 8 };
// x_horas NO se escribe: Odoo lo computa como (hasta − desde) menos lo que pise el almuerzo
// de 12 a 13. Así que la hora de salida no es 8 + horas — una jornada que cruza el mediodía
// necesita una hora más de reloj para sumar las mismas horas trabajadas. Por eso el
// histórico carga 8→17 para 8 h y 8→15 para 6 h, y no 8→16 y 8→14.
const finDeJornada = (horas) => (8 + horas > 12 ? 8 + horas + 1 : 8 + horas);
const DURACION_EST = { "0.1": "0.10", "0.25": "0.25", "0.5": "0.50", "0.75": "0.75", "1": "1" };
const num = (s) => (s || "").replace(",", ".").trim();
const URGENCIA = { BAJA: "baja", MEDIA: "media", ALTA: "alta" };
const esAdicional = (f) => ["ADICIONAL", "RECLAMOS"].includes(f.estadoPlan);
const limpio = (s) => (s && s !== "-" ? s : "");

// ── Main ────────────────────────────────────────────────────────────────────
await authenticate();
console.log(`${ESCRIBIR ? "✍️  ESCRITURA" : "🔍 DRY-RUN"} · corte ${CORTE} · hoy ${HOY}\n`);

const filas = leerPlanilla();
const { corregidas } = fechasEfectivas(filas);

const [cuadrillas, otsOdoo] = await Promise.all([
  searchRead("x_aba_cuadrilla", [], ["x_name"]),
  searchRead("x_aba_orden_trabajo", [], ["x_order_id", "x_tipo", "x_estado", "x_andamios_id", "x_fecha_ejecucion", "x_fecha_fin_ejecucion"]),
]);
const cuadrillaId = Object.fromEntries(cuadrillas.map((c) => [c.x_name.toUpperCase(), c.id]));
const codigos = [...new Set(filas.map((f) => f.orden))];
const sos = await searchRead("sale.order", [["name", "in", codigos]], ["name"]);
const soId = Object.fromEntries(sos.map((s) => [s.name, s.id]));

const otPorClave = {};           // "S01234|armado" → OT existente (la regular, no adicional)
const otPorAndamios = {};        // x_andamios_id → OT (adicionales creadas por este script)
for (const o of otsOdoo) {
  if (o.x_andamios_id) otPorAndamios[o.x_andamios_id] = o;
  const n = o.x_order_id && o.x_order_id[1];
  if (!n || o.x_andamios_id) continue;
  // Puede haber más de una OT por orden+tipo (un armado que se cayó y se rehízo, p.ej.).
  // La que espeja la planilla de hoy es la viva, no la cerrada hace meses.
  const k = `${n}|${o.x_tipo}`, prev = otPorClave[k];
  const viva = (x) => x.x_estado === "pendiente" || x.x_estado === "en_proceso";
  if (!prev || (viva(o) && !viva(prev)) || (viva(o) === viva(prev) && o.id > prev.id)) otPorClave[k] = o;
}

// Agrupar filas en OTs destino. Regular: una OT por (orden, tipo), con todas sus jornadas.
// Adicional/reclamo: una OT por visita, porque es un trabajo distinto sobre la misma orden.
const grupos = new Map();
for (const f of filas) {
  if (f.eff && f.eff <= CORTE) continue;                       // ya entró en la importación
  if (!f.eff && f.seccion !== "NUEVAS") continue;              // fila de calendario sin fecha
  const clave = esAdicional(f)
    ? `${f.orden}|${f.tipo}|ADIC|${f.eff || "s-f"}`
    : `${f.orden}|${f.tipo}`;
  if (!grupos.has(clave)) grupos.set(clave, { clave, orden: f.orden, tipo: f.tipo, adicional: esAdicional(f), filas: [] });
  grupos.get(clave).filas.push(f);
}

const plan = { crearOT: [], actualizarOT: [], crearParte: [], saltados: [], problemas: [] };
const partesExistentes = {}, primerParteDe = {};
// Las OTs de adicional viven en otPorAndamios, no en otPorClave: si no se las incluye acá,
// un segundo pase no ve sus partes y los duplica.
const otIdsExistentes = [...new Set([...Object.values(otPorClave), ...Object.values(otPorAndamios)].map((o) => o.id))];
for (const p of await searchRead("x_aba_parte_diario", [["x_orden_trabajo_id", "in", otIdsExistentes]], ["x_orden_trabajo_id", "x_fecha"])) {
  const ot = p.x_orden_trabajo_id[0];
  partesExistentes[`${ot}|${p.x_fecha}`] = p.id;
  if (p.x_fecha && (!primerParteDe[ot] || p.x_fecha < primerParteDe[ot])) primerParteDe[ot] = p.x_fecha;
}

for (const g of grupos.values()) {
  const jornadas = [...new Set(g.filas.map((f) => f.eff).filter(Boolean))].sort();
  const ultimaFila = g.filas[g.filas.length - 1];
  const ultima = jornadas[jornadas.length - 1];

  if (!soId[g.orden]) { plan.problemas.push(`${g.clave}: no existe la orden de venta ${g.orden} en Odoo`); continue; }

  // La columna ESTADO de la planilla es el estado de la OBRA, no el de la OT, así que hay que
  // leerla contra el tipo: una OT está hecha cuando la obra alcanzó el estado que esa OT
  // produce. El armado produce ARMADA, y si la obra ya se desarmó el armado también pasó. Un
  // desarme con la obra todavía en ARMADA está programado pero NO ejecutado, por más que la
  // fecha ya haya pasado — y no se lo detecta por el reporte: DIAS y REPORTE DE OBRA salen del
  // informe técnico y están cargados desde antes de ir a la obra.
  const PRODUCE = { armado: ["ARMADA", "DESARMADA"], desarme: ["DESARMADA"] };
  const cierra = (e) => PRODUCE[g.tipo].includes(e) || ["ADICIONAL", "RECLAMOS"].includes(e);
  // Una jornada cuenta como hecha sólo si la planilla lo afirma. ESTADO vacío significa que
  // operaciones todavía no la tocó — o sea que no salió —, no que salió y falta cerrarla:
  // que la fecha haya pasado no prueba nada, las obras se caen y se reprograman seguido.
  // EN PROCESO sí es afirmativo: es una obra de varias jornadas ya arrancada.
  const seEjecuto = (f) =>
    !!f.eff && f.eff <= HOY && (cierra(f.estadoPlan) || f.estadoPlan === "EN PROCESO");

  const hechas = g.filas.filter(seEjecuto);
  const estadoOT = !hechas.length ? "pendiente"
    : ultima <= HOY && cierra(ultimaFila.estadoPlan) ? "completada"
    : "en_proceso";

  const vals = {
    x_order_id: soId[g.orden], x_tipo: g.tipo, x_estado: estadoOT,
    x_detalle_tecnico: limpio(ultimaFila.detalle), x_ejecutado_real: limpio(ultimaFila.reporte),
    x_tecnico: limpio(ultimaFila.tecnico), x_urgencia: URGENCIA[ultimaFila.urgencia] || "baja",
    x_observaciones: limpio(ultimaFila.incidencias),
  };
  if (g.adicional) { vals.x_es_adicional = true; vals.x_andamios_id = `PLANILLA-${g.clave}`; }
  const dur = DURACION_EST[num(ultimaFila.dias)];
  if (dur) vals.x_duracion_est = dur;
  if (+ultimaFila.person) vals.x_personal_por_jornada = +ultimaFila.person;

  // Programación: la primera jornada que todavía no se hizo, aunque su fecha ya haya pasado
  // (un desarme confirmado que no salió sigue siendo trabajo por hacer, no trabajo hecho).
  const programadas = g.filas.filter((f) => f.eff && !seEjecuto(f)).map((f) => f.eff).sort();
  if (programadas.length) {
    vals.x_fecha_programada = programadas[0];
    const cid = cuadrillaId[(ultimaFila.puntero || "").toUpperCase()];
    if (cid) vals.x_cuadrilla_prevista_id = cid;
  }

  const existente = g.adicional ? otPorAndamios[`PLANILLA-${g.clave}`] : otPorClave[g.clave];
  // Una fila de backlog sin fecha no sabe nada del avance real: refresca la descripción, pero
  // nunca hace retroceder el estado de una OT que ya arrancó o cerró.
  if (existente && !jornadas.length && existente.x_estado !== "pendiente") delete vals.x_estado;
  const destino = { g, jornadas, hechas, programadas, vals, existente };
  (existente ? plan.actualizarOT : plan.crearOT).push(destino);

  // Un parte por jornada efectivamente hecha. Las futuras las genera el tablero.
  for (const f of hechas) {
    if (existente && partesExistentes[`${existente.id}|${f.eff}`]) { plan.saltados.push(`parte ${g.orden} ${g.tipo} ${f.eff} ya existe`); continue; }
    const horas = HORAS_POR_DIAS[num(f.dias)];
    const personas = +f.person || 0;
    if (!horas || !personas) plan.problemas.push(`${g.orden} ${g.tipo} ${f.eff}: DIAS="${f.dias}" PERSON="${f.person}" → parte sin mano de obra`);
    plan.crearParte.push({ destino, fila: f, fecha: f.eff, horas, personas,
      cuadrilla: cuadrillaId[(f.puntero || "").toUpperCase()] || null });
  }
  for (const f of g.filas)
    if (!seEjecuto(f) && f.eff && f.eff <= HOY)
      plan.saltados.push(`${g.orden} ${g.tipo} ${f.eff}: ESTADO=${f.estadoPlan || "(vacío)"} → no se ejecutó`);
}

// El flete va sólo en la primera jornada de la OT: el camión entrega el material el día 1
// y la cuadrilla se queda. En el histórico, la jornada única y la primera llevan flete en
// el 98-100% de los casos; las intermedias y la última, nunca. La cantidad es 1, o 2 si la
// jornada es completa (8h) — es el valor modal y un piso: los desvíos del histórico son
// todos hacia arriba (obras grandes que pidieron más camiones), dato que la planilla no trae.
const nuevosPorOT = {};
for (const p of plan.crearParte) (nuevosPorOT[p.destino.g.clave] ||= []).push(p);
for (const [clave, ps] of Object.entries(nuevosPorOT)) {
  ps.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const yaHabia = ps[0].destino.existente ? primerParteDe[ps[0].destino.existente.id] : null;
  if (yaHabia && yaHabia <= ps[0].fecha) continue;   // la OT ya despachó su flete antes
  ps[0].flete = ps[0].horas >= 8 ? 2 : 1;
}

// ── Informe ─────────────────────────────────────────────────────────────────
const L = "─".repeat(78);
console.log(`Filas de la planilla posteriores al corte: ${[...grupos.values()].reduce((a, g) => a + g.filas.length, 0)}`);
console.log(`OTs a crear: ${plan.crearOT.length} · a actualizar: ${plan.actualizarOT.length} · partes a crear: ${plan.crearParte.length}\n`);

if (corregidas.length) {
  console.log(`${L}\nFECHAS CORREGIDAS (la columna no cae en el día de la semana que declara el texto) — ${corregidas.length}\n${L}`);
  for (const o of corregidas) console.log(`  L${o.linea} ${o.orden} ${o.tipo.padEnd(8)} ${o.desde} → ${o.hacia}   "${o.fechaObra.slice(0, 44)}"`);
}

console.log(`\n${L}\nOTs A CREAR — ${plan.crearOT.length}\n${L}`);
for (const d of plan.crearOT)
  console.log(`  ${d.g.orden} ${d.g.tipo.padEnd(8)}${d.g.adicional ? " ADIC" : "     "} ${d.vals.x_estado.padEnd(11)} jornadas:[${d.jornadas.join(",") || "sin fecha"}]${d.vals.x_fecha_programada ? ` prog:${d.vals.x_fecha_programada}` : ""}`);

console.log(`\n${L}\nOTs A ACTUALIZAR — ${plan.actualizarOT.length}\n${L}`);
for (const d of plan.actualizarOT)
  console.log(`  OT#${String(d.existente.id).padEnd(5)} ${d.g.orden} ${d.g.tipo.padEnd(8)} ${d.existente.x_estado} → ${(d.vals.x_estado || d.existente.x_estado + " (sin cambio)").padEnd(11)} jornadas:[${d.jornadas.join(",")}]`);

console.log(`\n${L}\nPARTES A CREAR — ${plan.crearParte.length}\n${L}`);
for (const p of plan.crearParte)
  console.log(`  ${p.fecha} ${p.destino.g.orden} ${p.destino.g.tipo.padEnd(8)} ${String(p.personas).padStart(2)} pers × ${String(p.horas || "?").padStart(3)}h = ${String((p.personas * (p.horas || 0)) || "?").padStart(4)} hh  ${(p.fila.puntero || "sin cuadrilla").padEnd(14)}${p.cuadrilla ? "" : " ✗"}${p.flete ? `  ${p.flete} flete${p.flete > 1 ? "s" : ""}` : ""}`);

if (plan.saltados.length) { console.log(`\n${L}\nYA EXISTÍAN (se saltan) — ${plan.saltados.length}\n${L}`); for (const s of plan.saltados) console.log("  " + s); }
if (plan.problemas.length) { console.log(`\n${L}\n⚠️  A REVISAR — ${plan.problemas.length}\n${L}`); for (const s of plan.problemas) console.log("  " + s); }

if (!ESCRIBIR) { console.log(`\n${L}\nDry-run: no se escribió nada. Para aplicar: --escribir`); process.exit(0); }

// ── Escritura ───────────────────────────────────────────────────────────────
console.log(`\n${L}\nESCRIBIENDO\n${L}`);
let nOT = 0, nUpd = 0, nParte = 0, nFlete = 0;
for (const d of plan.crearOT) { d.otId = await create("x_aba_orden_trabajo", d.vals); nOT++; console.log(`  + OT#${d.otId} ${d.g.orden} ${d.g.tipo}`); }
for (const d of plan.actualizarOT) { d.otId = d.existente.id; await write("x_aba_orden_trabajo", [d.otId], d.vals); nUpd++; console.log(`  ~ OT#${d.otId} ${d.g.orden} ${d.g.tipo}`); }
for (const p of plan.crearParte) {
  const parteId = await create("x_aba_parte_diario", {
    x_orden_trabajo_id: p.destino.otId, x_fecha: p.fecha, x_estado: "ejecutado",
    x_carga_consolidada: true, x_cuadrilla_id: p.cuadrilla || false,
    x_objetivo: limpio(p.fila.detalle), x_tareas: limpio(p.fila.reporte),
    x_bloqueos: limpio(p.fila.opInc), x_p_tecnico: limpio(p.fila.tecnico),
    x_p_tipo: p.destino.g.tipo, x_p_urgencia: URGENCIA[p.fila.urgencia] || "baja",
  });
  if (p.horas && p.personas)
    await create("x_aba_mano_obra", {
      x_parte_diario_id: parteId, x_fecha: p.fecha,
      x_tarea: p.destino.g.tipo === "desarme" ? "desarme" : "armado",
      x_personas: p.personas, x_hora_desde: 8, x_hora_hasta: finDeJornada(p.horas),
    });
  if (p.flete) { await create("x_aba_flete", { x_parte_diario_id: parteId, x_fecha: p.fecha, x_cantidad: p.flete }); nFlete++; }
  nParte++; console.log(`  + parte#${parteId} ${p.fecha} ${p.destino.g.orden}${p.flete ? ` (+${p.flete} flete)` : ""}`);
}
console.log(`\n✅ ${nOT} OTs creadas · ${nUpd} actualizadas · ${nParte} partes · ${nFlete} fletes`);
