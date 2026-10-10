import { NextRequest, NextResponse } from "next/server";
import { procesarUpdate } from "@/lib/hoja-dia/publico";
import { secretoValido } from "@/lib/hoja-dia/telegram";

// POST /api/telegram/webhook — el bot de la Hoja del día (src/lib/hoja-dia/telegram.ts).
//
// Público en el proxy y protegido por el secreto que se registró con setWebhook
// (scripts/telegram-webhook.mjs): Telegram lo manda en X-Telegram-Bot-Api-Secret-Token.
// Falla cerrado: sin TELEGRAM_WEBHOOK_SECRET configurado, todo es 401.
//
// Atiende "/start <código>" (vincular a una persona) y los botones (Recibido, Entendido,
// Hecho, No pude con su motivo). Es idempotente por update_id. Contesta 200 aunque algo
// falle adentro: si no, Telegram reintenta el mismo update en loop.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!secretoValido(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  if (!update || typeof update.update_id !== "number") return NextResponse.json({ ok: true });
  try {
    await procesarUpdate(update);
  } catch (e) {
    console.error("[telegram] no se pudo procesar el update", update.update_id, e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
