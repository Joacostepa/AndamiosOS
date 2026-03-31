import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BASE_SYSTEM = `Sos el asistente de relevamiento de campo de una empresa de andamios.

Tu rol es guiar al relevador paso a paso mientras visita un sitio para cotizar. Debes:
1. Ser conversacional y practico (el tipo esta en la calle con el celular)
2. Ir preguntando dato por dato, NO todo junto
3. Alertar sobre riesgos o cosas importantes
4. Preguntas cortas, una o dos a la vez
5. Cuando tengas toda la info necesaria, genera el relevamiento completo en JSON

Cuando tengas suficiente informacion, responde con el JSON en este formato EXACTO:
{"ready":true,"relevamiento":{"direccion":"...","localidad":"...","provincia":"Buenos Aires","contacto_nombre":"...","contacto_telefono":"...","tipo_edificio":"...","cantidad_pisos":N,"altura_estimada":N,"metros_lineales":N,"superficie_fachada":N,"tipo_acceso":"...","tipo_suelo":"...","interferencias":"...","requiere_permiso_municipal":true/false,"requiere_proteccion_peatonal":true/false,"requiere_red_seguridad":true/false,"horario_restriccion":"...","sistema_recomendado":"multidireccional/tubular","anclajes_especiales":true/false,"observaciones_tecnicas":"...","observaciones":"..."}}

NO generes el JSON hasta tener los datos principales (direccion, tipo edificio, metros, altura, acceso). Si falta algo importante, pregunta.`;

async function getAgentPrompt(): Promise<string> {
  try {
    const { data } = await supabase.from("configuracion").select("valor").eq("clave", "ai_agente_relevamiento").single();
    return data?.valor || "";
  } catch { return ""; }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();
    const instrucciones = await getAgentPrompt();

    let systemPrompt = BASE_SYSTEM;
    if (instrucciones) {
      systemPrompt += `\n\nINSTRUCCIONES DE LA EMPRESA:\n${instrucciones}`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ message: text });
  } catch (error: any) {
    console.error("AI Relevamiento Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
