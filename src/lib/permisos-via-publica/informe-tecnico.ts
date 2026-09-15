import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// Informe técnico del andamio: la "Memoria de Cálculo Estructural" multidireccional firmada por
// Hougassian, completa para una obra.
//
// ES EL INFORME QUE EL GCBA YA ACEPTÓ, REARMADO: el texto sale del presentado en
// EX-2026-38891134 (Trelles 1086) y las imágenes, de ese mismo PDF. No se copian sus páginas
// porque TAD les estampa el número de documento y "Página x de 25".
//
// DECIDIDO CON JS (2026-09-15): sistema siempre multidireccional; secciones estándar por tipo
// (Hougassian ya está al tanto). Módulos en planta = base ÷ 2,50 y en altura = alto ÷ 2,
// redondeando para arriba (Trelles: 8 m → 4, 3 m → 2).
//
// Sin imports de alias: lo corre también un script de prueba fuera de Next.

export type TipoAndamio = "pantalla" | "estructura_pantalla" | "estructura" | "torre";

export type DatosInforme = {
  direccion: string;
  fecha: Date;
  tipo: TipoAndamio;
  /** Metros lineales en pantalla; base en estructura y torre. */
  base: number;
  /** Alto de la estructura. En pantalla es 3,00 m. */
  alto: number;
};

export type PlantillasInforme = {
  encabezado: Uint8Array;
  firma: Uint8Array;
  /** p05 apoyo · p06 protección peatonal · p07 caño y nudo · p08 base de fijación · p09 esfera */
  imagenes: Record<"p05" | "p06" | "p07" | "p08" | "p09", Uint8Array>;
  /** Las 12 láminas técnicas (verticales, horizontales, diagonales…), en orden. */
  laminas: Uint8Array[];
};

const ALTO_PANTALLA = 3;
const ANCHO_BANDEJA = 1.3;

export function tipoDeObra(xTrabajoObra: string | null | undefined): TipoAndamio | null {
  if (xTrabajoObra === "pantalla_proteccion") return "pantalla";
  if (xTrabajoObra === "estructura_pantalla") return "estructura_pantalla";
  if (xTrabajoObra === "estructura_sin_pantalla") return "estructura";
  if (xTrabajoObra === "torre") return "torre";
  return null;
}

const m = (n: number, coma = false) => (coma ? n.toFixed(2).replace(".", ",") : n.toFixed(2));
export const modulosEnPlanta = (base: number) => Math.max(1, Math.ceil(base / 2.5 - 1e-9));
export const modulosEnAltura = (alto: number) => Math.max(1, Math.ceil(alto / 2 - 1e-9));

/** Lo que va en la portada y en "La estructura tendrá las siguientes dimensiones". */
export function textoMedidas(d: Pick<DatosInforme, "tipo" | "base" | "alto">): { portada: string[]; dimensiones: string; altoCalculo: number } {
  const pantalla = `PANTALLA: ${m(d.base)} m de base x ${m(ANCHO_BANDEJA)} m de ancho x ${m(ALTO_PANTALLA)} m de altura.`;
  switch (d.tipo) {
    case "pantalla":
      return { portada: [pantalla], dimensiones: `Pantalla de protección peatonal de ${m(d.base, true)} m de base x ${m(ALTO_PANTALLA, true)} m de altura.`, altoCalculo: ALTO_PANTALLA };
    case "estructura_pantalla":
      return {
        portada: [`ESTRUCTURA: ${m(d.base)} m de base x ${m(d.alto)} m de altura.`, pantalla],
        dimensiones: `Estructura de ${m(d.base, true)} m de base x ${m(d.alto, true)} m de altura, con pantalla de protección peatonal en todo su desarrollo.`,
        altoCalculo: d.alto,
      };
    case "estructura":
      return { portada: [`ESTRUCTURA: ${m(d.base)} m de base x ${m(d.alto)} m de altura.`], dimensiones: `Estructura de ${m(d.base, true)} m de base x ${m(d.alto, true)} m de altura.`, altoCalculo: d.alto };
    case "torre":
      return { portada: [`TORRE: ${m(d.base)} m de base x ${m(d.alto)} m de altura.`], dimensiones: `Torre de ${m(d.base, true)} m de base x ${m(d.alto, true)} m de altura.`, altoCalculo: d.alto };
  }
}

type Seccion = { titulo: string; parrafos: { texto: string; imagen?: keyof PlantillasInforme["imagenes"] }[] };

const SECCIONES: Record<string, Seccion> = {
  apoyo: {
    titulo: "Puntos de Apoyo.",
    parrafos: [{ texto: "En nuestro caso, los puntos de apoyo serán en el piso exterior existente. Se emplearán placas metálicas de apoyo (bases de regulación o tornillones y placas de multilaminado fenólico de 18 mm. de espesor de 30 x 30 cm. Aprox. correspondiente con cada parante, de esta manera se logrará una correcta transmisión de los esfuerzos al terreno.", imagen: "p05" }],
  },
  plataformas: {
    titulo: "Plataformas de trabajo:",
    parrafos: [{ texto: "La plataforma de trabajo está compuesta por dos líneas dobles de tablones modulados cada 2.50 m. fabricados en chapa estampada antideslizante, y con encastres de fijación a la estructura. Los mismos se disponen de manera tal para conformar una plataforma continua de 0.60 m. de ancho, cada 2.00m de altura." }],
  },
  peatonal: {
    titulo: "Protección para tránsito peatonal:",
    parrafos: [{ texto: "Se instalará una pasarela peatonal con una pantalla de protección a 45° compuesta por un plano horizontal realizada en multilaminado fenólico en placas de 1.22 x 2.44 m. 18 mm. de espesor (pintadas de color azul) y a una altura aprox. de 2.50/3.00m. La pasarela peatonal y pantalla de protección se realiza en todo el desarrollo lineal de la estructura.", imagen: "p06" }],
  },
  exterior: {
    titulo: "Protección exterior:",
    parrafos: [{ texto: "Toda la superficie exterior del andamio estará protegida con una malla plástica del tipo media sombra de trama 80%, soportada por precintos plásticos, colocados en su parte interior a los efectos de reducir los efectos del viento sobre la misma y que no interfieran por ninguna causa con las tareas que se estén realizando." }],
  },
  arriostramientos: {
    titulo: "Arriostramientos:",
    parrafos: [
      { texto: "La estructura estará arriostrada al edificio existente mediante amarres de fijación. Dependiendo del tipo de estructura que presente el edificio, se utilizan los siguientes sistemas de fijación:" },
      { texto: "a- Los amarres están realizados en sistema de caño y nudo, según el siguiente croquis orientativo.", imagen: "p07" },
      { texto: "b- Los amarres están realizados mediante una base de fijación compuesta por una planchuela de acero con un caño estructural redondo (similar al andamio tubular 48 mm. y 2.9 mm. de pared) que se instala en el edificio mediante brocas o tarugos tipo “fisher” según el siguiente croquis orientativo.", imagen: "p08" },
    ],
  },
  escaleras: {
    titulo: "Escaleras internas:",
    parrafos: [{ texto: "La misma provee acceso cada 2,00 m. de altura en una longitud de 2,50 m. y se fija a la estructura mediante ganchos de acero. Fabricada con tubo de sección rectangular 70x30x2,0 mm., y provista de 11 escalones de chapa con perforado antideslizante e=1,6 mm. y 0,22 m. de profundidad. Posee barandas laterales encastrables." }],
  },
  esferas: {
    titulo: "Esferas de seguridad:",
    parrafos: [{ texto: "Se colocan en las rosetas de los parantes de la pantalla/estructura a modo de seguridad. Elaborada con pelletes depolipropileno. Medidas: 25cm de alto, 17cm de diámetro. Peso de la esfera: 250grs.", imagen: "p09" }],
  },
};

/** Secciones estándar por tipo (decidido con JS; Hougassian al tanto). */
export const SECCIONES_POR_TIPO: Record<TipoAndamio, string[]> = {
  pantalla: ["apoyo", "peatonal", "arriostramientos", "esferas"],
  estructura_pantalla: ["apoyo", "plataformas", "peatonal", "exterior", "arriostramientos", "escaleras", "esferas"],
  estructura: ["apoyo", "plataformas", "exterior", "arriostramientos", "escaleras", "esferas"],
  torre: ["apoyo", "plataformas", "escaleras"],
};

const MATERIALES = [
  ["Perfiles de sección circular", "F20", "2000", "2600"],
  ["Chapa de Roseta", "F24", "2400", "4100"],
  ["Chapa de Chaveta", "F36", "3600", "5100"],
  ["Perfiles de sección tubular", "F20", "2000", "2600"],
  ["Chapa puños", "F20", "2400", "2600"],
];

const CALCULO = [
  "#Sobrecarga:",
  "Se considera una sobrecarga de 200 Kg/m2 en los niveles entablonados. Se realiza el cálculo para tres niveles con sobrecarga simultánea.",
  "#Verificación del tablón:",
  "El tablón funciona como viga simplemente apoyada.", "Se adopta Mmax = Qt x 12/8", "Luz máxima entre apoyos l= 250 cm.",
  "Qt= p + g = 0.02 Kg/cm2 x 30 cm + 0.10 Kg/cm = 0.70 Kg/cm", "Ra = Rb = R = 0.70 Kg/cm x 250 cm/2 = 87.90 Kg/cm",
  "Mmax = Qt x 12/8 = (0.70 Kg/cm x 250 x 250 cm2)/8 = 5468.75 Kg. cm", "Tension = M max/w = 5468.75 Kg . cm /125 cm3 = 43.75 Kg/cm2 < tensión admisible",
  "#Verificación del travesaño de apoyo de los tablones",
  "Luz entre apoyos L = 1.25 m", "El travesaño funciona como viga simplemente apoyada.", "Q`t = 87.9 Kg/0.60 cm = 2.9 Kg/cm", "Ra = 36 Kg", "Rb = 107 Kg",
  "Mmax = 2500 Kg . cm", "Tensión = Mmax/W = 2500 Kg. cm/ 4.37 cm3 = 572 Kg/cm2 < tensión admisible",
  "#Verificación al deslizamiento de los nudos del travesaño sobre el parante",
  "R = 107 Kg. < Dn(1500 Kg)",
  "#Reacción de apoyo del travesaño por descarga solamente",
  "Rp = 0.02 Kg/cm2 x 60 cm x 250 cm = 300 Kg- Verifica",
  "#Verificación de los parantes:",
  "Verificación en los puntos mas bajos", "Máxima luz de pandeo Lp = 200 cm.", "Ambos extremos articulados", "Dos niveles con sobrecarga",
  "#Verificación del conjunto:",
  "Se consideran las mismas hipótesis de carga para la verificación del parante y que cada modulo es un elemento rígido e indeformable.",
  "Momento de inercia = j + f x d2 = (10.49 cm4 + 4.11 cm2 x 126 cm./2) x 2 = 538.84 cm4", "Radio de giro = 8.1 cm.", "Lambda 1 = 180 cm./1.59 cm. = 113.2",
  "Lambda yi = (lambda y) 2 + m/2 x (lambda 1) 2 = 88.9 x 88.9 + 113.2 x 113.2 = 143.9 – omega = 3.33",
  "Tensión = P x omega /f = 2050 Kg. x 3.33 /8.22 cm2 = 830 Kg./ cm2 <tensión admisible",
  "#Esfuerzos horizontales:",
  "Los andamios estarán vinculados horizontalmente cada 4 módulos en altura, y en toda las líneas de parantes con elementos que puedan considerarse puntos fijos, como ser puntales trabajando a la comprensión y/o insertos de acero inoxidable distribuidos convenientemente.",
  "De esta manera se corta la luz de pandeo del conjunto estructural y se disminuyen las flechas debidas a cargas horizontales provocadas por el transito de las personas, sumados a los efectos provocados por las plataformas de desplazamiento vertical.",
  "Se propone la combinación de elementos de compresión o sea caños con expansores colocados a los bordes de las ventanas cada 4.Estos estarán distribuidos según los requerimientos de la obra.",
  "#Transmisión de cargas al suelo:",
  "Cada parante tendrá en su parte inferior una placa de distribución de carga de 30 cm de lado con un espesor de 6.4 Mm.",
  "Superficie de apoyo de la base Sb= 900 cm2", "Base rígida", "Tensión de contacto =p/sb = 2050 Kg./900 cm2= 2.3 Kg./cm2",
  "Esta tensión de contacto es sensiblemente inferior a la da una vereda reglamentaria.",
];

// ── Maqueta de página: encabezado naranja arriba, número, firma abajo a la derecha ──────

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 60;
const ANCHO = A4[0] - MARGEN * 2;
const TECHO = A4[1] - 190;
const PISO = 150;
const TINTA = rgb(0.1, 0.1, 0.1);

/** Helvetica estándar sólo tiene WinAnsi: la φ del modelo se escribe como ø, igual que en el resto. */
const limpio = (t: string) => t.replace(/φ/g, "ø").replace(/[^\x00-\xFF–—‘’“”•…]/g, "");

class Maqueta {
  pagina!: PDFPage;
  y = TECHO;
  numero = 0;

  constructor(private doc: PDFDocument, private f: { normal: PDFFont; negrita: PDFFont }, private img: { encabezado: PDFImage; firma: PDFImage }) {}

  nueva() {
    this.pagina = this.doc.addPage(A4);
    this.numero += 1;
    const alto = (A4[0] / this.img.encabezado.width) * this.img.encabezado.height;
    this.pagina.drawImage(this.img.encabezado, { x: 0, y: A4[1] - alto, width: A4[0], height: alto });
    const n = String(this.numero);
    this.pagina.drawText(n, { x: A4[0] - MARGEN - this.f.normal.widthOfTextAtSize(n, 10), y: A4[1] - alto - 40, size: 10, font: this.f.normal, color: TINTA });
    const fw = 105;
    const fh = (fw / this.img.firma.width) * this.img.firma.height;
    const fx = A4[0] - MARGEN - fw;
    this.pagina.drawImage(this.img.firma, { x: fx, y: 88, width: fw, height: fh });
    ["EDUARDO HOUGASSIAN", "ARQUITECTO", "MAT N°12658"].forEach((l, i) => {
      const w = this.f.normal.widthOfTextAtSize(l, 7);
      this.pagina.drawText(l, { x: fx + (fw - w) / 2, y: 78 - i * 9, size: 7, font: this.f.normal, color: TINTA });
    });
    this.y = TECHO;
  }

  espacio(n: number) {
    this.y -= n;
  }

  asegurar(alto: number) {
    if (this.y - alto < PISO) this.nueva();
  }

  texto(t: string, o: { tam?: number; negrita?: boolean; subrayado?: boolean; centro?: boolean; despues?: number } = {}) {
    const tam = o.tam ?? 9.5;
    const font = o.negrita ? this.f.negrita : this.f.normal;
    const palabras = limpio(t).split(/\s+/).filter(Boolean);
    const lineas: string[] = [];
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, tam) > ANCHO && actual) {
        lineas.push(actual);
        actual = p;
      } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    for (const l of lineas) {
      this.asegurar(tam * 1.5);
      this.y -= tam * 1.5;
      const w = font.widthOfTextAtSize(l, tam);
      const x = o.centro ? MARGEN + (ANCHO - w) / 2 : MARGEN;
      this.pagina.drawText(l, { x, y: this.y, size: tam, font, color: TINTA });
      if (o.subrayado) this.pagina.drawLine({ start: { x, y: this.y - 1.5 }, end: { x: x + w, y: this.y - 1.5 }, thickness: 0.6, color: TINTA });
    }
    this.y -= o.despues ?? 6;
  }

  imagen(img: PDFImage, maxAncho: number, maxAlto: number) {
    const escala = Math.min(maxAncho / img.width, maxAlto / img.height, 1.6);
    const w = img.width * escala;
    const h = img.height * escala;
    this.asegurar(h + 10);
    this.y -= h + 6;
    this.pagina.drawImage(img, { x: MARGEN + (ANCHO - w) / 2, y: this.y, width: w, height: h });
    this.y -= 10;
  }

  /** Celdas centradas; "\n" parte una celda en renglones (los encabezados largos del modelo). */
  tabla(filas: string[][], anchos: number[], encabezados: number) {
    const total = anchos.reduce((a, b) => a + b, 0);
    const altoFila = (fila: string[], i: number) => (i < encabezados ? Math.max(...fila.map((c) => c.split("\n").length)) * 10 + 8 : 18);
    this.asegurar(filas.reduce((s, f, i) => s + altoFila(f, i), 0) + 10);
    let y = this.y;
    filas.forEach((fila, i) => {
      const esEncabezado = i < encabezados;
      const tam = esEncabezado ? 7.5 : 8.5;
      const alto = altoFila(fila, i);
      let x = MARGEN + (ANCHO - total) / 2;
      y -= alto;
      fila.forEach((celda, j) => {
        this.pagina.drawRectangle({ x, y, width: anchos[j], height: alto, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5 });
        const font = esEncabezado ? this.f.negrita : this.f.normal;
        const renglones = limpio(celda).split("\n");
        renglones.forEach((r, k) => {
          const w = font.widthOfTextAtSize(r, tam);
          const yTexto = y + alto / 2 + ((renglones.length - 1) / 2 - k) * 10 - tam / 3;
          this.pagina.drawText(r, { x: x + (anchos[j] - w) / 2, y: yTexto, size: tam, font, color: TINTA });
        });
        x += anchos[j];
      });
    });
    this.y = y - 12;
  }
}

export async function generarInformeTecnico(d: DatosInforme, p: PlantillasInforme): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Informe técnico del andamio");
  doc.setProducer("AndamiosOS");
  const fuentes = { normal: await doc.embedFont(StandardFonts.Helvetica), negrita: await doc.embedFont(StandardFonts.HelveticaBold) };
  const maqueta = new Maqueta(doc, fuentes, { encabezado: await doc.embedPng(p.encabezado), firma: await doc.embedPng(p.firma) });
  const e = maqueta;
  const embebidas = {
    p05: await doc.embedPng(p.imagenes.p05),
    p06: await doc.embedPng(p.imagenes.p06),
    p07: await doc.embedPng(p.imagenes.p07),
    p08: await doc.embedPng(p.imagenes.p08),
    p09: await doc.embedPng(p.imagenes.p09),
  };
  const medidas = textoMedidas(d);
  const direccion = d.direccion.toUpperCase().replace(/\.$/, "");
  const fecha = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).format(d.fecha);

  // 1. Portada
  e.nueva();
  e.espacio(10);
  e.texto("Memoria de Cálculo Estructural", { tam: 14, negrita: true, centro: true, despues: 30 });
  e.texto(`Obra: ${direccion}.`, { tam: 10.5, despues: 12 });
  e.texto(`Fecha: ${fecha}.`, { tam: 10.5, despues: 30 });
  e.texto("MEDIDAS DEL ANDAMIO:", { tam: 10.5, negrita: true, subrayado: true, despues: 26 });
  for (const l of medidas.portada) e.texto(l, { tam: 10.5, despues: 22 });
  e.texto(`MÓDULOS EN PLANTA: ${modulosEnPlanta(d.base)} módulos.`, { tam: 10.5, despues: 22 });
  e.texto(`MÓDULOS EN ALTURA: ${modulosEnAltura(medidas.altoCalculo)} módulos.`, { tam: 10.5 });

  // 2. Memoria descriptiva
  e.nueva();
  e.texto("1. MEMORIA DESCRIPTIVA", { negrita: true, subrayado: true, despues: 10 });
  for (const t of [
    `El objeto de esta memoria de cálculo corresponde a la estructura tubular para trabajos en fachada de edificio, sito en ${direccion}, de la Ciudad Autónoma de Buenos Aires,`,
    "En la misma se hará mención al diseño y verificación de una estructura metálica reticulada tubular compuesta sistema multidireccional.",
    "El sistema multidireccional posee una conexión articulada rígida logrando una óptima transmisión de los esfuerzos y repartiendo uniformemente las cargas puntuales que transmiten las barras eliminando las posibles excentricidades. El eje del cabezal con cuña coincide precisamente con el eje vertical, con lo que la transmisión de cargas es centrada.",
    "El ancho del andamio es de 2.50 m. entre ejes de parantes, el largo máximo es de 2.50mts entre parantes, en el caso del sistema multidireccional y de el ancho del andamio es de 1.26mts entre ejes de parantes, el largo máximo es de 2.50mts entre parantes.",
    "Se dispone de diagonales de rigidación y de vinculaciones horizontales de forma tal que puedan absorberse los esfuerzos horizontales y movimientos que pudiera tener la estructura.",
    "Aplica a los andamios sistema multidireccional",
    "Incluye a los andamios patentados integrales, no mecánicos, fabricados bajo normas internacionales reconocidas (ANSI, BS, IRAM, ISO, etc)",
  ]) e.texto(t, { despues: 9 });

  // 3. Dimensiones y secciones de tubo
  e.nueva();
  e.texto(`La estructura tendrá las siguientes dimensiones: ${medidas.dimensiones}`, { despues: 12 });
  for (const t of [
    "Las secciones tienen las siguientes características:",
    "φ = 48.3mm t = 2.9mm para verticales, horizontales, diagonales y cordón superior e inferior viga celosía y ø26.5mm y t=2.35mm diagonales",
    "La calidad para tubos de sección circulares y para la chapa de tubo, de puños y rosetas es F-20 y de chapa para chaveta es F-36 según CIRSOC 301.",
    "Este sistema están dispuesto de manera de cumplir con una función de cuadrícula reforzada en puntos de amarre, convenientemente arriostrados y vinculada a puntos fijos que aseguran su rigidez e indeformabilidad.",
  ]) e.texto(t, { despues: 9 });

  // 4. Materiales
  e.nueva();
  e.texto("2. MATERIALES:", { negrita: true, subrayado: true, despues: 8 });
  e.texto("Estructura de Acero", { despues: 8 });
  const cabecera = [["MATERIALES", "Designación\ns/Cirsoc 301", "Fy (kg/cm2)\nMinimun yield stress", "Fu (kg/cm2)\nTensile strength"]];
  e.tabla([...cabecera, ...MATERIALES], [150, 110, 110, 100], 1);

  // 5. Componentes: una sección por página, renumeradas según el tipo
  const letras = "abcdefghij";
  SECCIONES_POR_TIPO[d.tipo].forEach((clave, i) => {
    const s = SECCIONES[clave];
    e.nueva();
    if (i === 0) e.texto("3. COMPONENTES DE LA ESTRUCTURA:", { negrita: true, subrayado: true, despues: 14 });
    e.texto(`3.${letras[i]}) ${s.titulo}`, { negrita: true, subrayado: true, despues: 8 });
    for (const par of s.parrafos) {
      e.texto(par.texto, { despues: 8 });
      if (par.imagen) e.imagen(embebidas[par.imagen], ANCHO * 0.6, 230);
    }
  });

  // 6. Normas y cálculo
  e.nueva();
  e.texto("4. NORMAS DE CÁLCULO:", { negrita: true, subrayado: true, despues: 8 });
  e.tabla([
    ["NORMA", "REFERENCIA"],
    ["CIRSOC 101", "Cargas y sobrecargas gravitatorias para el cálculo de las estructuras."],
    ["CIRSOC 102", "Acción del viento sobre las construcciones. Modificaciones Dic.84."],
    ["CIRSOC 301", "Proyecto de Reglamento Argentino de Estructuras de Acero p/ edificios."],
    ["AISC-ASD 9th", "American Institute of Steel Constuction-Allowable Stress Design"],
    ["AISI-ASD 1996", "American Iron and Steel Institute - Allowable Stress Design"],
  ], [90, 380], 1);
  for (const t of ["*Ley 19.587- Decreto 351/79", "*Decreto 911/96", "*Normas OSHA 1926,451/452"]) e.texto(t, { despues: 2 });
  e.espacio(8);
  for (const t of CALCULO) {
    if (t.startsWith("#")) e.texto(t.slice(1), { negrita: true, despues: 3 });
    else e.texto(t, { despues: 3 });
  }
  e.espacio(8);
  e.texto("5. MATERIALES:", { negrita: true, subrayado: true, despues: 8 });
  e.texto("Estructura de Acero", { despues: 8 });
  e.tabla([...cabecera, ...MATERIALES.slice(0, 4)], [150, 110, 110, 100], 1);

  // 7. Láminas técnicas, una por página
  for (const lamina of p.laminas) {
    e.nueva();
    const img = await doc.embedPng(lamina);
    const escala = Math.min(ANCHO / img.width, (TECHO - PISO + 20) / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    e.pagina.drawImage(img, { x: MARGEN + (ANCHO - w) / 2, y: PISO - 10 + (TECHO - PISO + 20 - h), width: w, height: h });
  }

  return doc.save();
}
