// Convierte la dirección de obra en coordenadas, para el Mapa de Obras.
//
// POR QUÉ HACE FALTA: el autocompletado de Google Places nos da calle, ciudad y CP, pero
// NO latitud y longitud. Un mapa necesita puntos, no texto.
//
// POR QUÉ ACÁ Y NO EN ODOO: el sandbox de Odoo Online no deja hacer llamadas HTTP salientes
// desde una server action (ya lo chocamos con la automatización del CRM). La app sí puede,
// y además ya escribe en Odoo.
//
// NO USA LA GEOCODING API. Usa `places:searchText` de la Places API (New), que ya está
// habilitada y devuelve `location` con las coordenadas. Una API menos que habilitar, una
// menos que pagar, y de yapa resuelve nombres propios: "Embajada EEUU" cae en Av. Colombia
// 4300. La key sale del propio Odoo (ir.config_parameter), así que este script no lleva
// secretos.
//
// SE GEOCODIFICA UNA VEZ Y SE GUARDA, no en cada carga del mapa: una request por punto por
// visita sería lento y se paga cada vez. `x_obra_geo_dir` guarda CONTRA QUÉ TEXTO se
// geocodificó; si alguien corrige la dirección deja de coincidir y la fila se rehace sola
// en la próxima corrida. Sin ese campo no habría forma de saber que el punto quedó viejo.
//
// ALCANCE: sólo tipo de contrato "Obra ". Las "Simple" y "Alquiler Sin Montaje" quedan
// afuera a propósito — muchas ni siquiera tienen obra ("RETIRA DE CUCHA CUCHA 2345", el
// cliente pasa por el depósito) y ensuciarían el mapa.
//
// Correr:
//   node --env-file=.env.local scripts/odoo-geocodificar-obras.mjs            (simulacro)
//   node --env-file=.env.local scripts/odoo-geocodificar-obras.mjs --aplicar  (escribe)
//   ... --aplicar --todas   (no sólo las armadas: también las pendientes de armado)

import { authenticate, executeKw, searchRead } from "./odoo-rpc.mjs";

const APLICAR = process.argv.includes("--aplicar");
const TODAS = process.argv.includes("--todas");

// Argentina continental, con margen. Google a veces resuelve una dirección ambigua en otro
// país —hay "Corrientes 1125" en varios— y un punto en México rompe el encuadre del mapa
// para todos los demás. Más vale dejarlo sin geocodificar y que se vea en el informe.
const CAJA_AR = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -52 };

await authenticate();

const [param] = await searchRead(
  "ir.config_parameter",
  [["key", "=", "google_address_autocomplete.google_places_api_key"]],
  ["value"],
);
if (!param?.value) throw new Error("No hay API key de Google Places cargada en Odoo");
const KEY = param.value;

const estados = TODAS ? ["Armado", "Pendiente de Armado"] : ["Armado"];
const ordenes = await searchRead(
  "sale.order",
  [
    ["x_studio_tipo_de_contrato", "=", "Obra "],
    ["x_studio_estado_de_obra", "in", estados],
    ["x_direccion_obra", "!=", false],
  ],
  ["name", "x_direccion_obra", "x_obra_ciudad", "x_obra_lat", "x_obra_lng", "x_obra_geo_dir"],
  { limit: 2000 },
);

/** Lo que se le pregunta a Google. La ciudad y el país acotan: sin ellos "Alsina 2028" es ambigua. */
function consulta(o) {
  const partes = [o.x_direccion_obra, o.x_obra_ciudad || "", "Argentina"].filter(Boolean);
  return partes.join(", ").replace(/\s+/g, " ").trim();
}

const pendientes = ordenes.filter((o) => {
  const yaEsta = o.x_obra_lat && o.x_obra_lng;
  const alDia = o.x_obra_geo_dir === o.x_direccion_obra;
  return !(yaEsta && alDia);
});

console.log(`Obras "Obra " en estado ${estados.join(" / ")}: ${ordenes.length}`);
console.log(`  ya geocodificadas y al día: ${ordenes.length - pendientes.length}`);
console.log(`  a geocodificar:             ${pendientes.length}`);

if (!APLICAR) {
  console.log("\n--- muestra de las consultas que se harían ---");
  pendientes.slice(0, 10).forEach((o) => console.log(`  ${o.name}  ${JSON.stringify(consulta(o))}`));
  console.log("\nNo se escribió nada. Para aplicar: --aplicar");
  process.exit(0);
}

async function geocodificar(texto) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.location,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: texto, regionCode: "AR", maxResultCount: 1 }),
  });
  const json = await res.json();
  if (json.error) return { error: json.error.message };
  const p = json.places?.[0];
  if (!p?.location) return { error: "sin resultados" };
  return { lat: p.location.latitude, lng: p.location.longitude, formateada: p.formattedAddress };
}

let ok = 0;
const fallaron = [];
const fueraDeCaja = [];

for (const o of pendientes) {
  const texto = consulta(o);
  const r = await geocodificar(texto);
  if (r.error) {
    fallaron.push({ orden: o.name, texto, motivo: r.error });
    continue;
  }
  const dentro =
    r.lat >= CAJA_AR.latMin && r.lat <= CAJA_AR.latMax &&
    r.lng >= CAJA_AR.lngMin && r.lng <= CAJA_AR.lngMax;
  if (!dentro) {
    fueraDeCaja.push({ orden: o.name, texto, lat: r.lat, lng: r.lng, formateada: r.formateada });
    continue;
  }
  await executeKw("sale.order", "write", [[o.id], {
    x_obra_lat: r.lat,
    x_obra_lng: r.lng,
    x_obra_geo_dir: o.x_direccion_obra,
  }]);
  ok++;
  if (ok % 20 === 0) console.log(`  ...${ok}/${pendientes.length}`);
}

console.log(`\n✓ ${ok} obras geocodificadas`);

if (fueraDeCaja.length) {
  console.log(`\n⚠ ${fueraDeCaja.length} cayeron FUERA de Argentina y no se guardaron:`);
  fueraDeCaja.forEach((f) =>
    console.log(`   ${f.orden}  ${JSON.stringify(f.texto)}\n      → ${f.lat}, ${f.lng}  ${f.formateada}`),
  );
}
if (fallaron.length) {
  console.log(`\n✗ ${fallaron.length} sin resultado:`);
  fallaron.forEach((f) => console.log(`   ${f.orden}  ${JSON.stringify(f.texto)}  — ${f.motivo}`));
}

const fin = await searchRead(
  "sale.order",
  [["x_studio_tipo_de_contrato", "=", "Obra "], ["x_studio_estado_de_obra", "=", "Armado"]],
  ["x_obra_lat"],
  { limit: 2000 },
);
const conPunto = fin.filter((o) => o.x_obra_lat).length;
console.log(`\nObras ARMADAS con punto en el mapa: ${conPunto} de ${fin.length}`);
