// Robot de TAD — mantiene pvp_expedientes al día con lo que dice Trámites a Distancia.
//
// QUÉ HACE EN CADA VUELTA
//   1. Lee "Mis trámites": En curso, Tareas pendientes y Finalizados (sólo la LISTA).
//   2. Guarda cada expediente; si cambió el estado lo registra en pvp_eventos y avisa.
//   3. Si apareció una tarea de subsanación, la abre y copia el motivo (paso 1 de 3).
//      No adjunta ni confirma nada.
//   4. Si un expediente pasó a Tramitación o se archivó, busca la "NOTIFICACION PERMISO",
//      baja el PDF y lo sube al bucket privado.
//   5. Vincula cada expediente con su venta de Odoo (por número o por dirección) y, si el
//      vínculo es seguro, escribe el estado del permiso en la venta (sincronizarOdoo).
//
// LO QUE NO HACE, A PROPÓSITO
//   - No abre el detalle del expediente: TAD le agrega una "Constancia de Consulta" cada
//     vez (verificado 2026-09-14). Todo sale de la lista, de la tarea y de Notificaciones.
//   - No presenta, no subsana, no confirma en TAD. Esta es la fase 1: mirar.
//
// TAMBIÉN ATIENDE la encomienda del CPAU (tarea `cpau_encomienda`, robot/cpau-encomienda.mjs):
// completa el asistente, frena en Confirmar y finaliza sólo con la aprobación de la ficha.
//
// CUÁNDO
//   Cada 30 min de lunes a viernes de 8 a 20 (hora de Buenos Aires), cada 2 h fuera de ese
//   horario, y cuando alguien toca "Revisar ahora" (tarea en pvp_tareas, se mira cada 20 s).
//   La sesión de TAD queda abierta entre vueltas: loguear cada media hora es la forma más
//   rápida de que el firewall del GCBA empiece a mirar la cuenta.
//
// PRIMERA VUELTA = CARGA INICIAL: registra todo sin mandar avisos. Si no, el primer
// arranque dispararía 16 "novedades" que no son novedad.
//
// Correr (desde la raíz del repo):
//   node --env-file=.env.local --env-file=robot/.env.robot robot/worker-tad.mjs
//   node --env-file=.env.local --env-file=robot/.env.robot robot/worker-tad.mjs --una-vez
import os from "node:os";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { abrir, entrar, ir, fotografo } from "./tad-comun.mjs";
import { parsearCaratula, sinAltura, textoDePdf } from "./caratula.mjs";
import { parsearPermiso } from "./permiso.mjs";
import { atenderEncomienda } from "./cpau-encomienda.mjs";
import { read, searchRead, write } from "../scripts/odoo-rpc.mjs";

const UNA_VEZ = process.argv.includes("--una-vez");
const MIN = 60_000;
const BUCKET = "permisos-via-publica";

for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MIBA_USUARIO", "MIBA_CLAVE"]) {
  if (!process.env[v]) throw new Error(`Falta la variable ${v}`);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const foto = fotografo("robot");
// h23: sin él Node escribe "09:10" a las 21:10, y el log no dice si fue de mañana o de noche.
const log = (...a) => console.log(new Date().toLocaleString("es-AR", { hourCycle: "h23" }), ...a);

// ── Utilidades ──────────────────────────────────────────────────────────────

const sinTildes = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** "EX-2026-41408211- -GCABA-SSGOU" → { expediente, numero: "2026-41408211", organismo: "SSGOU" } */
function parsearExpediente(texto) {
  const m = texto.match(/EX-(\d{4})-(\d+)-\s*-GCABA-([A-Z]+)/);
  if (!m) return null;
  return { expediente: `EX-${m[1]}-${m[2]}- -GCABA-${m[3]}`, numero: `${m[1]}-${m[2]}`, digitos: m[2], organismo: m[3] };
}

const ESTADOS = ["GUARDA TEMPORAL", "INICIACION", "SUBSANACION", "TRAMITACION"];

/** De la fila de la tabla (texto plano) saca expediente, titular, estado y fecha de creación. */
function parsearFila(texto) {
  const ex = parsearExpediente(texto);
  if (!ex) return null;
  const plano = sinTildes(texto.replace(/\s+/g, " "));
  const estado = ESTADOS.find((e) => plano.includes(e)) ?? (plano.match(/\b([A-Z][A-Z ]{5,30})\s+\d{2}\/\d{2}\/\d{4}/)?.[1]?.trim() ?? "DESCONOCIDO");
  const fecha = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  // Titular: entre el expediente y el estado, sin las etiquetas de la vista angosta.
  const tras = texto.replace(/\s+/g, " ").split(/-GCABA-[A-Z]+/).slice(1).join(" ");
  const titular = tras
    .replace(/Titular|Estado|Creación|Acciones|visibility|build|content_copy|null/gi, " ")
    .split(/\s+(INICIACI|SUBSANACI|TRAMITACI|GUARDA TEMPORAL)/i)[0]
    .replace(/\s+/g, " ")
    .trim() || null;
  return {
    ...ex,
    estado,
    titular,
    creado: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
  };
}

function horarioHabil(d = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "numeric", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const hora = Number(partes.hour);
  return !["Sat", "Sun"].includes(partes.weekday) && hora >= 8 && hora < 20;
}

const proximoIntervalo = () => (horarioHabil() ? 30 : 120) * MIN;

async function evento(expedienteId, tipo, detalle, datos = {}, actor = "robot") {
  const { error } = await db.from("pvp_eventos").insert({ expediente_id: expedienteId, tipo, detalle, datos, actor });
  if (error) log("!! no se pudo registrar el evento", tipo, error.message);
}

// ── Avisos (campanita + Slack) ───────────────────────────────────────────────
// Réplica mínima de src/lib/alertas: el robot corre fuera de Next y no puede importar TS.
// La idempotencia es la misma — índice único de alertas.clave — y a Slack sólo va lo que
// la base insertó de verdad.

function urlApp(enlace) {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base && enlace ? `${base.replace(/\/$/, "")}${enlace}` : null;
}

async function avisar(alertas) {
  if (alertas.length === 0) return;
  const filas = alertas.map((a) => ({
    tipo: a.tipo, clave: a.clave, titulo: a.titulo, descripcion: a.descripcion ?? null,
    prioridad: a.prioridad ?? "media", enlace: a.enlace ?? null, destinatario_rol: "operativo",
  }));
  const { data, error } = await db.from("alertas").upsert(filas, { onConflict: "clave", ignoreDuplicates: true }).select("clave");
  if (error) return log("!! no se pudieron crear avisos", error.message);
  const nuevas = new Set((data ?? []).map((f) => f.clave));
  const webhook = process.env.SLACK_WEBHOOK_SYH;
  if (!webhook) return;
  for (const a of alertas.filter((x) => nuevas.has(x.clave))) {
    const url = urlApp(a.enlace);
    const titulo = url ? `<${url}|${a.titulo}>` : a.titulo;
    const emoji = a.tipo === "permiso_robot" ? "🤖" : "🏛️";
    const cuerpo = {
      text: `${emoji} ${a.titulo}`,
      attachments: [{
        color: a.tipo === "permiso_robot" ? "#d97706" : a.prioridad === "alta" ? "#dc2626" : "#2563eb",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `${emoji} *${titulo}*${a.descripcion ? `\n${a.descripcion.slice(0, 280)}` : ""}` } }],
      }],
    };
    await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(5000) })
      .catch((e) => log("!! Slack", e.message));
  }
}

const nombreObra = (e) => e.direccion ?? e.odoo_venta_nombre ?? e.titular ?? `EX-${e.numero}`;

// ── Lectura de TAD ───────────────────────────────────────────────────────────

async function sesionViva(page) {
  // El aviso de sesión por vencer tapa la pantalla: se extiende si aparece.
  const extender = page.locator("button:visible", { hasText: /Extender sesi[oó]n|Continuar sesi[oó]n/i }).first();
  if (await extender.count()) await extender.click().catch(() => {});
  return /tad\.buenosaires\.gob\.ar/.test(page.url()) && (await page.getByText(/Representando a:/i).count()) > 0;
}

async function tablaVisible(page) {
  // "Todos" es una <option> del selector de tamaño de página de ESTA solapa.
  const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Todos" }) }).first();
  if (await sel.count()) {
    await sel.selectOption({ label: "Todos" }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  const filas = page.locator("tr:visible").filter({ hasText: /EX-\d{4}-/ });
  return (await filas.allInnerTexts()).map(parsearFila).filter(Boolean);
}

async function solapa(page, nombre) {
  await page.getByText(nombre, { exact: true }).first().click();
  await page.waitForTimeout(6000);
  return tablaVisible(page);
}

async function leerListas(page) {
  await ir(page, "Mis trámites");
  const enCurso = await tablaVisible(page);
  const tareas = await solapa(page, "Tareas pendientes");
  const finalizados = await solapa(page, "Finalizados");
  // Una lista de En curso vacía con sesión viva es sospechosa (la tabla no terminó de
  // cargar): mejor abortar la vuelta que marcar todo como desaparecido.
  if (enCurso.length === 0 && finalizados.length === 0) throw new Error("TAD devolvió las listas vacías");
  return { enCurso, tareas, finalizados };
}

async function leerMotivo(page, numero) {
  await ir(page, "Mis trámites");
  await page.getByText("Tareas pendientes", { exact: true }).first().click();
  await page.waitForTimeout(6000);
  const digitos = numero.split("-")[1];
  const fila = page.locator("tr:visible").filter({ hasText: digitos }).first();
  if (!(await fila.count())) return null;
  await fila.getByText("build").click();
  await page.waitForTimeout(9000);
  const texto = await page.evaluate(() => document.body.innerText);
  const m = texto.match(/Paso 1 de 3\s*([\s\S]*?)\s*Editar datos/);
  await ir(page, "Mis trámites"); // sale sin tocar nada
  return m ? m[1].trim() : null;
}

async function bajarPermiso(page, numero) {
  await ir(page, "Notificaciones");
  const digitos = numero.split("-")[1];
  const buscador = page.getByPlaceholder(/B[uú]squeda de tr[aá]mite/i).first();
  if (await buscador.count()) {
    await buscador.fill(digitos);
    await buscador.press("Enter");
    await page.waitForTimeout(6000);
  }
  const fila = page.locator("tr:visible").filter({ hasText: digitos }).filter({ hasText: /PERMISO/i }).first();
  if (!(await fila.count())) return null;
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    fila.getByText("file_download").click(),
  ]);
  const archivo = descarga.suggestedFilename();
  const buffer = readFileSync(await descarga.path());
  const path = `${numero}/${archivo}`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`No se pudo subir el permiso: ${error.message}`);
  const fechas = await parsearPermiso(buffer).catch(() => ({}));
  return { path, notificacion: archivo.replace(/\.pdf$/i, ""), fechas };
}

/** Fechas de un permiso que ya está en el bucket (los bajados antes de leerlas). No entra a TAD. */
async function fechasDelBucket(exp) {
  const { data, error } = await db.storage.from(BUCKET).download(exp.permiso_path);
  if (error) throw new Error(`No se pudo leer el permiso guardado: ${error.message}`);
  const f = await parsearPermiso(Buffer.from(await data.arrayBuffer()));
  const cambios = { permiso_emitido_el: f.emitido_el, permiso_vence: f.vence };
  await db.from("pvp_expedientes").update(cambios).eq("id", exp.id);
  Object.assign(exp, cambios);
}

/**
 * Abre el detalle UNA VEZ, baja la Carátula y guarda los datos de la obra.
 *
 * Abrir el detalle deja una "Constancia de Consulta" en el expediente. Por eso, una vez que
 * se entró, `caratula_leida_at` se marca pase lo que pase: si la carátula no está o no se
 * puede leer, queda `caratula_error` para mirarlo a mano, pero el robot no vuelve a entrar
 * en cada vuelta sumando constancias.
 */
async function leerCaratula(page, exp) {
  await ir(page, "Mis trámites");
  if (exp.solapa === "finalizado") {
    await page.getByText("Finalizados", { exact: true }).first().click();
    await page.waitForTimeout(6000);
  }
  const sel = page.locator("select:visible").filter({ has: page.locator("option", { hasText: "Todos" }) }).first();
  if (await sel.count()) {
    await sel.selectOption({ label: "Todos" }, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  const digitos = exp.numero.split("-")[1];
  const fila = page.locator("tr:visible").filter({ hasText: digitos }).first();
  if (!(await fila.count())) return { error: null, noEncontrado: true }; // no se entró: se reintenta otra vuelta

  const marcar = (cambios) =>
    db.from("pvp_expedientes").update({ caratula_leida_at: new Date().toISOString(), ...cambios }).eq("id", exp.id);

  try {
    await fila.getByText("visibility").click();
    await page.waitForTimeout(7000);

    // "Tus documentos" viene paginado de a 5, del más nuevo al más viejo: la carátula
    // queda cerca del final. Se busca la IF (la de datos), no la PV (el pase).
    let caratula = null;
    for (let pag = 1; pag <= 8 && !caratula; pag++) {
      const candidata = page.locator("tr:visible").filter({ hasText: /^\s*IF-\d{4}-\d+-GCABA/ }).filter({ hasText: /Car[aá]tula/ }).first();
      if (await candidata.count()) { caratula = candidata; break; }
      const sig = page.getByText(/^Siguiente$/).first();
      if (!(await sig.count())) break;
      await sig.click().catch(() => {});
      await page.waitForTimeout(3000);
    }
    if (!caratula) {
      await marcar({ caratula_error: "No se encontró la Carátula entre los documentos" });
      return { error: "sin carátula" };
    }

    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      caratula.getByText("file_download").click(),
    ]);
    const buffer = readFileSync(await descarga.path());
    const path = `${exp.numero}/caratula-${descarga.suggestedFilename()}`;
    await db.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });

    const datos = parsearCaratula(await textoDePdf(buffer));
    if (!datos?.direccion) {
      await marcar({ caratula_path: path, caratula_error: "La carátula no tiene el formato esperado" });
      return { error: "formato" };
    }
    await marcar({ caratula_path: path, caratula_error: null, ...datos });
    await evento(exp.id, "caratula_leida", `${datos.direccion}${datos.barrio ? `, ${datos.barrio}` : ""} · pedido hasta ${datos.pedido_hasta ?? "?"}`, { ...datos, path });
    return { datos };
  } catch (e) {
    await marcar({ caratula_error: e.message.slice(0, 300) });
    return { error: e.message };
  } finally {
    await ir(page, "Mis trámites").catch(() => {});
  }
}

// ── Odoo ────────────────────────────────────────────────────────────────────

const VENTA_CAMPOS = ["name", "x_direccion_obra", "partner_id", "date_order"];

const deVenta = (v, por) => ({
  odoo_venta_id: v.id,
  odoo_venta_nombre: v.name,
  cliente: Array.isArray(v.partner_id) ? v.partner_id[1] : null,
  odoo_vinculo_por: por,
});

/**
 * Busca la venta del expediente. Primero por número (x_expediente_nro), que es exacto. Si
 * no está —el caso normal hoy: nadie lo cargó—, por la dirección que dio la carátula:
 * calle y altura en x_direccion_obra, quedándose con la venta más reciente anterior a la
 * presentación. La misma dirección puede tener varias ventas (renovaciones, otra obra años
 * después); la anterior más cercana a la fecha del expediente es la que lo originó.
 *
 * Un vínculo por dirección es una PROPUESTA: sincronizarOdoo no lo usa hasta que una persona
 * lo confirma en la ficha. Las ventas que alguien descartó no se vuelven a proponer.
 */
async function vincularOdoo(exp) {
  if (exp.odoo_venta_id || !process.env.ODOO_URL) return null;
  const descartadas = exp.odoo_ventas_descartadas ?? [];
  const noDescartada = descartadas.length ? [["id", "not in", descartadas]] : [];
  const digitos = exp.numero.split("-")[1];
  const porNumero = await searchRead("sale.order", [["x_expediente_nro", "ilike", digitos], ...noDescartada], VENTA_CAMPOS, { limit: 2 });
  if (porNumero.length === 1) return deVenta(porNumero[0], "numero");

  // Sin altura no hay cómo elegir entre las ventas de toda una calle: se vincula a mano.
  if (sinAltura(exp.direccion)) return null;
  const m = exp.direccion?.match(/^(.*?)\s+(\d{1,5})\b/);
  if (!m) return null;
  const palabra = m[1].split(/\s+/).filter((p) => !/^(av|avda|avenida|del?|la|los|las|gral|dr)\.?$/i.test(p)).sort((a, b) => b.length - a.length)[0];
  if (!palabra) return null;
  const hasta = exp.creado_tad ? `${exp.creado_tad} 23:59:59` : new Date().toISOString().slice(0, 19).replace("T", " ");
  const candidatas = await searchRead(
    "sale.order",
    [["x_direccion_obra", "ilike", palabra], ["x_direccion_obra", "ilike", m[2]], ["state", "in", ["sale", "done"]], ["date_order", "<=", hasta], ...noDescartada],
    VENTA_CAMPOS,
    { limit: 10, order: "date_order desc" },
  );
  // ilike "712" también trae "Corrientes 5712": la altura tiene que estar como número entero.
  const altura = new RegExp(`(^|\\D)${m[2]}(\\D|$)`);
  const venta = candidatas.find((v) => altura.test(v.x_direccion_obra || ""));
  return venta ? deVenta(venta, "direccion") : null;
}

// ── Escritura en Odoo ───────────────────────────────────────────────────────
//
// Los campos de sale.order que deciden el candado del tablero y Habilitaciones (ver
// src/lib/habilitaciones/derivacion.ts). Hasta ahora se cargaban a mano.

const ORDEN_TRAMITE = { no_presentado: 0, presentado: 1, emitido: 2 };
const CAMPO = { x_tramite_estado: "trámite", x_expediente_nro: "expediente", x_expediente_fecha: "presentado el", x_permiso_fecha: "permiso emitido el" };
const describir = (cambios) => Object.entries(cambios).map(([k, v]) => `${CAMPO[k]} ${v}`).join(" · ");

const vinculoSeguro = (exp) => !!exp.odoo_venta_id && (exp.odoo_vinculo_por === "numero" || !!exp.odoo_vinculo_confirmado_at);

/**
 * Lo que la venta tiene que decir según TAD. null = TAD no dice nada que se pueda escribir
 * (archivado sin permiso, estado nuevo que no conocemos): la venta no se toca.
 *
 * TRAMITACIÓN es "salió el permiso" en este trámite. Archivado con el PDF del permiso
 * guardado, también. Iniciación y Subsanación son "presentado": Subsanación no vuelve el
 * trámite atrás, el expediente sigue existiendo y la obra se puede amparar en él.
 */
function deseadoEnOdoo(exp) {
  const emitido = exp.estado_tad === "TRAMITACION" || (exp.solapa === "finalizado" && !!exp.permiso_path);
  const presentado = exp.solapa === "en_curso" && ["INICIACION", "SUBSANACION"].includes(exp.estado_tad);
  if (!emitido && !presentado) return null;
  const v = { x_tramite_estado: emitido ? "emitido" : "presentado", x_expediente_nro: exp.expediente };
  if (exp.creado_tad) v.x_expediente_fecha = exp.creado_tad;
  if (emitido && exp.permiso_emitido_el) v.x_permiso_fecha = exp.permiso_emitido_el;
  return v;
}

/**
 * Escribe en cada venta con vínculo seguro lo que dice TAD. Sólo los campos que cambian:
 * cada write a la venta dispara la cascada de calculados (~1 s), y una vuelta sin
 * novedades no tiene por qué costar 16 segundos.
 *
 * NO PISA, y lo deja anotado en odoo_error para verlo en la ficha:
 *   - un número de expediente cargado a mano que no es ninguno de los nuestros de esa venta
 *     (puede ser un expediente de otra cuenta, o de papel);
 *   - un estado más avanzado: si Odoo dice "emitido" y TAD "presentado", lo probable es una
 *     renovación de una obra con permiso vigente, y retroceder le cerraría el candado.
 */
async function sincronizarOdoo(lista) {
  if (!process.env.ODOO_URL) return 0;
  const expedientes = lista ?? (await db.from("pvp_expedientes").select("*")).data ?? [];

  const porVenta = new Map();
  for (const exp of expedientes.filter(vinculoSeguro)) {
    const d = deseadoEnOdoo(exp);
    if (d) porVenta.set(exp.odoo_venta_id, [...(porVenta.get(exp.odoo_venta_id) ?? []), { exp, d }]);
  }
  if (porVenta.size === 0) return 0;

  const ventas = await read("sale.order", [...porVenta.keys()], ["name", ...Object.keys(CAMPO)]);
  const actual = new Map(ventas.map((v) => [v.id, v]));

  const anotar = async (exp, mensaje) => {
    if (exp.odoo_error === mensaje) return;
    await db.from("pvp_expedientes").update({ odoo_error: mensaje }).eq("id", exp.id);
    await evento(exp.id, "odoo_conflicto", mensaje);
    exp.odoo_error = mensaje;
  };

  let escritas = 0;
  for (const [ventaId, candidatos] of porVenta) {
    const venta = actual.get(ventaId);
    // Dos expedientes de la misma venta (se presentó dos veces, o una renovación): manda el
    // más avanzado y, a igualdad, el más nuevo. El número desempata el mismo día (Av. Córdoba
    // 2914 tiene dos del 01/09): sin eso el elegido dependería del orden de la consulta.
    candidatos.sort((a, b) =>
      ORDEN_TRAMITE[b.d.x_tramite_estado] - ORDEN_TRAMITE[a.d.x_tramite_estado] ||
      String(b.exp.creado_tad).localeCompare(String(a.exp.creado_tad)) ||
      b.exp.numero.localeCompare(a.exp.numero));
    const [{ exp, d }, ...otros] = candidatos;
    for (const o of otros) {
      await anotar(o.exp, `La venta ${venta?.name ?? ventaId} ya la lleva EX-${exp.numero} (más avanzado o más nuevo): este no se escribe.`);
    }
    if (!venta) { await anotar(exp, `La venta ${ventaId} ya no existe en Odoo.`); continue; }

    const cargado = venta.x_expediente_nro || "";
    if (cargado && !candidatos.some((c) => cargado.includes(c.exp.numero.split("-")[1]))) {
      await anotar(exp, `La venta ya tiene cargado otro expediente (${cargado}). No se tocó: revisar a mano.`);
      continue;
    }
    if ((ORDEN_TRAMITE[venta.x_tramite_estado] ?? -1) > ORDEN_TRAMITE[d.x_tramite_estado]) {
      await anotar(exp, `Odoo ya dice "${venta.x_tramite_estado}" y TAD "${d.x_tramite_estado}": no se retrocede.`);
      continue;
    }

    const cambios = Object.fromEntries(Object.entries(d).filter(([k, v]) => (venta[k] || null) !== v));
    if (Object.keys(cambios).length > 0) {
      await write("sale.order", [ventaId], cambios);
      escritas++;
      const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, venta[k] || null]));
      await evento(exp.id, "odoo_escrito", `${venta.name}: ${describir(cambios)}`, { odoo_venta_id: ventaId, antes, despues: cambios });
      log(`Odoo ${venta.name} ← EX-${exp.numero}: ${describir(cambios)}`);
    }
    if (Object.keys(cambios).length > 0 || exp.odoo_error || !exp.odoo_escrito) {
      await db.from("pvp_expedientes").update({ odoo_escrito: d, odoo_escrito_at: new Date().toISOString(), odoo_error: null }).eq("id", exp.id);
      Object.assign(exp, { odoo_escrito: d, odoo_error: null });
    }
  }
  return escritas;
}

// ── Una vuelta ──────────────────────────────────────────────────────────────

async function revisar(page) {
  const inicio = Date.now();
  const { data: robotRow } = await db.from("pvp_robot").select("ultimo_ok_at").eq("id", "tad").maybeSingle();
  const cargaInicial = !robotRow?.ultimo_ok_at;

  if (!(await sesionViva(page))) {
    log("Entrando a TAD…");
    await entrar(page);
  }
  const { enCurso, tareas, finalizados } = await leerListas(page);
  const conTarea = new Set(tareas.map((t) => t.numero));
  const leidos = [
    ...enCurso.map((f) => ({ ...f, solapa: "en_curso" })),
    ...finalizados.map((f) => ({ ...f, solapa: "finalizado" })),
  ];
  log(`Leídos: ${enCurso.length} en curso, ${tareas.length} tareas, ${finalizados.length} finalizados${cargaInicial ? " (carga inicial, sin avisos)" : ""}`);

  const { data: previos } = await db.from("pvp_expedientes").select("*");
  const porNumero = new Map((previos ?? []).map((e) => [e.numero, e]));
  const avisos = [];
  const ahora = new Date().toISOString();

  for (const f of leidos) {
    const prev = porNumero.get(f.numero);
    const tarea = conTarea.has(f.numero);
    const estado = sinTildes(f.estado);

    if (!prev) {
      const { data: nuevo, error } = await db.from("pvp_expedientes").insert({
        expediente: f.expediente, numero: f.numero, organismo: f.organismo, nombre: "Solicitud de permiso para la instalación de andamios en el espacio publico",
        titular: f.titular, estado_tad: estado, solapa: f.solapa, creado_tad: f.creado, tarea_pendiente: tarea,
      }).select("*").single();
      if (error) { log("!! alta", f.numero, error.message); continue; }
      porNumero.set(f.numero, nuevo);
      await evento(nuevo.id, "alta", `Apareció en TAD en estado ${estado}${cargaInicial ? " (carga inicial)" : ""}.`, { estado, solapa: f.solapa });
      if (!cargaInicial) {
        avisos.push({ tipo: "permiso_novedad", clave: `permiso_novedad:${f.numero}:alta`, titulo: `Expediente nuevo en TAD — EX-${f.numero}`, descripcion: `Estado: ${estado}`, enlace: `/permisos-via-publica/${nuevo.id}` });
      }
      continue;
    }

    const cambios = { visto_ultimo_at: ahora, updated_at: ahora };
    if (prev.estado_tad !== estado || prev.solapa !== f.solapa) {
      Object.assign(cambios, { estado_tad: estado, solapa: f.solapa, estado_desde: ahora });
      await evento(prev.id, "cambio_estado", `${prev.estado_tad} → ${estado}${f.solapa !== prev.solapa ? ` (${f.solapa === "finalizado" ? "archivado" : "en curso"})` : ""}`, { de: prev.estado_tad, a: estado }, "gcba");
      avisos.push({
        tipo: "permiso_novedad",
        clave: `permiso_novedad:${f.numero}:${estado}:${ahora.slice(0, 10)}`,
        titulo: `${estado === "TRAMITACION" ? "Salió el permiso" : estado === "SUBSANACION" ? "Observado por el Gobierno" : `Pasó a ${estado}`} — ${nombreObra(prev)}`,
        descripcion: `EX-${f.numero}: ${prev.estado_tad} → ${estado}`,
        prioridad: estado === "SUBSANACION" ? "alta" : "media",
        enlace: `/permisos-via-publica/${prev.id}`,
      });
    }
    if (prev.tarea_pendiente !== tarea) {
      cambios.tarea_pendiente = tarea;
      await evento(prev.id, tarea ? "tarea_subsanacion" : "tarea_resuelta", tarea ? "Apareció una tarea de subsanación en TAD." : "La tarea de subsanación ya no está pendiente.", {}, tarea ? "gcba" : "persona");
      if (!tarea) cambios.motivo_subsanacion = null;
    }
    if (!prev.titular && f.titular) cambios.titular = f.titular;
    const { error } = await db.from("pvp_expedientes").update(cambios).eq("id", prev.id);
    if (error) log("!! update", f.numero, error.message);
    porNumero.set(f.numero, { ...prev, ...cambios });
  }

  // Motivos de subsanación: una tarea sin motivo, o con un motivo leído antes del cambio.
  for (const t of tareas) {
    const exp = porNumero.get(t.numero);
    if (!exp) continue;
    const desactualizado = !exp.motivo_leido_at || exp.motivo_leido_at < exp.estado_desde;
    if (!desactualizado && exp.motivo_subsanacion) continue;
    try {
      const motivo = await leerMotivo(page, t.numero);
      if (!motivo) continue;
      await db.from("pvp_expedientes").update({ motivo_subsanacion: motivo, motivo_leido_at: new Date().toISOString() }).eq("id", exp.id);
      await evento(exp.id, "motivo", motivo, {}, "gcba");
      if (!cargaInicial) {
        avisos.push({ tipo: "permiso_novedad", clave: `permiso_novedad:${t.numero}:motivo:${motivo.length}:${motivo.slice(0, 40)}`, titulo: `Hay que subsanar — ${nombreObra(exp)}`, descripcion: motivo, prioridad: "alta", enlace: `/permisos-via-publica/${exp.id}` });
      }
      log(`Motivo EX-${t.numero}: ${motivo.slice(0, 80)}`);
    } catch (e) {
      log("!! motivo", t.numero, e.message);
    }
  }

  // Permisos emitidos sin PDF guardado.
  for (const exp of porNumero.values()) {
    if (exp.permiso_path) {
      if (!exp.permiso_emitido_el) await fechasDelBucket(exp).catch((e) => log("!! fechas del permiso", exp.numero, e.message));
      continue;
    }
    const emitido = exp.estado_tad === "TRAMITACION" || exp.solapa === "finalizado";
    if (!emitido) continue;
    try {
      const permiso = await bajarPermiso(page, exp.numero);
      if (!permiso) continue;
      const cambios = { permiso_path: permiso.path, permiso_notificacion: permiso.notificacion, permiso_emitido_el: permiso.fechas.emitido_el ?? null, permiso_vence: permiso.fechas.vence ?? null };
      await db.from("pvp_expedientes").update(cambios).eq("id", exp.id);
      Object.assign(exp, cambios);
      await evento(exp.id, "permiso_descargado", `Se guardó ${permiso.notificacion}.`, { path: permiso.path });
      if (!cargaInicial) {
        avisos.push({ tipo: "permiso_novedad", clave: `permiso_novedad:${exp.numero}:permiso`, titulo: `Permiso disponible — ${nombreObra(exp)}`, descripcion: `EX-${exp.numero}. Ya se puede descargar desde la app.`, enlace: `/permisos-via-publica/${exp.id}` });
      }
      log(`Permiso EX-${exp.numero} → ${permiso.path}`);
    } catch (e) {
      log("!! permiso", exp.numero, e.message);
    }
  }

  // Carátula: una sola vez por expediente (ver leerCaratula).
  for (const exp of porNumero.values()) {
    if (exp.caratula_leida_at) continue;
    const r = await leerCaratula(page, exp);
    if (r.datos) {
      Object.assign(exp, r.datos);
      log(`Carátula EX-${exp.numero}: ${r.datos.direccion}`);
    } else if (r.error) {
      log(`!! carátula EX-${exp.numero}: ${r.error}`);
    }
  }

  // Vínculo con Odoo.
  for (const exp of porNumero.values()) {
    try {
      const v = await vincularOdoo(exp);
      if (!v) continue;
      await db.from("pvp_expedientes").update(v).eq("id", exp.id);
      Object.assign(exp, v);
      const porDireccion = v.odoo_vinculo_por === "direccion";
      await evento(exp.id, "vinculado_odoo", `${v.odoo_venta_nombre}${v.cliente ? ` · ${v.cliente}` : ""} (por ${porDireccion ? "dirección: falta que una persona lo confirme" : "número de expediente"})`, v);
      if (porDireccion && !cargaInicial) {
        avisos.push({ tipo: "permiso_novedad", clave: `permiso_novedad:${exp.numero}:vinculo`, titulo: `Confirmar la venta — ${nombreObra(exp)}`, descripcion: `EX-${exp.numero} parece ser ${v.odoo_venta_nombre}. Hasta confirmarlo no se escribe nada en Odoo.`, enlace: `/permisos-via-publica/${exp.id}` });
      }
    } catch (e) {
      log("!! odoo", exp.numero, e.message);
      break; // Odoo caído: no tiene sentido probar 16 veces.
    }
  }

  // Estado del permiso en la venta, sólo con vínculo seguro. Un Odoo caído no invalida lo
  // que se leyó de TAD: se reintenta en la vuelta siguiente.
  await sincronizarOdoo([...porNumero.values()]).catch((e) => log("!! escritura en Odoo", e.message));

  await avisar(avisos);
  const fin = new Date();
  await db.from("pvp_robot").upsert({
    id: "tad", ultima_revision_at: fin.toISOString(), ultimo_ok_at: fin.toISOString(),
    proxima_revision_at: new Date(fin.getTime() + proximoIntervalo()).toISOString(),
    equipo: os.hostname(), updated_at: fin.toISOString(),
  });
  log(`Vuelta OK en ${Math.round((Date.now() - inicio) / 1000)} s · ${avisos.length} avisos`);
  return { leidos: leidos.length, tareas: tareas.length, avisos: avisos.length };
}

async function registrarError(page, e) {
  const ahora = new Date();
  log("!! Vuelta con error:", e.message);
  await foto(page, "error", 200).catch(() => {});
  await db.from("pvp_robot").upsert({
    id: "tad", ultima_revision_at: ahora.toISOString(), ultimo_error: e.message.slice(0, 500),
    ultimo_error_at: ahora.toISOString(), proxima_revision_at: new Date(ahora.getTime() + 10 * MIN).toISOString(),
    equipo: os.hostname(), updated_at: ahora.toISOString(),
  });
  // Un aviso por día, no uno por vuelta.
  await avisar([{ tipo: "permiso_robot", clave: `permiso_robot:${ahora.toISOString().slice(0, 10)}`, titulo: "El robot de TAD no pudo revisar", descripcion: e.message.slice(0, 280), prioridad: "alta", enlace: "/permisos-via-publica" }]);
}

// ── Bucle ───────────────────────────────────────────────────────────────────

let { browser, page } = await abrir();
let proxima = 0;
let apagando = false;
// SIGTERM es cómo lo para launchd (robot/instalar-launchd.sh); SIGINT, Ctrl+C a mano.
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, async () => { apagando = true; log(`Cerrando (${senal})…`); await browser.close().catch(() => {}); process.exit(0); });
}

async function tomarTarea() {
  const { data } = await db.from("pvp_tareas").select("id").eq("estado", "pendiente").order("created_at").limit(1);
  if (!data?.length) return null;
  const { data: tomada } = await db.from("pvp_tareas").update({ estado: "tomada", tomada_at: new Date().toISOString() })
    .eq("id", data[0].id).eq("estado", "pendiente").select("id, tipo, payload, tramite_id").maybeSingle();
  return tomada ?? null;
}

log(`Robot de TAD en ${os.hostname()}${UNA_VEZ ? " (una vuelta)" : ""}`);
while (!apagando) {
  const tarea = await tomarTarea();
  const tareaId = tarea?.id ?? null;
  if (tarea?.tipo === "cpau_encomienda") {
    // Encomienda del CPAU: navegador propio, no toca la sesión de TAD. Nunca se reintenta
    // sola (una segunda pasada con Finalizar duplicaría la encomienda): el resultado queda en
    // la tarea y la ficha decide.
    await atenderEncomienda({ db, tarea, log, avisar }).catch(async (e) => {
      log("!! encomienda del CPAU", e.message);
      await db.from("pvp_tareas").update({ estado: "error", error: e.message.slice(0, 500), terminada_at: new Date().toISOString() }).eq("id", tareaId);
    });
  } else if (tarea?.tipo === "odoo_sincronizar") {
    // Alguien confirmó un vínculo en la ficha: escribir en Odoo no necesita entrar a TAD.
    const fin = (cambios) => db.from("pvp_tareas").update({ ...cambios, terminada_at: new Date().toISOString() }).eq("id", tareaId);
    try {
      await fin({ estado: "ok", resultado: { escritas: await sincronizarOdoo() } });
    } catch (e) {
      log("!! escritura en Odoo", e.message);
      await fin({ estado: "error", error: e.message.slice(0, 500) });
    }
  } else if (tareaId || Date.now() >= proxima || UNA_VEZ) {
    try {
      if (!browser.isConnected()) ({ browser, page } = await abrir());
      const resultado = await revisar(page);
      if (tareaId) await db.from("pvp_tareas").update({ estado: "ok", resultado, terminada_at: new Date().toISOString() }).eq("id", tareaId);
      proxima = Date.now() + proximoIntervalo();
    } catch (e) {
      await registrarError(page, e);
      if (tareaId) await db.from("pvp_tareas").update({ estado: "error", error: e.message.slice(0, 500), terminada_at: new Date().toISOString() }).eq("id", tareaId);
      proxima = Date.now() + 10 * MIN;
      // Una sesión rota se arregla con un navegador nuevo, no insistiendo en el mismo.
      await browser.close().catch(() => {});
      ({ browser, page } = await abrir());
    }
    if (UNA_VEZ) break;
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
await browser.close().catch(() => {});
