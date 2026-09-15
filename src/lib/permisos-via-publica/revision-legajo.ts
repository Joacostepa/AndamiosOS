import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ETIQUETA_DUENO, NOMBRE_DOCUMENTO, formatoCuit, type ChequeoPoliza, type RevisionDocumento, type Tramite } from "./tipos";
import { normalizar, parcelaPorDireccion, type Parcela } from "./catastro";

// Revisión de cada documento que sube el cliente en su portal, apenas lo sube.
//
// Mismo criterio que la póliza: Claude LEE (qué documento es, qué nombre, CUIT y dirección
// trae, si está firmado, si está vigente) y el VEREDICTO sale de reglas en código. El motivo
// que ve el cliente sale de esas reglas, en castellano y sin jerga.
//
// El titular cargado se cruza con los documentos que acreditan al dueño (DNI, poder,
// estatuto, título…). NO con el aviso de obra: el peticionante puede ser cualquiera y no tiene
// que ser el dueño del lote (JS, 2026-09-15, con la primera venta real: S02465). Del aviso sólo
// se controla que sea de la dirección de la obra.
//
// Ante la duda observa (docs/modulo-gestoria-permisos.md § 2): la IA nunca aprueba en
// silencio algo que no pudo leer.

const MODELO = "claude-opus-5";

type Regla = "titular" | "direccion" | "cuit" | "firma" | "vigencia";

/** Qué es cada documento y qué se cruza. */
const CRITERIOS: Record<string, { descripcion: string; reglas: Regla[] }> = {
  aviso_obra: {
    descripcion: "Aviso de obra o permiso de obra (registro de obra) del GCBA, o la constancia de su trámite (DGROC / DGIUR). Tiene que ser de la dirección de la obra; el peticionante puede ser cualquier persona.",
    reglas: ["direccion"],
  },
  acta_asamblea: { descripcion: "Acta de asamblea del consorcio que designa al administrador, legalizada.", reglas: ["vigencia"] },
  reglamento: { descripcion: "Reglamento de copropiedad del edificio de la obra.", reglas: ["direccion"] },
  dni_administrador: { descripcion: "DNI argentino del administrador del consorcio, frente y dorso.", reglas: [] },
  dni_apoderado: { descripcion: "DNI argentino del apoderado de la empresa, frente y dorso.", reglas: [] },
  dni: { descripcion: "DNI argentino del dueño del lote, frente y dorso.", reglas: ["titular"] },
  constancia_cuit: { descripcion: "Constancia de inscripción en ARCA (ex AFIP) del dueño del lote.", reglas: ["cuit"] },
  nota_solicitud: { descripcion: "Nota de solicitud del permiso de uso del espacio público para el andamio, firmada por el representante del dueño.", reglas: ["firma"] },
  acta_compromiso: { descripcion: "Acta de compromiso del GCBA para el permiso de andamio en la vía pública, firmada.", reglas: ["firma"] },
  poder: { descripcion: "Poder otorgado por la empresa dueña del lote, certificado por escribano.", reglas: ["titular"] },
  estatuto: { descripcion: "Estatuto o contrato social de la empresa dueña del lote, certificado.", reglas: ["titular"] },
  acta_directorio: { descripcion: "Acta de directorio o de asamblea que designa las autoridades de la empresa dueña del lote.", reglas: ["titular", "vigencia"] },
  nota_autorizacion: { descripcion: "Nota firmada por el dueño del lote autorizando la instalación del andamio o el trámite del permiso.", reglas: ["firma"] },
  titulo_propiedad: { descripcion: "Título de propiedad (escritura) del inmueble de la obra.", reglas: ["titular", "direccion"] },
  contrato_alquiler: { descripcion: "Contrato de alquiler del inmueble de la obra.", reglas: ["direccion"] },
  nota_dueno: { descripcion: "Nota firmada por el dueño del inmueble autorizando al inquilino a instalar el andamio.", reglas: ["firma"] },
};

const Lectura = z.object({
  tipo_detectado: z.string(),
  es_el_documento_pedido: z.boolean(),
  legible: z.boolean(),
  nombre_que_figura: z.string().nullable(),
  cuit_que_figura: z.string().nullable(),
  direccion_que_figura: z.string().nullable(),
  coincide_titular: z.boolean().nullable(),
  coincide_direccion: z.boolean().nullable(),
  firmado: z.boolean().nullable(),
  vigente: z.boolean().nullable(),
});

const SISTEMA = `Revisás documentos que un cliente sube para tramitar ante el Gobierno de la Ciudad Autónoma de Buenos Aires un permiso de andamio en la vía pública. Te dicen qué documento se pidió, quién es el dueño del lote y dónde es la obra.

Contestá sobre lo que el documento muestra, no sobre lo que debería mostrar. Si algo no se ve o no aplica, contestá null.

- tipo_detectado: qué documento es en realidad, en pocas palabras.
- es_el_documento_pedido: si corresponde al documento pedido. Un documento de otro tipo, aunque sea parecido, es false.
- legible: si se puede leer lo importante. Una foto borrosa, cortada o a la que le falta una cara que se pidió es false.
- nombre_que_figura / cuit_que_figura / direccion_que_figura: el titular, CUIT y dirección que trae el documento, tal cual.
- coincide_titular: si el documento está a nombre del dueño del lote indicado (aceptá diferencias de mayúsculas, abreviaturas como "Cons. de Prop." o el orden de nombre y apellido). null si no nombra a nadie.
- coincide_direccion: si la dirección del documento es la de la obra (misma calle y altura; aceptá abreviaturas). null si no trae dirección.
- firmado: si tiene firma. null si no es un documento que se firme.
- vigente: si a la fecha indicada sigue vigente (mandato, designación). null si no tiene vigencia.`;

type TramiteLegajo = Pick<Tramite, "direccion" | "titular_nombre" | "titular_cuit" | "tipo_dueno">;

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** "21a" → "021A", "063" → "063": como las escribe el catastro. */
const tramoSmp = (s: string) => {
  const m = s.trim().toUpperCase().match(/^0*(\d+)([A-Z]*)$/);
  return m ? `${m[1].padStart(3, "0")}${m[2]}` : s.trim().toUpperCase();
};

/**
 * ¿La dirección que trae el documento es la del lote de la obra? Además del veredicto de la IA
 * (misma calle y altura), acepta:
 *   - la sección/manzana/parcela impresa en el documento igual a la del lote;
 *   - una altura de la misma calle que es otra puerta del mismo lote.
 * Un edificio puede tener varias puertas: el aviso de obra de Guido 1923 vino como "GUIDO 1927 -
 * Sección 011, Manzana 063, Parcela 021a" y el catastro dice que 1923 y 1927 son el lote
 * 011-063-021A (JS, 2026-09-15, S02466). Devuelve el motivo si coincide, o null.
 */
export function direccionDelLote(direccionQueFigura: string | null, lote: Parcela | null): string | null {
  if (!direccionQueFigura || !lote) return null;
  const texto = plano(direccionQueFigura);
  const smp = texto.match(/SECCION\s*:?\s*(\w{1,4})\D+?MANZANA\s*:?\s*(\w{1,4})\D+?PARCELA\s*:?\s*(\w{1,5})/);
  if (smp && `${tramoSmp(smp[1])}-${tramoSmp(smp[2])}-${tramoSmp(smp[3])}` === lote.smp.toUpperCase()) {
    return `Es del mismo lote que la obra (sección ${tramoSmp(smp[1])}, manzana ${tramoSmp(smp[2])}, parcela ${tramoSmp(smp[3])}).`;
  }
  const alturas = new Set((texto.split(/SECCION/)[0].match(/\b\d{1,5}\b/g) ?? []).map(Number));
  const puerta = lote.puertas.find((p) => {
    const palabra = plano(p.calle).replace(/[^A-Z ]/g, " ").split(/\s+/).find((w) => w.length > 2 && !["AV", "AVDA", "DR", "GRAL", "ING"].includes(w));
    return alturas.has(p.altura) && !!palabra && texto.includes(palabra);
  });
  return puerta ? `${puerta.calle} ${puerta.altura} es otra puerta del mismo lote que la obra (${lote.smp}).` : null;
}

/** El lote de la obra en el catastro (parcela y puertas), o null si no se encuentra. */
async function loteDeLaObra(direccion: string): Promise<Parcela | null> {
  const n = await normalizar(direccion).catch(() => null);
  return n ? parcelaPorDireccion(n.codCalle, n.altura).catch(() => null) : null;
}

function chequear(clave: string, l: z.infer<typeof Lectura>, t: TramiteLegajo, lote: Parcela | null = null): ChequeoPoliza[] {
  const nombre = NOMBRE_DOCUMENTO[clave] ?? clave;
  const reglas = CRITERIOS[clave]?.reglas ?? [];
  const titular = t.titular_nombre ?? "el dueño del lote";
  const chequeos: ChequeoPoliza[] = [
    {
      clave: "es_el_documento",
      ok: l.es_el_documento_pedido,
      bloquea: true,
      detalle: l.es_el_documento_pedido ? `Es ${nombre.toLowerCase()}.` : `Esto parece ${l.tipo_detectado.toLowerCase()}, y lo que hace falta es: ${nombre.toLowerCase()}.`,
    },
    {
      clave: "legible",
      ok: l.legible,
      bloquea: true,
      detalle: l.legible ? "Se lee bien." : "No se lee bien o está incompleto: subilo de nuevo más nítido y completo.",
    },
  ];
  // Si no es el documento pedido, cruzar datos no suma: el motivo ya está dicho.
  if (!l.es_el_documento_pedido) return chequeos;

  if (reglas.includes("cuit")) {
    const coincide = (l.cuit_que_figura ?? "").replace(/\D/g, "") === t.titular_cuit;
    chequeos.push({
      clave: "cuit",
      ok: coincide,
      bloquea: true,
      detalle: coincide
        ? `El CUIT coincide con el cargado (${formatoCuit(t.titular_cuit ?? "")}).`
        : l.cuit_que_figura
          ? `La constancia es del CUIT ${l.cuit_que_figura} y el dueño cargado tiene CUIT ${formatoCuit(t.titular_cuit ?? "")}.`
          : "No se ve el CUIT en la constancia.",
    });
  }
  if (reglas.includes("titular") && l.coincide_titular !== null) {
    chequeos.push({
      clave: "titular",
      ok: l.coincide_titular,
      bloquea: true,
      detalle: l.coincide_titular
        ? `Está a nombre de ${titular}.`
        : `Está a nombre de ${l.nombre_que_figura ?? "otra persona"}, y el dueño del lote cargado es ${titular}. Si el dueño es otro, corregilo arriba.`,
    });
  }
  if (reglas.includes("direccion") && l.coincide_direccion !== null) {
    // La IA compara calle y altura; el catastro agrega el caso de un lote con varias puertas.
    const mismoLote = l.coincide_direccion ? null : direccionDelLote(l.direccion_que_figura, lote);
    const ok = l.coincide_direccion || !!mismoLote;
    chequeos.push({
      clave: "direccion",
      ok,
      bloquea: true,
      detalle: l.coincide_direccion
        ? "La dirección coincide con la de la obra."
        : mismoLote ?? `Es de ${l.direccion_que_figura ?? "otra dirección"}, y la obra es en ${t.direccion}.`,
    });
  }
  if (reglas.includes("firma") && l.firmado !== null) {
    chequeos.push({ clave: "firma", ok: l.firmado, bloquea: true, detalle: l.firmado ? "Está firmada." : "Falta la firma." });
  }
  if (reglas.includes("vigencia") && l.vigente !== null) {
    chequeos.push({ clave: "vigencia", ok: l.vigente, bloquea: true, detalle: l.vigente ? "Está vigente." : "No está vigente: hace falta la designación actual." });
  }
  return chequeos;
}

type Tipo = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export function tipoDeArchivo(path: string): Tipo | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

export async function revisarDocumentoCliente(
  archivo: Buffer,
  tipo: Tipo,
  clave: string,
  tramite: TramiteLegajo,
): Promise<RevisionDocumento> {
  const criterio = CRITERIOS[clave];
  // El lote de la obra (parcela y puertas) para aceptar otra puerta del mismo edificio.
  const lote = criterio?.reglas.includes("direccion") ? await loteDeLaObra(tramite.direccion) : null;
  const datos = archivo.toString("base64");
  const bloque: Anthropic.ContentBlockParam =
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: tipo, data: datos } }
      : { type: "image", source: { type: "base64", media_type: tipo, data: datos } };

  const respuesta = await new Anthropic().messages.parse({
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    messages: [{
      role: "user",
      content: [
        bloque,
        {
          type: "text",
          text: [
            `Documento pedido: ${NOMBRE_DOCUMENTO[clave] ?? clave}. ${criterio?.descripcion ?? ""}`,
            `Dueño del lote: ${tramite.titular_nombre ?? "sin cargar"} (CUIT ${tramite.titular_cuit ?? "sin cargar"}${tramite.tipo_dueno ? `, ${ETIQUETA_DUENO[tramite.tipo_dueno].toLowerCase()}` : ""}).`,
            `Obra: ${tramite.direccion}.`,
            `Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.`,
          ].join("\n"),
        },
      ],
    }],
    output_config: { format: zodOutputFormat(Lectura) },
  });

  if (respuesta.stop_reason === "refusal") throw new Error("El modelo no quiso leer el documento");
  if (!respuesta.parsed_output) throw new Error("No se pudo leer el documento");

  return { modelo: MODELO, leido: respuesta.parsed_output, chequeos: chequear(clave, respuesta.parsed_output, tramite, lote) };
}
