import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { cotizacion_id, cotizacion_data } = await request.json();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Analizá esta cotización de andamios y extraé tags estructurados para poder comparar con cotizaciones futuras similares.

Datos de la cotización:
${JSON.stringify(cotizacion_data, null, 2)}

Respondé SOLO con un JSON válido con estos campos (usá null si no hay dato):
{
  "tipo_edificio": "edificio_ph" | "casa" | "ph" | "comercial" | "industrial" | "otro" | null,
  "pisos": number | null,
  "metros_cuadrados": number | null,
  "metros_lineales": number | null,
  "zona": string | null,
  "tipo_producto": "andamio_completo" | "bandeja_peatonal" | "multidireccional" | "modular" | null,
  "sub_vertical": string | null,
  "servicios": ["montaje", "desarme", "alquiler", "transporte", "ingenieria"],
  "duracion_meses": number | null,
  "complejidad": "baja" | "media" | "alta" | null,
  "rango_precio_total": "bajo" | "medio" | "alto" | null,
  "cantidad_items": number,
  "tiene_ingenieria": boolean,
  "tiene_permisos": boolean
}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "No JSON found" }, { status: 400 });
    }

    const tags = JSON.parse(jsonMatch[0]);

    // Update cotización metadata with tags
    if (cotizacion_id) {
      const { data: existing } = await supabase
        .from("cotizaciones")
        .select("metadata")
        .eq("id", cotizacion_id)
        .single();

      const currentMetadata = (existing?.metadata as Record<string, unknown>) || {};
      await supabase
        .from("cotizaciones")
        .update({ metadata: { ...currentMetadata, ai_tags: tags } })
        .eq("id", cotizacion_id);
    }

    return NextResponse.json({ tags });
  } catch (error: any) {
    console.error("AI Categorize Error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
