import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDocumentProxy } from "unpdf";
import { z } from "zod";
import type { ChequeoPoliza, RevisionPoliza, Tramite } from "./tipos";

// Revisión de la póliza de RC que sube el productor, antes de presentarla en TAD.
//
// DOS PASOS A PROPÓSITO: Claude LEE el PDF y contesta preguntas concretas sobre ESTE titular;
// el VEREDICTO lo decide este código. Así "¿está bien?" no depende de cómo el modelo
// interprete lo que pide el Gobierno, y cada observación se puede explicar con una regla.
//
// NO SE LE PIDE LA LISTA DE COASEGURADOS: un endoso real de La Mercantil Andina (15/09) trae
// 20 páginas con cientos de coasegurados y cláusulas de no repetición. Transcribirlas corta
// la respuesta; preguntar "¿figura este CUIT como coasegurado?" no.
//
// LO QUE CAUSÓ LAS SUBSANACIONES (ver docs/modulo-gestoria-permisos.md § Póliza): el GCBA
// pide el titular del lote como COASEGURADO y la cláusula de NO REPETICIÓN a favor del
// GCBA. Son dos listas distintas con dos sujetos distintos, y se venían confundiendo.

const MODELO = "claude-opus-5";
const SUMA_MINIMA = 1_000_000;

const Leido = z.object({
  es_poliza: z.boolean(),
  compania: z.string().nullable(),
  numero_poliza: z.string().nullable(),
  vigencia_hasta: z.string().nullable(),
  suma_asegurada: z.number().nullable(),
  titular_como_coasegurado: z.boolean(),
  titular_en_no_repeticion: z.boolean(),
  como_figura_titular: z.string().nullable(),
  gcba_en_no_repeticion: z.boolean(),
  gcba_asegurado_adicional: z.boolean(),
  indemnidad_gcba: z.boolean(),
});

const SISTEMA = `Leés pólizas, endosos y certificados de cobertura de responsabilidad civil que un productor de seguros emite para Emprendimientos y Estructuras S.A. (Andamios Buenos Aires). Se presentan al Gobierno de la Ciudad Autónoma de Buenos Aires (GCBA) para obtener permisos de andamio en la vía pública. Suelen traer listas largas de coasegurados y de cláusulas de no repetición con muchas empresas y consorcios.

Contestá sobre lo que el documento dice, no sobre lo que debería decir. Si algo no aparece, contestá null o false.

- es_poliza: si es una póliza, endoso o certificado de cobertura de responsabilidad civil.
- vigencia_hasta: fin de la vigencia, en formato AAAA-MM-DD.
- suma_asegurada: la suma asegurada de responsabilidad civil en pesos, como número.
- titular_como_coasegurado: si el titular indicado figura en la lista de coasegurados o asegurados adicionales. Buscalo por CUIT y por nombre.
- titular_en_no_repeticion: si el titular figura en la cláusula de no repetición (o renuncia a la subrogación).
- como_figura_titular: el texto exacto con el que aparece el titular, si aparece.
- gcba_en_no_repeticion: si el Gobierno de la Ciudad Autónoma de Buenos Aires (GCBA, CUIT 34-99903208-9) figura en la cláusula de no repetición.
- gcba_asegurado_adicional: si el GCBA figura como asegurado adicional o coasegurado.
- indemnidad_gcba: si dice expresamente que se mantiene la indemnidad del GCBA.

Las listas de coasegurados y de no repetición se confunden seguido: una misma entidad puede estar en las dos, en una sola o en ninguna. Contestá cada pregunta mirando la lista que corresponde.`;

/**
 * Si el PDF pide contraseña para ABRIRSE. Es lo único que rechaza TAD: muchas pólizas vienen
 * con protección de permisos (no imprimir, no copiar) y se abren igual — la del 15/09 tenía
 * /Encrypt y siempre se subió sin problema. Buscar /Encrypt en los bytes las frenaba a todas.
 */
async function pideContrasena(pdf: Buffer): Promise<boolean> {
  try {
    await getDocumentProxy(new Uint8Array(pdf));
    return false;
  } catch (e) {
    return (e as { name?: string })?.name === "PasswordException";
  }
}

type TramitePoliza = Pick<Tramite, "titular_nombre" | "titular_cuit" | "permiso_hasta">;

function chequear(leido: z.infer<typeof Leido>, tramite: TramitePoliza): ChequeoPoliza[] {
  const nombreTitular = tramite.titular_nombre ?? "el titular del lote";
  return [
    {
      clave: "es_poliza",
      ok: leido.es_poliza,
      bloquea: true,
      detalle: leido.es_poliza ? "Es una póliza de responsabilidad civil." : "El archivo no parece una póliza de responsabilidad civil.",
    },
    {
      clave: "coasegurado",
      ok: leido.titular_como_coasegurado,
      bloquea: true,
      detalle: leido.titular_como_coasegurado
        ? `${nombreTitular} figura como coasegurado${leido.como_figura_titular ? ` ("${leido.como_figura_titular}")` : ""}.`
        : leido.titular_en_no_repeticion
          ? `${nombreTitular} está en la cláusula de no repetición, pero tiene que figurar como COASEGURADO.`
          : `Falta ${nombreTitular} (CUIT ${tramite.titular_cuit}) como coasegurado.`,
    },
    {
      clave: "no_repeticion_gcba",
      ok: leido.gcba_en_no_repeticion,
      bloquea: true,
      detalle: leido.gcba_en_no_repeticion
        ? "Tiene la cláusula de no repetición a favor del GCBA."
        : "Falta la cláusula de no repetición a favor del Gobierno de la Ciudad Autónoma de Buenos Aires (CUIT 34-99903208-9).",
    },
    {
      clave: "suma",
      ok: (leido.suma_asegurada ?? 0) > SUMA_MINIMA,
      bloquea: true,
      detalle:
        leido.suma_asegurada === null
          ? "No se encontró la suma asegurada."
          : leido.suma_asegurada > SUMA_MINIMA
            ? `Suma asegurada de $${leido.suma_asegurada.toLocaleString("es-AR")}.`
            : `La suma asegurada ($${leido.suma_asegurada.toLocaleString("es-AR")}) tiene que ser mayor a $1.000.000.`,
    },
    {
      clave: "vigencia",
      ok: !!leido.vigencia_hasta && (!tramite.permiso_hasta || leido.vigencia_hasta >= tramite.permiso_hasta),
      bloquea: true,
      detalle: !leido.vigencia_hasta
        ? "No se encontró hasta cuándo es la vigencia."
        : tramite.permiso_hasta && leido.vigencia_hasta < tramite.permiso_hasta
          ? `La vigencia termina el ${leido.vigencia_hasta} y el permiso va hasta el ${tramite.permiso_hasta}.`
          : `Vigente hasta el ${leido.vigencia_hasta}.`,
    },
    // Lo pide la ficha oficial del trámite, pero las subsanaciones reales nunca lo
    // observaron: se muestra para que se vea, y no frena.
    {
      clave: "asegurado_adicional_gcba",
      ok: leido.gcba_asegurado_adicional,
      bloquea: false,
      detalle: leido.gcba_asegurado_adicional
        ? "El GCBA figura como asegurado adicional."
        : "No dice que el GCBA sea asegurado adicional (lo pide la ficha del trámite; hasta ahora no lo observaron).",
    },
    {
      clave: "indemnidad_gcba",
      ok: leido.indemnidad_gcba,
      bloquea: false,
      detalle: leido.indemnidad_gcba
        ? "Deja constancia de la indemnidad del GCBA."
        : "No menciona la indemnidad del GCBA (lo pide la ficha del trámite; hasta ahora no lo observaron).",
    },
  ];
}

export async function revisarPoliza(pdf: Buffer, tramite: TramitePoliza): Promise<RevisionPoliza> {
  if (await pideContrasena(pdf)) {
    return {
      modelo: null,
      leido: null,
      chequeos: [{
        clave: "contrasena",
        ok: false,
        bloquea: true,
        detalle: "El PDF pide contraseña para abrirse y TAD lo rechaza. Hay que mandarlo sin contraseña.",
      }],
    };
  }

  const client = new Anthropic();
  const respuesta = await client.messages.parse({
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
        { type: "text", text: `Titular del lote: ${tramite.titular_nombre ?? "sin nombre"}, CUIT ${tramite.titular_cuit ?? "sin CUIT"}.` },
      ],
    }],
    output_config: { format: zodOutputFormat(Leido) },
  });

  if (respuesta.stop_reason === "refusal") throw new Error("El modelo no quiso leer el documento");
  if (!respuesta.parsed_output) throw new Error("No se pudieron leer los datos de la póliza");

  return { modelo: MODELO, leido: respuesta.parsed_output, chequeos: chequear(respuesta.parsed_output, tramite) };
}
