import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/fichadas — registrar fichada
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personal_id, tipo, qr_token, latitud, longitud, precision_gps, device_id } = body;

    if (!personal_id || !tipo || !qr_token) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }

    // Validar QR token
    const { data: token } = await supabase
      .from("qr_tokens")
      .select("*, obras(latitud, longitud, geocerca_radio)")
      .eq("token", qr_token)
      .eq("activo", true)
      .single();

    if (!token) {
      return NextResponse.json({ error: "QR invalido o expirado" }, { status: 400 });
    }

    if (new Date(token.expira_at) < new Date()) {
      await supabase.from("qr_tokens").update({ activo: false }).eq("id", token.id);
      return NextResponse.json({ error: "QR expirado. Pedi uno nuevo al supervisor." }, { status: 400 });
    }

    // Validar geocerca
    let dentro_geocerca = true;
    let distancia_obra = 0;
    const obra = token.obras;

    if (obra?.latitud && obra?.longitud && latitud && longitud) {
      distancia_obra = calcularDistancia(latitud, longitud, obra.latitud, obra.longitud);
      const radio = obra.geocerca_radio || 200;
      dentro_geocerca = distancia_obra <= radio;
    }

    // Validar dispositivo
    let estado: string = "valida";

    if (device_id) {
      const { data: dispositivo } = await supabase
        .from("dispositivos_personal")
        .select("*")
        .eq("personal_id", personal_id)
        .eq("device_id", device_id)
        .single();

      if (!dispositivo) {
        // Registrar nuevo dispositivo (pendiente autorizacion)
        await supabase.from("dispositivos_personal").insert({
          personal_id, device_id,
          nombre_dispositivo: body.nombre_dispositivo || "Desconocido",
          autorizado: false,
        });
        estado = "dispositivo_no_autorizado";
      } else if (!dispositivo.autorizado) {
        estado = "dispositivo_no_autorizado";
      } else {
        // Actualizar ultimo uso
        await supabase.from("dispositivos_personal")
          .update({ ultimo_uso: new Date().toISOString() })
          .eq("id", dispositivo.id);
      }
    }

    if (!dentro_geocerca && estado === "valida") {
      estado = "fuera_de_zona";
    }

    // Registrar fichada
    const { data: fichada, error } = await supabase
      .from("fichadas")
      .insert({
        personal_id, tipo,
        obra_id: token.obra_id,
        ubicacion: token.ubicacion,
        latitud, longitud, precision_gps,
        dentro_geocerca, distancia_obra,
        qr_token_id: token.id,
        device_id, estado,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      fichada,
      mensaje: estado === "valida"
        ? `Fichada ${tipo} registrada correctamente`
        : estado === "fuera_de_zona"
        ? `Fichada registrada pero estas fuera de la zona de trabajo (${Math.round(distancia_obra)}m)`
        : "Fichada registrada pero el dispositivo no esta autorizado. Consulta al supervisor.",
    });
  } catch (error: any) {
    console.error("Fichada error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/fichadas?action=generate-qr — generar QR token
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "generate-qr") {
    const obra_id = request.nextUrl.searchParams.get("obra_id");
    const ubicacion = request.nextUrl.searchParams.get("ubicacion") || "obra";

    const token = crypto.randomBytes(32).toString("hex");
    const expira_at = new Date(Date.now() + 60000).toISOString(); // 60 segundos

    const { data, error } = await supabase
      .from("qr_tokens")
      .insert({
        obra_id: obra_id || null,
        ubicacion,
        token,
        expira_at,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ token: data.token, expira_at: data.expira_at });
  }

  return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
}

// Calcular distancia entre dos puntos GPS (formula Haversine)
function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radio de la tierra en metros
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
