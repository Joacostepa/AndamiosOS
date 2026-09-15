// Lectura del permiso emitido (la Resolución RESOL-…-GCABA-SSGOU que llega como
// "NOTIFICACION PERMISO.-").
//
// DE DÓNDE SALE CADA FECHA (verificado sobre los 5 permisos del 2026-09-14):
//   - Emitido el: el texto dice "desde la suscripción de la presente", sin fecha. La firma
//     digital no queda en el texto, pero el GCBA genera el PDF al firmar: CreationDate del
//     documento (p. ej. D:20260909163648-03'00' → 2026-09-09).
//   - Vence: "hasta el día 24 de febrero de 2027, inclusive" o, en resoluciones más viejas,
//     "hasta las 24 horas del día 30 de diciembre de 2026". Puede ser MENOR a lo pedido en
//     la carátula (se pidió 09/03/2027 en un caso y salió hasta 24/02/2027).
import { extractText, getDocumentProxy } from "unpdf";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const p2 = (n) => String(n).padStart(2, "0");

/** { emitido_el, vence } en YYYY-MM-DD; cualquiera de los dos puede ser null. */
export async function parsearPermiso(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { info } = await pdf.getMetadata();
  const { text } = await extractText(pdf, { mergePages: true });

  const c = String(info?.CreationDate ?? "").match(/^D:(\d{4})(\d{2})(\d{2})/);
  const emitido_el = c ? `${c[1]}-${c[2]}-${c[3]}` : null;

  const plano = text.replace(/\s+/g, " ");
  // "de 2027" o "del 2026": las dos formas aparecen en resoluciones reales.
  const h = plano.match(/hasta [^.;]{0,40}?(\d{1,2}) de ([a-záéíóú]+) del? (\d{4})/i);
  const mes = h ? MESES.indexOf(h[2].toLowerCase().replace("setiembre", "septiembre")) : -1;
  const vence = h && mes >= 0 ? `${h[3]}-${p2(mes + 1)}-${p2(h[1])}` : null;

  return { emitido_el, vence };
}
