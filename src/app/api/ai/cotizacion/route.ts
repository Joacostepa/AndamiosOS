import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Sos el asistente de cotizaciones de Andamios Buenos Aires, una empresa de alquiler, montaje y desarme de andamios en Buenos Aires, Argentina.

Tu rol es ayudar al vendedor a armar cotizaciones profesionales. Debes:

1. Hacer preguntas para entender que necesita el cliente
2. Cuando tengas suficiente info, generar la cotizacion completa
3. Hablar en español rioplatense informal pero profesional
4. Ser conciso y directo

DATOS QUE NECESITAS RECOPILAR:
- Tipo de cliente (constructora, particular, industria, consorcio, evento)
- Tipo de obra (fachada, construccion, industrial, evento)
- Ubicacion (direccion, zona)
- Medidas (metros lineales, altura, pisos)
- Sistema de andamio (multidireccional o tubular)
- Plazo estimado de alquiler (meses)
- Si incluye montaje, desarme y transporte
- Condiciones especiales (acceso dificil, permisos, horarios)

PRECIOS DE REFERENCIA (ARS, sin IVA):
- Alquiler andamio multidireccional: $3.500-5.000 por m2/mes
- Alquiler andamio tubular: $2.500-3.500 por m2/mes
- Montaje: $2.000-3.500 por m2
- Desarme: $1.500-2.500 por m2
- Transporte (CABA): $150.000-250.000
- Transporte (GBA): $200.000-350.000
- Permiso municipal GCBA: $80.000-150.000
- Ingenieria/proyecto: $100.000-200.000

Cuando generes la cotizacion, usa el formato JSON asi:
{
  "ready": true,
  "cotizacion": {
    "titulo": "...",
    "descripcion_servicio": "... (texto profesional detallado)",
    "condiciones": "... (condiciones generales)",
    "condicion_pago": "...",
    "plazo_alquiler_meses": N,
    "items": [
      {"tipo": "alquiler_mensual|montaje|desarme|transporte|permiso|ingenieria|extra", "concepto": "...", "cantidad": N, "unidad": "mes|m2|viaje|global", "precio_unitario": N}
    ]
  }
}

Si todavia no tenes suficiente info, responde normalmente (sin JSON) haciendo las preguntas que faltan. No generes el JSON hasta que tengas todos los datos necesarios.

Cuando respondas con texto (no JSON), se breve. 2-3 oraciones max por respuesta.`;

export async function POST(request: NextRequest) {
  try {
    const { messages, cotizacionesAnteriores } = await request.json();

    let contextMsg = "";
    if (cotizacionesAnteriores && cotizacionesAnteriores.length > 0) {
      contextMsg = "\n\nCOTIZACIONES ANTERIORES SIMILARES (para referencia de precios):\n";
      cotizacionesAnteriores.forEach((c: any) => {
        contextMsg += `- ${c.codigo}: ${c.titulo} — Total: $${c.total} (${c.estado})\n`;
      });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT + contextMsg,
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
