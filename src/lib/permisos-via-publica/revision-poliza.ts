import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ChequeoPoliza, RevisionPoliza, Tramite } from "./tipos";

// Revisión de la póliza de RC que sube el productor, antes de presentarla en TAD.
//
// DOS PASOS A PROPÓSITO: Claude LEE el PDF y devuelve lo que dice (quiénes son coasegurados,
// a favor de quién está la no repetición, suma, vigencia); el VEREDICTO lo decide este
// código comparando contra el trámite. Así "¿está bien?" no depende de cómo el modelo
// interprete lo que pide el Gobierno, y cada observación se puede explicar con una regla.
//
// LO QUE CAUSÓ LAS SUBSANACIONES (ver docs/modulo-gestoria-permisos.md § Póliza): el GCBA
// pide el titular del lote como COASEGURADO y la cláusula de NO REPETICIÓN a favor del
// GCBA. Son dos listas distintas con dos sujetos distintos, y se venían confundiendo.

const MODELO = "claude-opus-5";
const CUIT_GCBA = "34999032089";
const SUMA_MINIMA = 1_000_000;

const Entidad = z.object({ nombre: z.string(), cuit: z.string().nullable() });

const Leido = z.object({
  es_poliza: z.boolean(),
  compania: z.string().nullable(),
  numero_poliza: z.string().nullable(),
  vigencia_hasta: z.string().nullable(),
  suma_asegurada: z.number().nullable(),
  coasegurados: z.array(Entidad),
  no_repeticion_a_favor: z.array(Entidad),
  gcba_asegurado_adicional: z.boolean(),
  indemnidad_gcba: z.boolean(),
});

const SISTEMA = `Leés pólizas y certificados de cobertura de responsabilidad civil que un productor de seguros emite para Emprendimientos y Estructuras S.A. (Andamios Buenos Aires). Se presentan al Gobierno de la Ciudad Autónoma de Buenos Aires (GCBA) para obtener permisos de andamio en la vía pública.

Extraé lo que el documento dice, tal cual está escrito. No completes con lo que debería decir: si algo no aparece, dejalo en null, en lista vacía o en false.

- es_poliza: si el documento es una póliza o certificado de cobertura de responsabilidad civil.
- vigencia_hasta: fin de la vigencia, en formato AAAA-MM-DD.
- suma_asegurada: la suma asegurada de responsabilidad civil en pesos, como número.
- coasegurados: quiénes figuran como coasegurados o asegurados adicionales, con su CUIT si figura.
- no_repeticion_a_favor: a favor de quiénes está la cláusula de no repetición (o de renuncia a la subrogación), con su CUIT si figura.
- gcba_asegurado_adicional: true sólo si el GCBA figura como asegurado adicional o coasegurado.
- indemnidad_gcba: true sólo si el documento dice expresamente que se mantiene la indemnidad del GCBA.

Las dos listas se confunden seguido y hay que separarlas con cuidado: una misma entidad puede estar en las dos, en una sola o en ninguna. Copiá cada nombre en la lista donde el documento lo pone.`;

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const esGcba = (e: z.infer<typeof Entidad>) =>
  digitos(e.cuit) === CUIT_GCBA || /GOBIERNO DE LA CIUDAD|G\.?\s?C\.?\s?B\.?\s?A\b|CIUDAD AUT[OÓ]NOMA DE BUENOS AIRES/i.test(e.nombre);

/** Un PDF encriptado (aunque se abra sin contraseña) lo rechaza TAD al adjuntarlo. */
function estaEncriptado(pdf: Buffer): boolean {
  return pdf.includes("/Encrypt");
}

function chequear(leido: z.infer<typeof Leido>, tramite: Pick<Tramite, "titular_nombre" | "titular_cuit" | "permiso_hasta">): ChequeoPoliza[] {
  const titular = tramite.titular_cuit ?? "";
  const nombreTitular = tramite.titular_nombre ?? "el titular del lote";
  const coasegurado = leido.coasegurados.some((c) => digitos(c.cuit) === titular);
  const titularEnNoRepeticion = leido.no_repeticion_a_favor.some((c) => digitos(c.cuit) === titular);

  return [
    {
      clave: "es_poliza",
      ok: leido.es_poliza,
      bloquea: true,
      detalle: leido.es_poliza ? "Es una póliza de responsabilidad civil." : "El archivo no parece una póliza de responsabilidad civil.",
    },
    {
      clave: "coasegurado",
      ok: coasegurado,
      bloquea: true,
      detalle: coasegurado
        ? `${nombreTitular} figura como coasegurado.`
        : titularEnNoRepeticion
          ? `${nombreTitular} está en la cláusula de no repetición, pero tiene que figurar como COASEGURADO.`
          : `Falta ${nombreTitular} (CUIT ${titular}) como coasegurado.`,
    },
    {
      clave: "no_repeticion_gcba",
      ok: leido.no_repeticion_a_favor.some(esGcba),
      bloquea: true,
      detalle: leido.no_repeticion_a_favor.some(esGcba)
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

export async function revisarPoliza(
  pdf: Buffer,
  tramite: Pick<Tramite, "titular_nombre" | "titular_cuit" | "permiso_hasta">,
): Promise<RevisionPoliza> {
  if (estaEncriptado(pdf)) {
    return {
      modelo: null,
      leido: null,
      chequeos: [{
        clave: "encriptado",
        ok: false,
        bloquea: true,
        detalle: "El PDF está protegido o encriptado y TAD lo rechaza. Hay que mandarlo sin protección.",
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
        { type: "text", text: "Leé este documento y completá los datos." },
      ],
    }],
    output_config: { format: zodOutputFormat(Leido) },
  });

  if (respuesta.stop_reason === "refusal") throw new Error("El modelo no quiso leer el documento");
  if (!respuesta.parsed_output) throw new Error("No se pudieron leer los datos de la póliza");

  return { modelo: MODELO, leido: respuesta.parsed_output, chequeos: chequear(respuesta.parsed_output, tramite) };
}
