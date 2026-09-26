import { inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { MINIMO_ALFA_FIRMA, formatoCuit, type TipoDueno } from "./tipos";

// El Acta de compromiso del GCBA y la Nota de autorización de ABA, completas y firmadas.
//
// EL TEXTO DEL ACTA ES EL DEL FORMULARIO OFICIAL, tal cual (incluidas sus rarezas: dos
// "CLÁUSULA TERCERA", un "III)" sin "II)"). Es una declaración jurada ante el GCBA y no se
// corrige: sólo se completan los blancos. La nota es la plantilla de ABA.
//
// La firma es la que el cliente dibuja en el portal. Cada página lleva al pie la constancia
// de firma electrónica: quién, DNI, cuándo.

export type DatosFirma = {
  firmante: string;
  dni: string;
  caracter: string;
  domicilio: string;
  trabajos: string;
};

export type ContextoFirma = {
  tipoDueno: TipoDueno;
  titularNombre: string;
  titularCuit: string;
  desde: string;
  hasta: string;
  domicilioElectronico: string;
  firmadoAt: Date;
};

// ── ¿El recuadro de firma tiene algo dibujado? ──────────────────────────────

/** Deshace el filtro de una línea del PNG (RFC 2083 § 6), en el lugar. */
function desfiltrar(filtro: number, linea: Buffer, previa: Buffer, bpp: number) {
  for (let i = 0; i < linea.length; i++) {
    const izq = i >= bpp ? linea[i - bpp] : 0;
    const arriba = previa[i];
    const diagonal = i >= bpp ? previa[i - bpp] : 0;
    let v = linea[i];
    if (filtro === 1) v += izq;
    else if (filtro === 2) v += arriba;
    else if (filtro === 3) v += (izq + arriba) >> 1;
    else if (filtro === 4) {
      // Paeth: se queda con el vecino más parecido a la suma de los tres.
      const p = izq + arriba - diagonal;
      const a = Math.abs(p - izq), b = Math.abs(p - arriba), c = Math.abs(p - diagonal);
      v += a <= b && a <= c ? izq : b <= c ? arriba : diagonal;
    }
    linea[i] = v & 0xff;
  }
}

/**
 * Qué proporción del recuadro de firma está dibujada (0 a 1), leyendo el canal alfa del PNG.
 * `null` si el PNG no es el que devuelve el canvas del navegador (RGBA de 8 bits, sin
 * entrelazar) o si no se pudo descomprimir: quien la llama trata ese caso como "no se pudo
 * mirar" y no deja pasar la firma. Ver MINIMO_TINTA_FIRMA en tipos.ts.
 */
export function tintaDeFirma(png: Uint8Array): number | null {
  const b = Buffer.from(png);
  const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 8 || FIRMA.some((v, i) => b[i] !== v)) return null;

  let cabecera: { ancho: number; alto: number; bits: number; color: number; entrelazado: number } | null = null;
  const datos: Buffer[] = [];
  for (let i = 8; i + 12 <= b.length; ) {
    const largo = b.readUInt32BE(i);
    const tipo = b.toString("latin1", i + 4, i + 8);
    const cuerpo = b.subarray(i + 8, i + 8 + largo);
    if (tipo === "IHDR" && cuerpo.length >= 13) {
      cabecera = { ancho: cuerpo.readUInt32BE(0), alto: cuerpo.readUInt32BE(4), bits: cuerpo[8], color: cuerpo[9], entrelazado: cuerpo[12] };
    } else if (tipo === "IDAT") datos.push(cuerpo);
    else if (tipo === "IEND") break;
    i += largo + 12;
  }
  if (!cabecera || !datos.length) return null;
  const { ancho, alto, bits, color, entrelazado } = cabecera;
  if (bits !== 8 || color !== 6 || entrelazado !== 0 || !ancho || !alto) return null;

  let crudo: Buffer;
  try {
    crudo = inflateSync(Buffer.concat(datos));
  } catch {
    return null;
  }
  const bpp = 4;
  const largoLinea = ancho * bpp;
  if (crudo.length < (largoLinea + 1) * alto) return null;

  const linea = Buffer.alloc(largoLinea);
  const previa = Buffer.alloc(largoLinea);
  let conTinta = 0;
  for (let y = 0; y < alto; y++) {
    const arranca = y * (largoLinea + 1);
    crudo.copy(linea, 0, arranca + 1, arranca + 1 + largoLinea);
    desfiltrar(crudo[arranca], linea, previa, bpp);
    for (let x = 3; x < largoLinea; x += bpp) if (linea[x] >= MINIMO_ALFA_FIRMA) conTinta++;
    linea.copy(previa);
  }
  return conTinta / (ancho * alto);
}

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 64;
const ANCHO = A4[0] - MARGEN * 2;
const ZONA = "America/Argentina/Buenos_Aires";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");
const fechaHoy = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const fechaLarga = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "long", year: "numeric" }).format(d);
const horaHoy = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Arma páginas con párrafos que cortan solos, justificado y con **negritas** en línea. */
class Escritor {
  pagina!: PDFPage;
  y = 0;

  constructor(private doc: PDFDocument, private normal: PDFFont, private negrita: PDFFont) {
    this.nuevaPagina();
  }

  nuevaPagina() {
    this.pagina = this.doc.addPage(A4);
    this.y = A4[1] - MARGEN;
  }

  espacio(n: number) {
    this.y -= n;
  }

  asegurar(alto: number) {
    if (this.y - alto < MARGEN + 24) this.nuevaPagina();
  }

  parrafo(texto: string, o: { tam?: number; alineado?: "justificado" | "izquierda" | "centro" | "derecha"; despues?: number } = {}) {
    const tam = o.tam ?? 10.5;
    const interlinea = tam * 1.45;
    const alineado = o.alineado ?? "justificado";

    // "**" alterna negrita. Cada palabra recuerda su fuente.
    const palabras: { t: string; f: PDFFont }[] = [];
    texto.split("**").forEach((tramo, i) => {
      const f = i % 2 === 1 ? this.negrita : this.normal;
      for (const t of tramo.split(/\s+/).filter(Boolean)) palabras.push({ t, f });
    });

    const lineas: { t: string; f: PDFFont }[][] = [];
    let actual: typeof palabras = [];
    let ancho = 0;
    for (const p of palabras) {
      const w = p.f.widthOfTextAtSize(p.t, tam);
      const espacio = actual.length ? this.normal.widthOfTextAtSize(" ", tam) : 0;
      if (actual.length && ancho + espacio + w > ANCHO) {
        lineas.push(actual);
        actual = [];
        ancho = 0;
      }
      ancho += (actual.length ? this.normal.widthOfTextAtSize(" ", tam) : 0) + w;
      actual.push(p);
    }
    if (actual.length) lineas.push(actual);

    lineas.forEach((linea, i) => {
      this.asegurar(interlinea);
      const anchos = linea.map((p) => p.f.widthOfTextAtSize(p.t, tam));
      const total = anchos.reduce((a, b) => a + b, 0);
      const ultima = i === lineas.length - 1;
      const espacioNormal = this.normal.widthOfTextAtSize(" ", tam);
      // Justificar un renglón con una palabra muy larga (un mail) deja huecos enormes: pasados
      // tres espacios normales, ese renglón va a la izquierda.
      const justificado = (ANCHO - total) / Math.max(1, linea.length - 1);
      const hueco = alineado === "justificado" && !ultima && linea.length > 1 && justificado <= espacioNormal * 3 ? justificado : espacioNormal;
      const ocupado = total + hueco * (linea.length - 1);
      let x = alineado === "centro" ? MARGEN + (ANCHO - ocupado) / 2 : alineado === "derecha" ? MARGEN + ANCHO - ocupado : MARGEN;
      this.y -= interlinea;
      linea.forEach((p, j) => {
        this.pagina.drawText(p.t, { x, y: this.y, size: tam, font: p.f, color: rgb(0.1, 0.1, 0.1) });
        x += anchos[j] + hueco;
      });
    });
    this.y -= o.despues ?? tam * 0.9;
  }

  imagen(img: PDFImage, alto: number, x = MARGEN) {
    this.asegurar(alto + 8);
    const w = (img.width / img.height) * alto;
    this.y -= alto;
    this.pagina.drawImage(img, { x, y: this.y, width: w, height: alto });
  }

  linea(ancho: number) {
    this.asegurar(8);
    this.y -= 4;
    this.pagina.drawLine({ start: { x: MARGEN, y: this.y }, end: { x: MARGEN + ancho, y: this.y }, thickness: 0.7, color: rgb(0.3, 0.3, 0.3) });
  }
}

/**
 * La constancia de firma electrónica al pie de cada página. En el borrador que el cliente lee
 * antes de firmar dice que todavía no está firmado.
 */
function pieDeFirma(doc: PDFDocument, fuente: PDFFont, datos: DatosFirma, ctx: ContextoFirma, borrador = false) {
  const texto = borrador
    ? "BORRADOR — todavía sin firmar. Así queda el documento cuando lo firmes en el portal de Andamios Buenos Aires."
    : `Firmado electrónicamente por ${datos.firmante} (DNI ${datos.dni}) el ${fechaHoy(ctx.firmadoAt)} a las ${horaHoy(ctx.firmadoAt)} en el portal de Andamios Buenos Aires.`;
  const paginas = doc.getPages();
  const gris = rgb(0.45, 0.45, 0.45);
  paginas.forEach((p, i) => {
    // Dos renglones: la constancia ocupa casi todo el ancho y el número se le pisaba al final.
    p.drawText(texto, { x: MARGEN, y: 34, size: 7.5, font: fuente, color: gris });
    const numero = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(numero, { x: A4[0] - MARGEN - fuente.widthOfTextAtSize(numero, 7.5), y: 23, size: 7.5, font: fuente, color: gris });
  });
}

async function nuevoDocumento(titulo: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.setProducer("AndamiosOS");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, normal, negrita, escritor: new Escritor(doc, normal, negrita) };
}

/**
 * El acta de compromiso. Sin `firmaPng` sale el BORRADOR que el cliente lee en el portal antes
 * de firmar: mismo texto y mismos datos, con el espacio de la firma vacío (JS, 15/09).
 */
export async function generarActaCompromiso(datos: DatosFirma, firmaPng: Uint8Array | null, ctx: ContextoFirma): Promise<Uint8Array> {
  const { doc, normal, escritor: e } = await nuevoDocumento("Acta de compromiso");
  const representacion = ctx.tipoDueno === "persona" ? "por derecho propio," : `en nombre y representación de **${ctx.titularNombre}**`;

  e.parrafo("**ACTA COMPROMISO PARA LA TRAMITACIÓN DE PERMISOS DE USO PARA LA INSTALACIÓN DE ANDAMIOS EN EL ESPACIO PÚBLICO**", { tam: 13, alineado: "centro", despues: 18 });

  const bloques = [
    `En virtud de la solicitud formulada en el día de la fecha **${fechaHoy(ctx.firmadoAt)}**, el/los solicitante/s, Sr/Sra **${datos.firmante}** ${representacion} CUIT: **${formatoCuit(ctx.titularCuit)}** con facultades suficientes para este acto conforme a la documentación que acredita cuya original y/o copia provee, con domicilio real en la calle **${datos.domicilio}** de la Ciudad Autónoma de Buenos Aires y domicilio electrónico constituido en **${ctx.domicilioElectronico}**, se compromete en caso de autorizarse el permiso requerido a utilizar exclusivamente el espacio público solicitado los días **desde el ${fechaCorta(ctx.desde)} hasta el ${fechaCorta(ctx.hasta)}** y manifiesta **BAJO DECLARACIÓN JURADA** que asume para la presentación del trámite e instalación, permanencia y desinstalación del andamio el siguiente compromiso conforme a los antecedentes y cláusulas que se detallan a continuación:`,
    "#**ANTECEDENTES:**",
    "La Constitución de la Ciudad Autónoma de Buenos Aires, establece en su artículo 26 que el ambiente es patrimonio común y que toda persona tiene derecho a gozar de un ambiente sano, así como el deber de preservarlo y defenderlo en provecho de las generaciones presentes y futuras; y en su artículo 27 dispone que la Ciudad desarrolla en forma indelegable una política de planeamiento y gestión del ambiente urbano integrada a las políticas de desarrollo económico, social y cultural, promoviendo entre otras, que contemple su inserción en el área metropolitana.",
    "Todos los permisos en el espacio público, deben ser armonizados con el derecho de todo habitante de la Ciudad a gozar de una ambiente sano, así como el deber de preservarlo y defenderlo, debiendo cesar toda actividad que suponga en forma actual o inminente un daño al ambiente, sus habitantes o cosas propiedad del Gobierno de la Ciudad de Buenos Aires o sus ciudadanos.",
    "Asimismo, el Código Civil y Comercial de la Nación, en el inciso f) del artículo 235, comprende dentro de los bienes del dominio público a las calles, plazas, caminos, canales, puentes y cualquier otra obra pública construida para utilidad o comodidad común.",
    "Por otra parte, el permiso es una tolerancia que la Administración pública admite en interés del usuario en ejercicio de sus poderes de policía del dominio público; todo permiso de ocupación del dominio público lleva implícita la condición de ser en todo momento compatible con el interés público y por consiguiente, revocable por la Administración pública;",
    "En virtud de lo anteriormente expuesto, el otorgamiento de un permiso de uso sobre los bienes del dominio público o privado del Estado, se encuentra íntimamente ligado al contenido de interés público de la actividad a ser desplegada por el peticionante y que en razón de esa circunstancia su compatibilidad con dicho interés público deberá ser valorado objetivamente al momento de fundar el acto administrativo por el que se otorgue.",
    "#**CLÁUSULA PRIMERA – OBJETO**",
    "El solicitante declara que el permiso de uso del espacio público solicitado no se encuentra prohibido por la ley, no es contrario a la moral, a las buenas costumbres, al orden público o lesivo de los derechos ajenos o de la dignidad humana y deberá adecuarse a lo expuesto a la normativa vigente.",
    "#**CLÁUSULA SEGUNDA – CARÁCTER**",
    "El solicitante acepta y reconoce que en caso de otorgarse el permiso, el mismo reviste el carácter de precario, por lo que la Dirección General de Ordenamiento del Espacio Público podrá revocarlo en razón de la oportunidad, mérito o conveniencia, sin derecho a indemnización alguna, ni ningún tipo de resarcimiento.",
    "#**CLÁUSULA TERCERA– OBLIGACIONES**",
    "**I) Condiciones Generales.** En caso de autorizarse la solicitud de permiso de uso del espacio público para la instalación de un andamio, el mismo deberá instalarse y permanecer en los días dispuestos en el acto administrativo que se dicte, y utilizar exclusivamente el espacio público requerido conforme al croquis e informe técnico presentados.",
    "**El solicitante** se compromete a acreditar el pago del canon correspondiente según la Ley Tarifaria vigente.",
    "**III) Conservación y restitución del espacio público.** En caso de autorizarse el permiso solicitado, el solicitante asume la responsabilidad de la preservación, conservación y limpieza del espacio donde se instalará y permanecerá y su área circundante, comprometiéndose al finalizar el mismo a hacer entrega del espacio público en perfectas condiciones de higiene, aseo, salubridad, libre de ocupantes y objetos o muebles a entera satisfacción de las autoridades del Gobierno de la Ciudad de Buenos Aires.",
    "**IV) Contratación de Seguros.** El solicitante declara en este acto, bajo juramento, que contrata las coberturas de seguros correspondientes que cubrirán las reparaciones de los daños que se ocasionaran en los trabajos de instalación, permanencia o desinstalación del andamio, terceros o peatones y/o cosas sin limitación y que las mismas mantendrán indemne el patrimonio del Gobierno de la Ciudad de Buenos Aires en caso de autorizarse el permiso. A tales efectos, consigna en dichos instrumentos la cláusula “sin repetición” y con “endoso a favor del Gobierno de la Ciudad Autónoma de Buenos Aires” o “coasegurado el GCBA”.",
    "#**CLÁUSULA TERCERA - RESPONSABILIDAD**",
    "**I) Responsabilidad Civil y Penal.** El solicitante asume la responsabilidad civil y penal por los daños a terceros, y/o peatones, que por su acción u omisión, pudieran ocurrir en el lugar durante el tiempo que se autorizará el permiso de uso de espacio público para los trabajos de instalación, permanencia o desinstalación del andamio. Asimismo el peticionante se compromete a reparar o reponer todos los faltantes de los elementos componentes del espacio requerido, que involucre el patrimonio de la Ciudad de Buenos Aires.",
    "El solicitante se obliga a dejar las instalaciones en las mismas condiciones en las que fuera encontrado, por lo que asume carácter de depositario y garante del espacio solicitado.",
    "**II) Demandas y Reclamos.** El solicitante se obliga a cumplir con la totalidad de la normativa vigente correspondiente al personal bajo su relación de dependencia y/o que hubiere contratado y/o subcontratado.",
    "En virtud de lo expuesto, el solicitante se obliga a mantener indemne al Gobierno de la Ciudad de Buenos Aires frente a los reclamos de cualquier índole, ya sea previsional, laboral, civil y comercial que el personal dependiente o contratado o subcontratado que pudieran efectuar contra el Gobierno de Ciudad Autónoma de Buenos Aires.",
    "#**CLÁUSULA QUINTA – PROHIBICIONES**",
    "I.-Queda prohibida la instalación de pasacalles, pancartas u objetos similares, en columnas de alumbrados y arbolados.",
    "#**CLÁUSULA SEXTA – JURISDICCIÓN**",
    "En caso de controversia derivada de la interpretación o ejecución de la presente, el solicitante compromete a tratar de solucionarlo de común acuerdo, y en caso de que persistan se someterá a la competencia de los Tribunales en lo Contencioso Administrativo y Tributario de la Ciudad Autónoma de Buenos Aires, renunciando a cualquier otro fuero o jurisdicción que pudiere corresponderle.",
    "Las notificaciones judiciales al Gobierno de la Ciudad Autónoma de Buenos Aires deben practicarse en el domicilio de la Procuración General de la Ciudad, Departamento de Cédulas y Oficios Judiciales, de conformidad a lo dispuesto por el Decreto N° 804-GCBA/09.",
    "#**CLÁUSULA SÉPTIMA – NOTIFICACIONES**",
    "Se deja constancia que las notificaciones que deban efectuarse con relación a la presente serán válidamente realizadas en forma escrita o electrónica en el domicilio físico y/o electrónico denunciado por el solicitante en el encabezamiento, los que se constituyen en domicilio especial a todos los efectos relativos a la presente. Se deja constancia que el domicilio físico establecido por el solicitante en la presente Acta Compromiso, sólo puede variar dentro del ámbito de la Ciudad Autónoma de Buenos Aires, previa comunicación fehaciente.",
    "El solicitante asume -de no otorgarse la solicitud de permiso- que los gastos originados por la tramitación no generan derecho a indemnización alguno y no pueden ser reclamados al Gobierno de Ciudad de Buenos Aires bajo ningún concepto.",
    "El solicitante declara conocer que en caso de otorgarse el permiso peticionado el incumplimiento de los deberes y obligaciones impuestos en normas vigentes y aplicables en la materia, facultará a la autoridad de aplicación del GCBA a revocar el permiso sin que ello genere derecho a indemnización alguna y que las actas de contravención y/o comprobación labradas por la Autoridad en ejercicio del Poder de Policía, serán asentadas en el registro respectivo a los fines de sus antecedentes para peticiones posteriores.",
  ];

  for (const b of bloques) {
    // "#" marca un título de sección: aire antes y que no quede huérfano al pie de la página.
    if (b.startsWith("#")) {
      e.espacio(6);
      e.asegurar(60);
      e.parrafo(b.slice(1), { alineado: "izquierda", despues: 4 });
    } else {
      e.parrafo(b);
    }
  }

  // El cierre va pegado a la firma: si no entran juntos, pasan los dos a la página siguiente
  // (la firma sola en una hoja en blanco parece de otro documento).
  e.asegurar(230);
  e.parrafo("En prueba de conformidad, se firman dos ejemplares de un mismo tenor y a un sólo efecto, en la fecha consignada al principio de este instrumento.");
  e.espacio(18);
  if (firmaPng) e.imagen(await doc.embedPng(firmaPng), 56);
  else e.espacio(56);
  e.linea(200);
  e.parrafo("Firma responsable autorizado", { alineado: "izquierda", despues: 2 });
  e.parrafo(`Aclaración: **${datos.firmante}**`, { alineado: "izquierda", despues: 2 });
  e.parrafo(`Documento: **DNI ${datos.dni}**`, { alineado: "izquierda", despues: 2 });
  e.parrafo(`Entidad: **${ctx.tipoDueno === "persona" ? "Por derecho propio" : ctx.titularNombre}**`, { alineado: "izquierda", despues: 2 });

  pieDeFirma(doc, normal, datos, ctx, !firmaPng);
  return doc.save();
}

/** La nota de ABA. Sin `firmaPng` sale el borrador que el cliente lee antes de firmar. */
export async function generarNotaAutorizacion(
  datos: DatosFirma,
  firmaPng: Uint8Array | null,
  ctx: ContextoFirma,
  logoPng?: Uint8Array | null,
): Promise<Uint8Array> {
  const { doc, normal, negrita, escritor: e } = await nuevoDocumento("Nota de autorización");

  // Membrete de ABA: logo a la izquierda, datos a la derecha, como la plantilla.
  const arriba = A4[1] - MARGEN + 16;
  if (logoPng) {
    const logo = await doc.embedPng(logoPng);
    const alto = 44;
    e.pagina.drawImage(logo, { x: MARGEN, y: arriba - alto, width: (logo.width / logo.height) * alto, height: alto });
  } else {
    e.pagina.drawText("Andamios Buenos Aires", { x: MARGEN, y: arriba - 24, size: 16, font: negrita });
  }
  ["Maturín 2570 (1416) Cap. Fed.", "Tel / fax: 4584-7257", "info@andamiosbuenosaires.com.ar", "www.andamiosbuenosaires.com.ar"].forEach((l, i) => {
    const w = normal.widthOfTextAtSize(l, 9);
    e.pagina.drawText(l, { x: MARGEN + ANCHO - w, y: arriba - 10 - i * 12, size: 9, font: normal, color: rgb(0.25, 0.25, 0.25) });
  });
  e.y = arriba - 90;

  e.parrafo(`Buenos Aires, ${fechaLarga(ctx.firmadoAt)}`, { alineado: "derecha", despues: 28 });
  e.parrafo("Por medio de la presente, solicitamos el correspondiente permiso de implantación de andamios en vía pública, según normativa vigente del GCBA. Para la misma, autorizamos a la firma Emprendimientos y Estructuras S.A (CUIT 30-71111650-4) a realizar la gestión frente al GCBA.", { despues: 14 });
  e.parrafo(`Trabajos a realizar: ${datos.trabajos}.`, { alineado: "izquierda", despues: 10 });
  e.parrafo("Período: 6 meses", { alineado: "izquierda", despues: 26 });
  e.parrafo("Sin otro particular", { alineado: "izquierda", despues: 10 });
  e.parrafo("Saluda Atte.", { alineado: "izquierda", despues: 40 });

  const caracter = ctx.tipoDueno === "persona" ? datos.caracter : `${datos.caracter} de ${ctx.titularNombre}`;
  e.parrafo(`En carácter de: **${caracter}**`, { alineado: "izquierda", despues: 18 });
  e.parrafo("Firma:", { alineado: "izquierda", despues: 0 });
  if (firmaPng) e.imagen(await doc.embedPng(firmaPng), 56, MARGEN + 50);
  else e.espacio(56);
  e.espacio(14);
  e.parrafo(`Aclaración: **${datos.firmante}**`, { alineado: "izquierda", despues: 18 });
  e.parrafo(`DNI: **${datos.dni}**`, { alineado: "izquierda" });

  pieDeFirma(doc, normal, datos, ctx, !firmaPng);
  return doc.save();
}
