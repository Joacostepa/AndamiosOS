import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_MESSAGES = 20;
const WHATSAPP = "11-2734-4214";

const BASE_SYSTEM = `Sos el asistente virtual de cotizaciones de Andamios Buenos Aires.
Estás atendiendo a un CLIENTE FINAL que quiere alquilar andamio para un trabajo hogareño.

TU OBJETIVO: Entender qué necesita, asesorarlo con los productos correctos y generar la cotización completa.

FLUJO DE CONVERSACIÓN:
1. Saludá y preguntá qué trabajo necesita hacer
2. Según el trabajo, recomendá módulos, tablones y accesorios
3. Preguntá zona de entrega (para calcular flete)
4. Preguntá por cuántos días necesita (fracción: 10, 20 o 30 días)
5. Preguntá nombre completo y teléfono del cliente
6. Cuando tengas TODOS los datos, generá la cotización

SÉ:
- Amable y profesional
- Conciso (2-3 oraciones por respuesta)
- Proactivo con recomendaciones (ej: "para pintar un frente de 2 pisos te recomiendo 2 módulos apilados")
- Claro con los precios (siempre decí que son + IVA)

ITEMS DE COTIZACIÓN:
- tipo "alquiler_fraccion": módulos, tablones, ruedas, tornillos
- tipo "flete": flete envío y retiro
- tipo "extra": adicionales o ajuste mínimo operativo`;

const COTIZACION_INSTRUCTIONS = `

GENERACIÓN AUTOMÁTICA DE COTIZACIÓN:
Cuando tengas TODOS estos datos:
- Qué productos necesita (módulos, tablones, etc.)
- Zona de entrega
- Fracción de días (10, 20 o 30)
- Nombre del cliente
- Teléfono del cliente

Entonces generá la cotización incluyendo el separador:

---COTIZACION_READY---
{"cotizacion":{"titulo":"...","cliente_nombre":"...","cliente_telefono":"...","zona_entrega":"...","fraccion_dias":30,"descripcion_servicio":"...","condicion_pago":"Contado","items":[{"tipo":"alquiler_fraccion","concepto":"...","cantidad":1,"unidad":"un","precio_unitario":0}]}}

REGLAS:
- Incluí siempre el flete según la zona
- Si el subtotal queda por debajo del mínimo operativo, agregá un item tipo "extra" con concepto "Ajuste mínimo operativo" con la diferencia
- Usá los precios EXACTOS de la lista
- NO generes la cotización hasta tener TODOS los datos
- Después de generar, decile al cliente que la cotización está lista para descargar`;

async function getConfig(): Promise<{
  instrucciones: string;
  estilo: string;
  fletes: string;
  minimo: number;
}> {
  try {
    const { data: configs } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", [
        "ai_agente_hogareno",
        "ai_prompt_estilo",
        "minimo_hogareno",
      ]);

    const instrucciones =
      configs?.find((c) => c.clave === "ai_agente_hogareno")?.valor || "";
    const estilo =
      configs?.find((c) => c.clave === "ai_prompt_estilo")?.valor || "";
    const minimo = Number(
      configs?.find((c) => c.clave === "minimo_hogareno")?.valor || "0"
    );

    const { data: fletesData } = await supabase
      .from("fletes_zona")
      .select("zona, precio")
      .eq("activo", true)
      .order("zona");

    let fletes = "";
    if (fletesData && fletesData.length > 0) {
      fletes = "\n\nTABLA DE FLETES POR ZONA (envío + retiro incluido):";
      fletesData.forEach((f: any) => {
        fletes += `\n- ${f.zona}: $${Number(f.precio).toLocaleString("es-AR")}`;
      });
    }

    return { instrucciones, estilo, fletes, minimo };
  } catch {
    return { instrucciones: "", estilo: "", fletes: "", minimo: 0 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages, messageCount } = await request.json();

    // Rate limit por conversación
    if (messageCount > MAX_MESSAGES) {
      return NextResponse.json({
        message: `Llegaste al límite de mensajes de esta conversación. Para seguir, contactanos por WhatsApp al ${WHATSAPP} y te atendemos personalmente.`,
        limited: true,
      });
    }

    const { instrucciones, estilo, fletes, minimo } = await getConfig();

    let systemPrompt = BASE_SYSTEM;

    if (instrucciones) {
      systemPrompt += `\n\nINSTRUCCIONES DE LA EMPRESA:\n${instrucciones}`;
    }

    if (fletes) {
      systemPrompt += fletes;
      systemPrompt +=
        "\n\nIMPORTANTE: Buscá el precio de flete en la tabla. Si la zona no está, indicalo y sugerí contactar por WhatsApp.";
    }

    if (minimo > 0) {
      systemPrompt += `\n\nMÍNIMO OPERATIVO: $${minimo.toLocaleString("es-AR")}. Si el subtotal queda por debajo, agregá un item extra "Ajuste mínimo operativo" con la diferencia.`;
    }

    if (estilo) {
      systemPrompt += `\n\nESTILO DE COMUNICACION:\n${estilo}`;
    }

    systemPrompt += COTIZACION_INSTRUCTIONS;

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

    // Check if cotización is ready - try multiple patterns
    const separator = "---COTIZACION_READY---";
    let idx = text.indexOf(separator);
    // Also try without dashes in case AI varies format
    if (idx === -1) idx = text.indexOf("COTIZACION_READY");
    // Try to find JSON with cotizacion key
    const jsonMatch = text.match(/\{"cotizacion"\s*:\s*\{[\s\S]*\}\s*\}/);

    if (idx !== -1 || jsonMatch) {
      const message = idx !== -1
        ? text.slice(0, idx).trim()
        : text.slice(0, jsonMatch!.index).trim();
      const jsonStr = idx !== -1
        ? text.slice(idx).replace(/^-*COTIZACION_READY-*\s*/, "").trim()
        : jsonMatch![0];

      try {
        const parsed = JSON.parse(jsonStr);
        const cotData = parsed.cotizacion;

        // Create client
        let clienteId: string | null = null;
        try {
          const { data: cliente } = await supabase
            .from("clientes")
            .insert({
              razon_social: cotData.cliente_nombre,
              telefono: cotData.cliente_telefono,
              estado: "activo",
            })
            .select("id")
            .single();
          clienteId = cliente?.id || null;
        } catch {
          // Client may already exist, try to find by name
          const { data: existing } = await supabase
            .from("clientes")
            .select("id")
            .eq("razon_social", cotData.cliente_nombre)
            .limit(1)
            .single();
          clienteId = existing?.id || null;
        }

        // Build conversation log (include the final assistant message)
        const conversacion = [
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
          { role: "assistant", content: message },
        ];

        // Create cotización
        const items = cotData.items || [];
        const { data: cot, error } = await supabase
          .from("cotizaciones")
          .insert({
            codigo: "",
            titulo: cotData.titulo,
            cliente_id: clienteId,
            descripcion_servicio: cotData.descripcion_servicio || "",
            condiciones:
              "- Precios expresados en pesos argentinos + IVA\n- Plazo de validez: 30 días\n- No incluye permisos municipales salvo indicación expresa",
            condicion_pago: cotData.condicion_pago || "Contado",
            unidad_cotizacion: "hogareno",
            fraccion_dias: cotData.fraccion_dias,
            zona_entrega: cotData.zona_entrega,
            generado_por_ia: true,
            metadata: { conversacion },
          })
          .select()
          .single();

        if (error) throw error;

        if (items.length > 0) {
          const dbItems = items.map((item: any, i: number) => ({
            cotizacion_id: cot.id,
            tipo: item.tipo,
            concepto: item.concepto,
            detalle: item.detalle || null,
            cantidad: item.cantidad,
            unidad: item.unidad || "un",
            precio_unitario: item.precio_unitario,
            subtotal: item.cantidad * item.precio_unitario,
            orden: i,
          }));
          await supabase.from("cotizacion_items").insert(dbItems);
        }

        return NextResponse.json({
          message,
          cotizacion_id: cot.id,
          cotizacion_codigo: cot.codigo,
        });
      } catch (parseError) {
        console.error("Cotizacion parse/create error:", parseError);
        // Strip JSON from visible message so client never sees raw data
        const cleanMsg = message || "¡Tu cotización está casi lista! Hubo un inconveniente técnico. Por favor contactanos por WhatsApp para finalizarla.";
        return NextResponse.json({ message: cleanMsg });
      }
    }

    return NextResponse.json({ message: text });
  } catch (error: any) {
    console.error("Public AI Error:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar" },
      { status: 500 }
    );
  }
}
