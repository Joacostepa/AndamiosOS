import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getPrompts(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", [
        "ai_agente_descripcion",
        "ai_plantilla_descripcion_breve",
        "ai_plantilla_descripcion_tecnica",
      ]);
    const result: Record<string, string> = {};
    data?.forEach((c) => { result[c.clave] = c.valor; });
    return result;
  } catch { return {}; }
}

export async function POST(request: NextRequest) {
  try {
    const { tipo, contexto, texto_original, campo } = await request.json();
    const prompts = await getPrompts();

    let prompt = "";
    if (tipo === "mejorar") {
      // Use configurable template based on field type
      const plantillaKey = campo === "descripcion tecnica"
        ? "ai_plantilla_descripcion_tecnica"
        : "ai_plantilla_descripcion_breve";
      const plantilla = prompts[plantillaKey] || "";

      if (plantilla) {
        prompt = `${plantilla}

Texto original:
${texto_original}

Contexto del trabajo:
${JSON.stringify(contexto, null, 2)}`;
      } else {
        // Fallback if no template configured
        prompt = `Mejorá la redacción del siguiente texto para una propuesta técnica-económica profesional de una empresa de andamios.

Texto original:
${texto_original}

Contexto del trabajo:
${JSON.stringify(contexto, null, 2)}

Reglas:
- Mantené el sentido y los datos originales
- Hacelo más profesional y técnico
- Usá vocabulario del rubro de andamios y construcción
- Máximo 300 palabras
- Sin formato markdown, sin títulos
- Respondé SOLO con el texto mejorado`;
      }
    } else if (tipo === "descripcion") {
      prompt = `Genera una descripcion tecnica profesional para una cotizacion de andamios con estos datos:
${JSON.stringify(contexto, null, 2)}

La descripcion debe incluir:
- Que servicio se presta (alquiler, montaje, desarme)
- Especificaciones tecnicas
- Que incluye el servicio
- Referencia a normativas de seguridad

Responde SOLO con el texto de la descripcion, sin titulos ni formato markdown. Maximo 200 palabras.`;
    } else if (tipo === "condiciones") {
      prompt = `Genera las condiciones generales profesionales para una cotizacion de alquiler de andamios.

Debe incluir clausulas sobre:
1. Alcance del servicio
2. Validez de la cotizacion
3. Forma de pago
4. Plazo de montaje
5. Responsabilidades del cliente (custodia, no modificar, acceso)
6. Seguridad e inspecciones
7. Seguros (RC y ART)
8. Precios (sin IVA)

Responde SOLO con el texto de las condiciones, numeradas. Sin titulo. Maximo 300 palabras.`;
    }

    const instrucciones = prompts.ai_agente_descripcion || "";
    if (instrucciones) {
      prompt += `\n\nINSTRUCCIONES ADICIONALES DE LA EMPRESA:\n${instrucciones}`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ text });
  } catch (error: any) {
    console.error("AI Description Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
