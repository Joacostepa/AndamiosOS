import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { sistema, altura, metros_lineales, pisos, tipo_obra, observaciones } = await request.json();

    // Get catalog pieces
    const { data: catalogo } = await supabase
      .from("catalogo_piezas")
      .select("codigo, descripcion, categoria, sistema_andamio")
      .eq("activo", true);

    const catalogoText = catalogo?.map((p) => `${p.codigo}: ${p.descripcion} (${p.categoria}, ${p.sistema_andamio})`).join("\n") || "";

    const prompt = `Sos un ingeniero experto en andamios. Necesito que calcules las piezas necesarias para este trabajo:

DATOS DEL PROYECTO:
- Sistema de andamio: ${sistema}
- Altura: ${altura}m
- Metros lineales: ${metros_lineales}m
- Pisos: ${pisos}
- Tipo de obra: ${tipo_obra || "general"}
${observaciones ? `- Observaciones: ${observaciones}` : ""}

CATALOGO DE PIEZAS DISPONIBLES:
${catalogoText}

REGLAS DE CALCULO:
- Marcos: 2 por cada modulo (2.5m de ancho) por cada nivel (2m de alto)
- Diagonales: 1 por modulo por nivel (alternando)
- Plataformas: en cada nivel de trabajo (cada 2 niveles)
- Bases regulables: 2 por modulo (solo planta baja)
- Barandillas: perimetro superior + niveles de trabajo
- Rodapies: en cada plataforma
- Anclajes a pared: cada 3 niveles por modulo
- Escaleras: acceso cada 2-3 niveles
- Agrega un 10% de margen por perdidas/ajustes

Responde EXCLUSIVAMENTE con un JSON array en este formato, sin texto adicional:
[{"codigo":"MF-200-MD","cantidad":40,"motivo":"8 modulos x 5 niveles x 2 marcos (con 10% margen)"},...]

Usa SOLO codigos que existan en el catalogo. Ajusta las cantidades a numeros enteros.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ items });
    }

    return NextResponse.json({ items: [], error: "No se pudo generar el computo" });
  } catch (error: any) {
    console.error("AI Computo Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
