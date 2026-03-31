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

const SYSTEM_HOGARENO = `Sos el asistente de cotizaciones de alquiler hogareño de una empresa de andamios.

Tu rol es ayudar al vendedor a cotizar alquiler de módulos y tablones para trabajos domésticos.

DATOS QUE NECESITAS RECOLECTAR:
- Qué trabajo va a hacer el cliente (pintura, reparación, limpieza, etc.)
- Altura necesaria (pisos o metros)
- Si necesita movilidad (ruedas)
- Zona de entrega (para calcular flete)
- Fracción de días (10, 20 o 30)

TU ROL DE ASESOR:
- Recomendá cantidad de módulos según la altura y el trabajo
- Recomendá tamaño de módulos (1.00m, 1.50m, 2.00m)
- Indicá cuántos tablones necesita para trabajar cómodo
- Si el trabajo requiere mover el andamio, recomendá ruedas

ITEMS DE COTIZACIÓN:
- tipo "alquiler_fraccion": módulos, tablones, ruedas (concepto describe el producto, unidad "un" o "juego")
- tipo "flete": envío y retiro (concepto "Flete envío" y "Flete retiro")
- tipo "extra": adicionales
- tipo "descuento": descuentos`;

const SYSTEM_MULTIDIRECCIONAL = `Sos el asistente de cotizaciones de alquiler multidireccional de una empresa de andamios.

Tu rol es ayudar al vendedor a cotizar alquiler de andamio multidireccional por tonelada.

DATOS QUE NECESITAS RECOLECTAR:
- Tipo de trabajo y uso del andamio
- Tonelaje estimado
- Plazo de alquiler (meses)
- Ubicación
- Tipo de cliente (directo, constructora, subcontratista, industria, gobierno)
- Urgencia (normal, urgente, muy urgente)

CONSIDERACIONES DE PRECIO:
- El precio base es por tonelada/mes
- La urgencia puede justificar un recargo
- Clientes recurrentes o grandes volúmenes pueden tener descuento
- El stock disponible puede afectar la negociación

ITEMS DE COTIZACIÓN:
- tipo "alquiler_mensual": alquiler por tonelada/mes
- tipo "transporte": flete de entrega y retiro
- tipo "extra": adicionales
- tipo "descuento": descuentos`;

const SYSTEM_ARMADO_DESARME = `Sos el asistente de cotizaciones de armado y desarme de una empresa de andamios.

Tu rol es ayudar al vendedor a cotizar servicios completos de armado, desarme y alquiler de andamios.

DATOS QUE NECESITAS RECOLECTAR:
- Rubro (fachadas, industria, eventos, obra pública, construcción, estructuras especiales)
- Tipo de trabajo específico
- Ubicación
- Dimensiones (metros lineales, altura, pisos)
- Plazo de alquiler (meses)
- Si incluye montaje, desarme, transporte

POR RUBRO:
- FACHADAS: tipo de edificio, metros lineales, pisos. Precios de mercado.
- INDUSTRIA: requisitos de seguridad, exámenes médicos, exigencias de planta. Mayor profesionalismo.
- EVENTOS: fecha, duración, horarios de montaje.
- OBRA PÚBLICA: nro licitación, organismo, plazo contractual.
- CONSTRUCCIÓN: etapa de obra, metros cubiertos.
- ESTRUCTURAS ESPECIALES: descripción técnica detallada.

ITEMS DE COTIZACIÓN:
- tipo "montaje": mano de obra de armado
- tipo "desarme": mano de obra de desarme
- tipo "alquiler_mensual": alquiler mensual de material
- tipo "transporte": flete
- tipo "permiso": permisos municipales u otros
- tipo "ingenieria": cálculo, planos, dirección técnica
- tipo "extra": adicionales
- tipo "descuento": descuentos`;

const FIELD_UPDATE_INSTRUCTIONS = `

IMPORTANTE - ACTUALIZACIONES DE FORMULARIO:
Cuando tengas información suficiente para llenar campos del formulario, SIEMPRE agregá al final de tu respuesta un bloque con el separador exacto "---FIELD_UPDATES---" seguido de un JSON con los campos a actualizar.

Formato:
<tu respuesta conversacional>

---FIELD_UPDATES---
{"field_updates":{"titulo":"...","items":[{"tipo":"...","concepto":"...","cantidad":1,"unidad":"un","precio_unitario":0}]}}

Campos que podés actualizar: titulo, descripcion_servicio, condiciones, condicion_pago, items, fraccion_dias, zona_entrega, tipo_trabajo_cliente, tonelaje_estimado, plazo_alquiler_meses, urgencia, ubicacion, sub_vertical, incluye_montaje, incluye_desarme, incluye_transporte, metadata.

Reglas:
- Actualizá campos progresivamente a medida que el usuario da info
- Siempre incluí TODOS los items actualizados (no parciales)
- NO generes el bloque si no tenés info nueva para actualizar
- Sé conciso en la respuesta conversacional (2-3 oraciones max)
- Si te faltan datos, preguntá antes de generar items con precio 0`;

function getSystemPrompt(
  unidad: string,
  subVertical?: string
): string {
  let base: string;
  switch (unidad) {
    case "hogareno":
      base = SYSTEM_HOGARENO;
      break;
    case "multidireccional":
      base = SYSTEM_MULTIDIRECCIONAL;
      break;
    case "armado_desarme":
      base = SYSTEM_ARMADO_DESARME;
      break;
    default:
      base = SYSTEM_ARMADO_DESARME;
  }

  if (subVertical && unidad === "armado_desarme") {
    base += `\n\nRUBRO SELECCIONADO: ${subVertical}. Enfocá tus preguntas en este rubro.`;
  }

  return base + FIELD_UPDATE_INSTRUCTIONS;
}

const UNIDAD_CONFIG_KEYS: Record<string, string> = {
  hogareno: "ai_agente_hogareno",
  multidireccional: "ai_agente_multidireccional",
  armado_desarme: "ai_agente_armado_desarme",
};

async function getCustomPrompt(unidad: string): Promise<{
  instrucciones: string;
  estilo: string;
  instruccionesUnidad: string;
}> {
  try {
    const configKey = UNIDAD_CONFIG_KEYS[unidad] || "";
    const claves = ["ai_prompt_cotizacion", "ai_prompt_estilo"];
    if (configKey) claves.push(configKey);

    const { data } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", claves);

    const instrucciones =
      data?.find((c) => c.clave === "ai_prompt_cotizacion")?.valor || "";
    const estilo =
      data?.find((c) => c.clave === "ai_prompt_estilo")?.valor || "";
    const instruccionesUnidad =
      configKey ? data?.find((c) => c.clave === configKey)?.valor || "" : "";

    return { instrucciones, estilo, instruccionesUnidad };
  } catch {
    return { instrucciones: "", estilo: "", instruccionesUnidad: "" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      unidad_cotizacion,
      sub_vertical,
      formValues,
      cotizacionesAnteriores,
    } = await request.json();

    const unidad = unidad_cotizacion || "armado_desarme";
    const { instrucciones, estilo, instruccionesUnidad } =
      await getCustomPrompt(unidad);

    let systemPrompt = getSystemPrompt(unidad, sub_vertical);

    if (instruccionesUnidad) {
      systemPrompt += `\n\nINSTRUCCIONES ESPECÍFICAS DE ESTA UNIDAD (configuradas por la empresa):\n${instruccionesUnidad}`;
    }

    if (instrucciones) {
      systemPrompt += `\n\nINSTRUCCIONES GENERALES DE LA EMPRESA:\n${instrucciones}`;
    }

    if (estilo) {
      systemPrompt += `\n\nESTILO DE COMUNICACION:\n${estilo}`;
    }

    if (formValues) {
      systemPrompt += `\n\nESTADO ACTUAL DEL FORMULARIO:\n${JSON.stringify(formValues, null, 2)}`;
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

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ message: text });
  } catch (error: any) {
    console.error("AI Error:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar" },
      { status: 500 }
    );
  }
}
