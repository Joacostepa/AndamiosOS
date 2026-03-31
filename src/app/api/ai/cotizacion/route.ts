import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_SYSTEM = `Sos el asistente de cotizaciones de una empresa de andamios.

Tu rol es ayudar al vendedor a armar cotizaciones. Debes:
1. Hacer preguntas cortas para entender que necesita el cliente
2. Cuando tengas suficiente info, generar la cotizacion completa en JSON
3. Ser conciso (2-3 oraciones max por respuesta)

DATOS QUE NECESITAS:
- Tipo de obra (fachada, construccion, industrial, evento)
- Ubicacion
- Medidas (metros lineales, altura o pisos)
- Sistema de andamio (multidireccional o tubular)
- Plazo de alquiler (meses)
- Condiciones especiales

Cuando generes la cotizacion, responde con el JSON en este formato EXACTO (dentro del texto):
{"ready":true,"cotizacion":{"titulo":"...","descripcion_servicio":"...","condiciones":"...","condicion_pago":"...","plazo_alquiler_meses":N,"items":[{"tipo":"alquiler_mensual","concepto":"...","cantidad":N,"unidad":"mes","precio_unitario":N}]}}

Tipos de item validos: alquiler_mensual, montaje, desarme, transporte, permiso, ingenieria, extra, descuento.

NO generes el JSON hasta tener todos los datos necesarios. Si falta info, pregunta.`;

async function getCustomPrompt(): Promise<{ instrucciones: string; estilo: string }> {
  try {
    const { data } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["ai_prompt_cotizacion", "ai_prompt_estilo"]);

    const instrucciones = data?.find((c) => c.clave === "ai_prompt_cotizacion")?.valor || "";
    const estilo = data?.find((c) => c.clave === "ai_prompt_estilo")?.valor || "";

    return { instrucciones, estilo };
  } catch {
    return { instrucciones: "", estilo: "" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages, cotizacionesAnteriores } = await request.json();

    const { instrucciones, estilo } = await getCustomPrompt();

    let systemPrompt = BASE_SYSTEM;

    if (instrucciones) {
      systemPrompt += `\n\nINSTRUCCIONES DE LA EMPRESA:\n${instrucciones}`;
    }

    if (estilo) {
      systemPrompt += `\n\nESTILO DE COMUNICACION:\n${estilo}`;
    }

    if (cotizacionesAnteriores && cotizacionesAnteriores.length > 0) {
      systemPrompt += "\n\nCOTIZACIONES ANTERIORES (referencia):\n";
      cotizacionesAnteriores.forEach((c: any) => {
        systemPrompt += `- ${c.codigo}: ${c.titulo} — $${c.total} (${c.estado})\n`;
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ message: text });
  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar" },
      { status: 500 }
    );
  }
}
