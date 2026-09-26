import { NextResponse } from "next/server";
import { hayVoz } from "@/lib/voz/elevenlabs";
import { exigirModulo } from "../../_comun";

// GET /api/comercial/asistente/voz — qué de la voz está configurado, para mostrar u ocultar
// el micrófono y el botón "Hablar".

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirModulo("asistente-comercial", "ver");
  if (quien instanceof NextResponse) return quien;
  return NextResponse.json(hayVoz());
}
