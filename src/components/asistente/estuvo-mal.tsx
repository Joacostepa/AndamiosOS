"use client";

import { useState } from "react";
import { Loader2, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ETIQUETA_MOTIVO, MOTIVOS_FEEDBACK, type MotivoFeedback } from "@/lib/asistente/feedback";

// «Esto estuvo mal»: un pulgar abajo debajo de la última respuesta de cada turno. Abre una hoja
// con el motivo (chips) y un texto opcional, y lo guarda atado al turno. Es el método de
// correcciones acordado el 26/09: marcar en el momento, revisar después en Parámetros → Uso.
//
// Autocontenido a propósito (el hilo sólo lo pone con el turno): no toca el estado del chat.

export function EstuvoMal({ turnoId }: { turnoId: string }) {
  const [abierta, setAbierta] = useState(false);
  const [motivo, setMotivo] = useState<MotivoFeedback | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [marcado, setMarcado] = useState(false);

  async function enviar() {
    if (!motivo) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/comercial/asistente/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnoId, motivo, texto: texto.trim() || null }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Error ${res.status}`);
      }
      setMarcado(true);
      setAbierta(false);
      toast.success("Anotado. Gracias: con esto se corrige.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anotar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label="Esto estuvo mal"
        title="Esto estuvo mal"
        className={`-ml-2.5 inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted ${marcado ? "text-destructive" : "text-muted-foreground/60 hover:text-foreground"}`}
      >
        <ThumbsDown className="size-4" fill={marcado ? "currentColor" : "none"} />
      </button>
      <Sheet open={abierta} onOpenChange={setAbierta}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <SheetTitle className="text-[17px] font-semibold">¿Qué estuvo mal?</SheetTitle>
            <SheetDescription className="mt-0.5 text-[13px]">Queda guardado con esta respuesta para revisarla.</SheetDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_FEEDBACK.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                aria-pressed={motivo === m}
                className={`min-h-11 rounded-full border px-4 text-[14px] transition-colors ${motivo === m ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
              >
                {ETIQUETA_MOTIVO[m]}
              </button>
            ))}
          </div>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Si querés, contá qué esperabas (opcional)"
            className="text-[15px]"
          />
          <Button onClick={enviar} disabled={!motivo || enviando} className="h-12 w-full text-[15px]">
            {enviando && <Loader2 className="size-4 animate-spin" />} Anotar
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
