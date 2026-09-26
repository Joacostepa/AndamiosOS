// Paridad visual del PDF de la propuesta: la skill (Python/ReportLab) contra el port (react-pdf).
//
// Genera los ejemplos de la skill (demo.json, demo_bandeja.json) con los dos motores y arma,
// por página, una imagen con los dos lado a lado para mirarlas. No compara píxel a píxel: las
// dos librerías tipografían distinto y eso daría diferencias sin sentido. Lo que importa es que
// membrete, secciones, cortes de página y montos se vean iguales.
//
// Necesita un Python con reportlab, num2words y pymupdf (un venv alcanza) y la skill descomprimida.
//
// Correr:
//   node --no-warnings scripts/pdf-paridad.mjs <carpeta de la skill descomprimida> <carpeta de salida> <python del venv>

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generarPdfPropuesta } from "../src/lib/cotizador/pdf/documento.ts";

const [dirSkill, salida, python] = process.argv.slice(2);
if (!dirSkill || !salida || !python) {
  console.error("Uso: node scripts/pdf-paridad.mjs <skill descomprimida> <salida> <python>");
  process.exit(1);
}
mkdirSync(salida, { recursive: true });
const RECURSOS = path.resolve("src/lib/cotizador/pdf/recursos");

// El script de la skill busca las fuentes en una carpeta de Linux y escribe en /tmp: se usa una
// copia con esas dos rutas cambiadas. El resto queda igual.
const original = readFileSync(path.join(dirSkill, "andamios-propuesta/scripts/generar_propuesta.py"), "utf8");
const parcheado = original
  .replace('GF = "/usr/share/fonts/truetype/google-fonts/"', `GF = "${RECURSOS}/"`)
  .replace('"/tmp/_count.pdf"', JSON.stringify(path.join(path.resolve(salida), "_count.pdf")));
// El script busca el logo en <su carpeta>/../assets: va en salida/scripts y el logo en salida/assets.
mkdirSync(path.join(salida, "scripts"), { recursive: true });
const scriptPy = path.join(salida, "scripts", "generar_propuesta_local.py");
writeFileSync(scriptPy, parcheado);
execFileSync("mkdir", ["-p", path.join(salida, "assets")]);
execFileSync("cp", [path.join(RECURSOS, "aba_logo.png"), path.join(salida, "assets", "aba_logo.png")]);

// La skill decide "única vez" por palabras en la descripción; para comparar el dibujo se usa
// la misma regla y así los montos salen idénticos (el motor nuevo usa la marca por producto).
const UNICA_VEZ = ["ingenier", "memoria de c", "memoria t", "cálculo estructural", "calculo estructural", "seguridad e higiene", "s&h", "syh", "gestor", "permiso", "tramitac", "habilitac", "flete", "acarreo", "traslado de material", "logístic", "logistic", "viátic", "viatic", "alojamiento", "movilizac", "venta de material", "izaje", "grúa", "grua", "hidroelevador"];
const esUnicaVez = (it) => ("unica_vez" in it ? !!it.unica_vez : UNICA_VEZ.some((k) => it.desc.toLowerCase().includes(k)));

function adaptar(j) {
  const base = j.economica.base.map((it) => ({ desc: it.desc, monto: it.monto }));
  const subtotal = base.reduce((a, it) => a + it.monto, 0);
  const iva = Math.round(subtotal * 0.21);
  const canon = subtotal - j.economica.base.filter(esUnicaVez).reduce((a, it) => a + it.monto, 0);
  const pct = j.renovacion?.porcentaje ?? 35;
  return {
    numero: j.numero,
    fechaEmision: j.fecha_emision ?? "2026-09-26",
    validezDias: 15,
    vendedor: j.vendedor ?? "—",
    cliente: { razonSocial: j.cliente.razon_social, contacto: j.cliente.contacto, obra: j.cliente.obra },
    seccion1: j.seccion1,
    seccion2: j.seccion2,
    imagenes: [],
    epigrafe: j.epigrafe,
    base,
    adicionales: (j.economica.adicionales ?? []).map((it) => ({ desc: it.desc, monto: it.monto })),
    opcionales: (j.economica.opcionales ?? []).map((it) => ({ desc: it.desc, monto: it.monto, unidad: it.unidad })),
    totales: { subtotal, iva, total: subtotal + iva, ivaPct: 21 },
    renovacion: j.renovacion ? { pct, monto: Math.round((j.renovacion.base ?? canon) * pct / 100) } : null,
    periodoDias: j.periodo_dias ?? 30,
    mostrarTotalConIva: j.mostrar_total_con_iva ?? true,
    actualizacionCac: true,
    formaPago: null,
    plazoInicioDiasHabiles: 7,
    aclaraciones: j.aclaraciones ?? null,
    borrador: false,
  };
}

for (const nombre of ["demo", "demo_bandeja"]) {
  const json = path.join(dirSkill, `andamios-propuesta/ejemplos/${nombre}.json`);
  const datos = JSON.parse(readFileSync(json, "utf8"));
  // La skill no trae fecha en los ejemplos (usa "hoy"): se fija para que las dos coincidan.
  datos.fecha_emision = "2026-09-26";
  const jsonFijo = path.join(salida, `${nombre}.json`);
  writeFileSync(jsonFijo, JSON.stringify(datos));

  const pdfSkill = path.join(salida, `skill-${nombre}.pdf`);
  execFileSync(python, [scriptPy, jsonFijo, pdfSkill], { cwd: salida, stdio: "pipe" });

  const pdfApp = path.join(salida, `app-${nombre}.pdf`);
  writeFileSync(pdfApp, await generarPdfPropuesta(adaptar(datos)));
  console.log(`✓ ${nombre}: ${path.basename(pdfSkill)} · ${path.basename(pdfApp)}`);
}

// Rasterizar y armar lado a lado con PyMuPDF.
const lado = `
import sys, pymupdf
sal = sys.argv[1]
for nombre in ["demo", "demo_bandeja"]:
    a = pymupdf.open(f"{sal}/skill-{nombre}.pdf"); b = pymupdf.open(f"{sal}/app-{nombre}.pdf")
    print(nombre, "páginas skill", len(a), "· app", len(b))
    for i in range(max(len(a), len(b))):
        out = pymupdf.open(); w, h = 595.28, 841.89
        pag = out.new_page(width=w * 2 + 20, height=h)
        if i < len(a): pag.show_pdf_page(pymupdf.Rect(0, 0, w, h), a, i)
        if i < len(b): pag.show_pdf_page(pymupdf.Rect(w + 20, 0, w * 2 + 20, h), b, i)
        pag.draw_line((w + 10, 0), (w + 10, h), color=(1, 0, 0))
        pag.get_pixmap(dpi=80).save(f"{sal}/lado-{nombre}-p{i + 1}.png")
`;
const pyLado = path.join(salida, "lado.py");
writeFileSync(pyLado, lado);
console.log(execFileSync(python, [pyLado, path.resolve(salida)], { encoding: "utf8" }));
