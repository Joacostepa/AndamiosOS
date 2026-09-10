// Recupera las fotos del grupo de Telegram y las ata a la obra que les corresponde.
//
// POR QUÉ UN EXPORT Y NO UN BOT: un bot de Telegram NO puede leer el historial del grupo,
// sólo ve lo que llega desde que se lo agrega. El único camino a diez meses de fotos es la
// exportación de Telegram Desktop (⋮ → Exportar historial → JSON + Fotos).
//
// EL PROBLEMA NO ES TRAER LAS FOTOS, ES SABER DE QUÉ OBRA ES CADA UNA. En el grupo mandan
// un álbum con una caption tipo "Obra Scalabrini Ortiz 3358 / Pantalla 8,59 x 2,50...".
// Todo lo que sigue existe para resolver eso.
//
// DOS COSAS QUE NO SON OBVIAS Y CUESTAN SI NO SE SABEN:
//
//   1. LA EXPORTACIÓN NO TRAE `media_group_id`. Un álbum de 6 fotos son 6 mensajes y sólo
//      UNO lleva la caption; los otros 5 vienen vacíos. Sin reagrupar, el 70% de las fotos
//      queda huérfano. Se agrupan las fotos consecutivas del mismo autor dentro de 90 s.
//
//   2. NO TODAS LAS CAPTIONS DICEN "OBRA". Hay "Vallado Santa fe 2808", "Av corrientes
//      1984", "SARMIENTO 2969". Exigir ese prefijo tiraba dos tercios. El matcher busca
//      altura + calle en cualquier parte del texto.
//
// LA ALTURA ES EL ÚLTIMO NÚMERO DE LA DIRECCIÓN, no cualquiera: "24 de Noviembre 1644"
// empieza con 24 y eso hacía empatar cualquier calle numerada con cualquier otra.
//
// Correr:
//   node --env-file=.env.local scripts/importar-fotos-telegram.mjs <carpeta>            (simulacro)
//   node --env-file=.env.local scripts/importar-fotos-telegram.mjs <carpeta> --aplicar  (sube)

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { authenticate, searchRead } from "./odoo-rpc.mjs";

const CARPETA = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!CARPETA) throw new Error("Falta la carpeta del export de Telegram");

const BUCKET = "obras";
/** Umbral de confianza. Por debajo, la foto no se ata a nada: mejor sin foto que en la obra equivocada. */
const MIN_PUNTAJE = 0.5;
/** Fotos consecutivas del mismo autor dentro de esta ventana = un álbum. */
const VENTANA_ALBUM = 90;

// ── Normalización y matcher ──────────────────────────────────────────────────

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Palabras que aparecen en casi toda caption y en casi toda dirección: no distinguen nada
// y si se cuentan inflan el puntaje de cualquier par.
const RUIDO = new Set([
  "obra", "obras", "av", "avda", "avenida", "calle", "de", "del", "la", "el", "los", "las",
  "y", "caba", "capital", "federal", "cdad", "autonoma", "buenos", "aires", "bs", "as",
  "provincia", "pcia", "prov", "esq", "esquina", "altura", "piso",
  // Vocabulario del oficio: describe lo que se armó, no dónde.
  "vallado", "pantalla", "torre", "movil", "alto", "metros", "lineales",
]);

const toks = (s) => norm(s).split(" ").filter(Boolean);
const numeros = (s) => toks(s).filter((t) => /^\d{2,5}$/.test(t));
const palabras = (s) => toks(s).filter((t) => /[a-z]/.test(t) && t.length >= 4 && !RUIDO.has(t));

function puntaje(caption, direccion) {
  const nD = numeros(direccion);
  if (!nD.length) return 0;
  // La altura es el ÚLTIMO número de la dirección.
  if (!numeros(caption).includes(nD[nD.length - 1])) return 0;
  const pC = palabras(caption), pD = palabras(direccion);
  if (!pC.length || !pD.length) return 0;
  const comunes = pD.filter((w) => pC.includes(w)).length;
  // Simétrico: la caption puede ser más corta que la dirección guardada, o al revés.
  return comunes / Math.min(pC.length, pD.length);
}

// ── Lectura del export ───────────────────────────────────────────────────────

const datos = JSON.parse(fs.readFileSync(path.join(CARPETA, "result.json"), "utf8"));

/** El texto del mensaje. Telegram lo manda como string o como lista de fragmentos. */
function textoDe(m) {
  const t = m.text;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((x) => (typeof x === "string" ? x : x.text || "")).join("");
  return "";
}

function agruparAlbumes(mensajes) {
  const grupos = [];
  let actual = null;
  for (const m of mensajes) {
    if (!m.photo) continue;
    const t = m.date_unixtime | 0;
    if (actual && m.from_id === actual.from_id && t - actual.ultimo <= VENTANA_ALBUM) {
      actual.msgs.push(m);
      actual.ultimo = t;
    } else {
      actual = { from_id: m.from_id, autor: m.from, fecha: m.date, ultimo: t, msgs: [m] };
      grupos.push(actual);
    }
  }
  // La caption está en UNO de los mensajes del álbum, no siempre en el primero.
  for (const g of grupos) g.caption = g.msgs.map(textoDe).find((s) => s.trim()) || "";
  return grupos;
}

// ── Main ─────────────────────────────────────────────────────────────────────

await authenticate();
const obras = await searchRead(
  "sale.order",
  [["x_studio_tipo_de_contrato", "=", "Obra "], ["x_direccion_obra", "!=", false]],
  ["name", "x_direccion_obra", "x_studio_estado_de_obra", "date_order"],
  { limit: 5000 },
);

// UNA DIRECCIÓN, VARIAS VENTAS. Las obras grandes tienen armado, desarme, ampliaciones y
// renovaciones, cada una con su venta y la misma dirección. Elegir mal deja la foto colgada
// de una venta vieja y la obra que está parada HOY aparece sin fotos en el mapa —le pasaba
// a San José 190, que tiene 25 fotos y figuraba vacía—. Se prefiere la que está Armado y,
// si ninguna lo está, la más reciente.
const porDireccion = new Map();
for (const o of obras) {
  const k = norm(o.x_direccion_obra);
  if (!porDireccion.has(k)) porDireccion.set(k, []);
  porDireccion.get(k).push(o);
}
function mejorDe(candidatos) {
  const armada = candidatos.find((o) => o.x_studio_estado_de_obra === "Armado");
  if (armada) return armada;
  return [...candidatos].sort((a, b) => String(b.date_order).localeCompare(String(a.date_order)))[0];
}

const grupos = agruparAlbumes(datos.messages);
const conCaption = grupos.filter((g) => g.caption.trim());

const aSubir = [];
const sinMatch = [];
const ambiguos = [];

for (const g of conCaption) {
  const puntuadas = [...porDireccion.entries()]
    .map(([k, lista]) => ({ k, lista, p: puntaje(g.caption, lista[0].x_direccion_obra) }))
    .filter((x) => x.p >= MIN_PUNTAJE)
    .sort((a, b) => b.p - a.p);
  if (!puntuadas.length) { sinMatch.push(g); continue; }
  const top = puntuadas[0].p;
  const empatadas = puntuadas.filter((x) => x.p === top);
  // El empate se resuelve entre DIRECCIONES distintas; que una dirección tenga varias
  // ventas no es ambigüedad, es la misma obra.
  if (empatadas.length > 1) { ambiguos.push(g); continue; }
  const venta = mejorDe(empatadas[0].lista);
  const [dir, ...resto] = g.caption.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const m of g.msgs) {
    aSubir.push({
      msgId: m.id,
      archivo: path.join(CARPETA, m.photo),
      ventaId: venta.id,
      direccion: venta.x_direccion_obra,
      caption: g.caption,
      // La segunda línea suele ser QUÉ se armó, escrito por quien estuvo ahí.
      descripcion: resto.join(" ").slice(0, 500) || null,
      fecha: m.date,
      autor: g.autor ?? null,
      score: top,
    });
  }
}

const ventas = new Set(aSubir.map((x) => x.ventaId));
const enMapa = obras.filter((o) => o.x_studio_estado_de_obra === "Armado");
const enMapaConFoto = enMapa.filter((o) => ventas.has(o.id));
const pesoMB = aSubir.reduce((a, x) => a + (fs.existsSync(x.archivo) ? fs.statSync(x.archivo).size : 0), 0) / 1e6;

console.log(`Mensajes con foto: ${grupos.reduce((a, g) => a + g.msgs.length, 0)}`);
console.log(`Álbumes: ${grupos.length} · con caption: ${conCaption.length}`);
console.log(`\n  a subir:      ${aSubir.length} fotos → ${ventas.size} ventas  (${pesoMB.toFixed(0)} MB)`);
console.log(`  ambiguas:     ${ambiguos.length} álbumes`);
console.log(`  sin match:    ${sinMatch.length} álbumes`);
console.log(`\n  obras ARMADAS que reciben fotos: ${enMapaConFoto.length} de ${enMapa.length}`);

if (!APLICAR) {
  console.log("\n--- muestra ---");
  aSubir.slice(0, 8).forEach((x) => console.log(`  ${x.direccion}  ←  ${x.caption.split("\n")[0].slice(0, 50)}`));
  console.log("\nNo se subió nada. Para aplicar: --aplicar");
  process.exit(0);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Ya importadas, para poder cortar y retomar sin duplicar ni volver a subir.
const yaEstan = new Set();
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from("fotos_obra").select("telegram_msg_id").range(desde, desde + 999);
  if (error) throw new Error(error.message);
  data.forEach((r) => yaEstan.add(r.telegram_msg_id));
  if (data.length < 1000) break;
}
const pendientes = aSubir.filter((x) => !yaEstan.has(x.msgId));
console.log(`\nYa importadas: ${yaEstan.size} · pendientes: ${pendientes.length}`);

let ok = 0;
const fallaron = [];
for (const x of pendientes) {
  if (!fs.existsSync(x.archivo)) { fallaron.push({ ...x, motivo: "archivo no está en el export" }); continue; }
  const destino = `${x.ventaId}/${x.msgId}${path.extname(x.archivo) || ".jpg"}`;
  const { error: eUp } = await db.storage
    .from(BUCKET)
    .upload(destino, fs.readFileSync(x.archivo), { contentType: "image/jpeg", upsert: true });
  if (eUp) { fallaron.push({ ...x, motivo: eUp.message }); continue; }
  const { error: eIns } = await db.from("fotos_obra").insert({
    origen: "telegram",
    telegram_msg_id: x.msgId,
    odoo_venta_id: x.ventaId,
    storage_path: destino,
    caption: x.caption,
    descripcion: x.descripcion,
    tomada_el: x.fecha,
    autor: x.autor,
    estado: "asignada",
    match_score: x.score,
  });
  if (eIns) { fallaron.push({ ...x, motivo: eIns.message }); continue; }
  ok++;
  if (ok % 100 === 0) console.log(`  ...${ok}/${pendientes.length}`);
}

console.log(`\n✓ ${ok} fotos subidas`);
if (fallaron.length) {
  console.log(`✗ ${fallaron.length} fallaron:`);
  fallaron.slice(0, 10).forEach((f) => console.log(`   msg ${f.msgId}: ${f.motivo}`));
}

// El listado de lo que quedó afuera, para revisar a mano lo que valga la pena.
const informe = path.join(CARPETA, "sin-asignar.txt");
fs.writeFileSync(informe, [
  `AMBIGUAS (${ambiguos.length}) — la caption matchea más de una dirección`,
  ...ambiguos.map((g) => "  " + g.caption.split("\n")[0].slice(0, 90)),
  "",
  `SIN MATCH (${sinMatch.length}) — no se encontró la obra`,
  ...sinMatch.map((g) => "  " + g.caption.split("\n")[0].slice(0, 90)),
].join("\n"));
console.log(`\nInforme de lo no asignado: ${informe}`);
