// Lectura de la Carátula (IF-…) de un expediente de permiso de andamios en TAD.
//
// La carátula es el PDF que arma el GCBA con lo que se cargó en el formulario. Ejemplo
// real (EX-2026-40769757): "Domicilio de donde se colocara / Calle y altura: LAPRIDA 1845 /
// Barrio: RECOLETA / Comuna: Comuna 2 / Sección: 015 / Manzana: 142 / Parcela: 014b".
//
// OJO CON LOS DOS DOMICILIOS: el mismo PDF trae después el "Domicilio comercial en CABA" de
// Emprendimientos y Estructuras (Maturín 2570) con las mismas etiquetas. Los datos de la
// obra se leen SÓLO del tramo entre "Domicilio de donde se colocara" y "Datos persona".
import { extractText, getDocumentProxy } from "unpdf";

const ETIQUETAS = [
  "Calle y altura", "Barrio", "Comuna", "Sección", "Manzana", "Parcela", "Código de planeamiento urbano",
  "Piso", "Departamento", "Código postal", "Razón social", "CUIT", "Primer nombre", "Segundo nombre",
  "Tercer nombre", "Primer apellido", "Segundo apellido", "Tercer apellido", "Tipo de documento",
  "N° de documento", "Tipo Societario", "Actividad Principal", "CUIT/CUIL", "Teléfono", "E-mail",
  "Desde cuando estará instalado", "Hasta cuando estará instalado", "Compañía",
  "Vigencia del seguro de responsabilidad social \\(vencimiento\\)", "Carácter", "Solicitud", "Personería",
];
const SIGUIENTE = `(?=\\s*(?:${ETIQUETAS.join("|")}|Datos persona|Datos del Representante|Domicilio comercial|Datos de contacto|Fechas de la solicitud|Seguro|Declaración jurada|Importante|Digitally signed)\\s*:?|$)`;

function campo(texto, etiqueta) {
  // (.+?) y no (.*?): "Comuna: Comuna 2" empieza con el nombre de otra etiqueta y con un
  // valor vacío permitido el corte caía antes de leer nada.
  const m = texto.match(new RegExp(`${etiqueta}\\s*:\\s*(.+?)${SIGUIENTE}`, "s"));
  const v = m?.[1]?.replace(/\s+/g, " ").trim();
  return v && v !== "null" ? v : null;
}

function fecha(v) {
  const m = v?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Texto plano del PDF, páginas unidas. */
export async function textoDePdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Datos de la obra que trae la carátula. null si el texto no parece una carátula de andamios. */
export function parsearCaratula(texto) {
  if (!/Domicilio de donde se colocara/i.test(texto)) return null;
  const obra = texto.split(/Domicilio de donde se colocara/i)[1].split(/Datos persona/i)[0];
  const calle = campo(obra, "Calle y altura");
  return {
    direccion: calle ? calle.replace(/\b([A-ZÁÉÍÓÚÑ]+)\b/g, (p) => p.charAt(0) + p.slice(1).toLowerCase()) : null,
    barrio: campo(obra, "Barrio"),
    comuna: campo(obra, "Comuna"),
    seccion: campo(obra, "Sección"),
    manzana: campo(obra, "Manzana"),
    parcela: campo(obra, "Parcela"),
    pedido_desde: fecha(campo(texto, "Desde cuando estará instalado")),
    pedido_hasta: fecha(campo(texto, "Hasta cuando estará instalado")),
    seguro_compania: campo(texto, "Compañía"),
    seguro_vence: fecha(campo(texto, "Vigencia del seguro de responsabilidad social \\(vencimiento\\)")),
    contacto_mail: campo(texto.split(/Datos de contacto/i)[1] ?? "", "E-mail"),
  };
}
