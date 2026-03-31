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

CONTEXTO COMERCIAL:
El vendedor ya cargó datos comerciales en el formulario (tipo de cliente, etapa, urgencia, rol del contacto, competencia).
Usá esa info para adaptar tu tono y sugerencias. Por ejemplo:
- Si busca precio → sugerí opciones económicas
- Si busca profesionalismo → enfatizá calidad, certificaciones, ingeniería
- Si hay competencia → sé más agresivo en la propuesta
- Si está listo para contratar → sé directo y eficiente

FACHADAS tiene 2 productos:
1. ANDAMIO COMPLETO: estructura completa con bandeja fenólico en PB, escaleras, tablones y mediasombra.
   - Se cotiza por m² (base x altura)
   - Items: canon locativo (alquiler mensual), mano de obra montaje, mano de obra desarme, transporte, ingeniería

2. BANDEJA DE PROTECCIÓN PEATONAL: bandeja debajo del primer balcón para silleteros.
   - Se cotiza por metro lineal
   - Más económica
   - Items: canon locativo, mano de obra montaje, mano de obra desarme, transporte

OTROS RUBROS:
- INDUSTRIA: requisitos de seguridad, exámenes médicos, exigencias de planta. Mayor profesionalismo.
- EVENTOS: fecha, duración, horarios de montaje. Escenarios, tribunas.
- OBRA PÚBLICA: nro licitación, organismo, plazo contractual.
- CONSTRUCCIÓN: etapa de obra, metros cubiertos. Torres, plataformas.
- ESTRUCTURAS ESPECIALES: descripción técnica detallada. Ingeniería a medida.

ITEMS DE COTIZACIÓN:
- tipo "alquiler_mensual": canon locativo (alquiler mensual de material)
- tipo "montaje": mano de obra de armado
- tipo "desarme": mano de obra de desarme
- tipo "transporte": flete ida y vuelta
- tipo "ingenieria": memoria de cálculo, planos, firma profesional
- tipo "permiso": permisos municipales u otros
- tipo "extra": adicionales (S&H por jornada, modificaciones, etc.)
- tipo "descuento": descuentos

FORMATO DE LA PROPUESTA:
Esta cotización es una "Propuesta Técnica-Económica", no una simple tabla de items.
El vendedor necesita que lo ayudes a:
1. Redactar el alcance del trabajo (descripcion_servicio)
2. Determinar los items y valores
3. Definir condiciones de pago (generalmente 50% anticipo, 50% finalización montaje)
4. Incluir condiciones (ajuste CAC mensual, validez 15 días, etc.)`;

const FIELD_UPDATE_INSTRUCTIONS = `

IMPORTANTE - ACTUALIZACIONES DE FORMULARIO:
Cuando tengas información suficiente para llenar campos del formulario, SIEMPRE agregá al final de tu respuesta un bloque con el separador exacto "---FIELD_UPDATES---" seguido de un JSON con los campos a actualizar.

Formato:
<tu respuesta conversacional>

---FIELD_UPDATES---
{"field_updates":{"titulo":"...","items":[{"tipo":"...","concepto":"...","cantidad":1,"unidad":"un","precio_unitario":0}]}}

Campos que podés actualizar: titulo, descripcion_servicio, condiciones, condicion_pago, items, fraccion_dias, zona_entrega, tipo_trabajo_cliente, tonelaje_estimado, plazo_alquiler_meses, urgencia, ubicacion, sub_vertical, incluye_montaje, incluye_desarme, incluye_transporte, metadata (objeto con cualquier dato adicional), nuevo_cliente.

Dentro de metadata podés poner: tipo_producto_fachada, fachada_base, fachada_altura, metros_lineales, tipo_edificio, pisos, etc.

Para crear un nuevo cliente, usá el campo "nuevo_cliente" con: {"nombre": "...", "telefono": "..."}.

CLIENTE:
- Si no hay cliente seleccionado en el formulario, preguntá nombre completo y teléfono del cliente
- Pedilo naturalmente durante la conversación, no todo junto al principio
- Con nombre y teléfono es suficiente para arrancar

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

    // Para hogareño: inyectar fletes y mínimo operativo
    if (unidad === "hogareno") {
      try {
        const { data: fletes } = await supabase
          .from("fletes_zona")
          .select("zona, precio")
          .eq("activo", true)
          .order("zona");
        if (fletes && fletes.length > 0) {
          systemPrompt += "\n\nTABLA DE FLETES POR ZONA (envío + retiro incluido):";
          fletes.forEach((f: any) => {
            systemPrompt += `\n- ${f.zona}: $${Number(f.precio).toLocaleString("es-AR")}`;
          });
          systemPrompt += "\n\nIMPORTANTE: Cuando el cliente indique una zona, buscá el precio de flete en esta tabla y agregalo como item tipo 'flete' con el concepto 'Flete envío y retiro - [ZONA]'. Si la zona no está en la lista, indicalo y preguntá si quiere cotizar con un valor aproximado.";
        }

        const { data: minConfig } = await supabase
          .from("configuracion")
          .select("valor")
          .eq("clave", "minimo_hogareno")
          .single();
        if (minConfig?.valor) {
          systemPrompt += `\n\nMÍNIMO OPERATIVO: $${Number(minConfig.valor).toLocaleString("es-AR")}. Si el subtotal de la cotización queda por debajo de este mínimo, el total debe ser $${Number(minConfig.valor).toLocaleString("es-AR")}. En ese caso, agregá un item tipo 'extra' con concepto 'Ajuste mínimo operativo' con la diferencia para llegar al mínimo.`;
        }
      } catch {
        // silently continue if fletes/config not available
      }
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
