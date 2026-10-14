"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, MicOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Voz en vivo: hablar con el asistente de ida y vuelta, como por teléfono.
//
// ElevenLabs escucha, maneja los turnos y habla (se lo puede interrumpir); el que piensa es el
// MISMO asistente del chat: ElevenLabs llama a …/voz/llm como si fuera su modelo y ahí corre el
// turno con las mismas herramientas y el mismo borrador. Todo queda en la conversación, así que
// el hilo, el presupuesto y las tarjetas se actualizan mientras se habla, y una acción se puede
// confirmar diciendo "sí, dale" o con el botón de la tarjeta.
//
// El micrófono y el audio del navegador necesitan un toque del usuario: por eso la sesión arranca
// directo desde el botón "Hablar" del compositor, no desde un efecto.

type Estado = "conectando" | "escuchando" | "pensando" | "hablando";

const TEXTO: Record<Estado, string> = {
  conectando: "Conectando…",
  escuchando: "Te escucho",
  pensando: "Pensando…",
  hablando: "Hablando",
};

async function pedirSesion(conversacionId: string): Promise<{ conversationToken: string; sesion: string }> {
  const res = await fetch("/api/comercial/asistente/voz/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversacionId }),
  });
  const j = (await res.json().catch(() => null)) as { conversationToken?: string; sesion?: string; error?: string } | null;
  if (!res.ok || !j?.conversationToken || !j.sesion) throw new Error(j?.error ?? `Error ${res.status}`);
  return { conversationToken: j.conversationToken, sesion: j.sesion };
}

/**
 * Envuelve al compositor: mientras no hay sesión muestra `children(hablar)`; con la sesión
 * abierta, el panel de voz en su lugar. Una sesión por conversación (cambiar de charla la corta).
 */
export function ModoVoz({ conversacionId, children }: { conversacionId: string; children: (hablar: () => void) => ReactNode }) {
  return (
    <ConversationProvider key={conversacionId}>
      <Sesion conversacionId={conversacionId}>{children}</Sesion>
    </ConversationProvider>
  );
}

function Sesion({ conversacionId, children }: { conversacionId: string; children: (hablar: () => void) => ReactNode }) {
  const qc = useQueryClient();
  const [arrancando, setArrancando] = useState(false);
  const [pensando, setPensando] = useState(false);

  const refrescar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["asistente-conversacion", conversacionId] });
  }, [qc, conversacionId]);

  const voz = useConversation({
    // "user" = terminó de hablar el vendedor (empieza a pensar); "agent" = lo que dijo el asistente.
    onMessage: ({ role }) => {
      setPensando(role === "user");
      refrescar();
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") setPensando(false);
      refrescar();
    },
    onError: (mensaje) => toast.error(`Voz: ${mensaje}`),
    onDisconnect: (d) => {
      setPensando(false);
      if (d.reason === "error") toast.error(`Se cortó la voz: ${d.message}`);
      refrescar();
      qc.invalidateQueries({ queryKey: ["asistente-conversaciones"] });
    },
  });

  // Mientras piensa corren las herramientas (y cambia el presupuesto): se refresca la pantalla.
  useEffect(() => {
    if (!pensando) return;
    const t = setInterval(refrescar, 3000);
    return () => clearInterval(t);
  }, [pensando, refrescar]);

  const { startSession } = voz;
  const hablar = useCallback(async () => {
    if (arrancando) return;
    setArrancando(true);
    try {
      // El permiso del micrófono primero, todavía dentro del toque del botón.
      const prueba = await navigator.mediaDevices.getUserMedia({ audio: true });
      prueba.getTracks().forEach((t) => t.stop());
      const { conversationToken, sesion } = await pedirSesion(conversacionId);
      startSession({ conversationToken, connectionType: "webrtc", customLlmExtraBody: { asistente: sesion } });
    } catch (e) {
      const sinPermiso = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      toast.error(sinPermiso ? "Para hablar hay que permitir el micrófono en el navegador." : e instanceof Error ? e.message : "No se pudo arrancar la voz.");
    } finally {
      setArrancando(false);
    }
  }, [arrancando, conversacionId, startSession]);

  const activa = arrancando || voz.status === "connecting" || voz.status === "connected";
  if (!activa) return <>{children(() => void hablar())}</>;

  const estado: Estado = voz.status !== "connected" ? "conectando" : voz.isSpeaking ? "hablando" : pensando ? "pensando" : "escuchando";

  return (
    <div className="border-t border-border bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-xl items-center gap-4">
        <Indicador estado={estado} volumen={estado === "hablando" ? voz.getOutputVolume : voz.getInputVolume} silenciado={voz.isMuted} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{voz.isMuted && estado === "escuchando" ? "Micrófono apagado" : TEXTO[estado]}</p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            Se lo puede interrumpir. Para confirmar algo, decí «sí, dale» o tocá Confirmar en la tarjeta.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => voz.setMuted(!voz.isMuted)}
          disabled={voz.status !== "connected"}
          aria-label={voz.isMuted ? "Prender el micrófono" : "Apagar el micrófono"}
        >
          {voz.isMuted ? <MicOff /> : <Mic />}
        </Button>
        <Button variant="destructive" size="icon" onClick={() => voz.endSession()} aria-label="Cortar">
          <PhoneOff />
        </Button>
      </div>
    </div>
  );
}

/** Un círculo que late con la voz (la del vendedor cuando escucha, la del asistente cuando habla). */
function Indicador({ estado, volumen, silenciado }: { estado: Estado; volumen: () => number; silenciado: boolean }) {
  const aro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (estado === "conectando" || estado === "pensando") {
      aro.current?.style.setProperty("transform", "scale(1)");
      return;
    }
    let cuadro = 0;
    const latir = () => {
      const nivel = silenciado && estado === "escuchando" ? 0 : Math.min(1, volumen() * 3);
      aro.current?.style.setProperty("transform", `scale(${1 + nivel * 0.45})`);
      cuadro = requestAnimationFrame(latir);
    };
    cuadro = requestAnimationFrame(latir);
    return () => cancelAnimationFrame(cuadro);
  }, [estado, volumen, silenciado]);

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center">
      <div
        ref={aro}
        className={cn(
          "absolute inset-0 rounded-full transition-transform duration-75",
          estado === "hablando" ? "bg-primary/25" : "bg-muted",
          estado === "pensando" && "animate-pulse bg-primary/15",
        )}
      />
      <div className={cn("relative flex size-9 items-center justify-center rounded-full", estado === "hablando" ? "bg-primary text-primary-foreground" : "bg-background text-foreground shadow-sm")}>
        {estado === "conectando" || estado === "pensando" ? <Loader2 className="size-4 animate-spin" /> : silenciado && estado === "escuchando" ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </div>
    </div>
  );
}
