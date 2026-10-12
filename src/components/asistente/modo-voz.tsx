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
 *
 * En el celular arranca en "mantener apretado para hablar": el micrófono está mudo y se abre
 * sólo mientras se aprieta el botón grande. En obra hay ruido y gente hablando al lado (26/09:
 * voces de fondo tomadas como del vendedor). "Modo abierto" es el de siempre, de ida y vuelta.
 * El mudo lo maneja el provider (isMuted controlado → conversation.setMicMuted).
 */
export function ModoVoz({ conversacionId, children }: { conversacionId: string; children: (hablar: () => void) => ReactNode }) {
  const [abierto, setAbierto] = useState(() => !(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches));
  const [apretado, setApretado] = useState(false);
  const [silenciado, setSilenciado] = useState(false);
  const mudo = abierto ? silenciado : !apretado;
  return (
    <ConversationProvider key={conversacionId} isMuted={mudo}>
      <Sesion
        conversacionId={conversacionId}
        abierto={abierto}
        onAbierto={(a) => {
          setAbierto(a);
          setApretado(false);
          setSilenciado(false);
        }}
        apretado={apretado}
        onApretado={setApretado}
        silenciado={silenciado}
        onSilenciado={setSilenciado}
      >
        {children}
      </Sesion>
    </ConversationProvider>
  );
}

/** Que la pantalla no se apague mientras se habla (sin esto, a los 30 s se cortaba el audio). */
function usePantallaPrendida(activa: boolean) {
  useEffect(() => {
    if (!activa || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let candado: WakeLockSentinel | null = null;
    let vivo = true;
    const pedir = async () => {
      try {
        const c = await navigator.wakeLock.request("screen");
        if (vivo) candado = c;
        else void c.release().catch(() => {});
      } catch {
        // sin batería, sin permiso o pestaña en segundo plano: se sigue sin el candado
      }
    };
    void pedir();
    // El navegador lo suelta solo al cambiar de app: al volver se pide de nuevo.
    const alVolver = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void candado?.release().catch(() => {});
    };
  }, [activa]);
}

function Sesion({
  conversacionId,
  children,
  abierto,
  onAbierto,
  apretado,
  onApretado,
  silenciado,
  onSilenciado,
}: {
  conversacionId: string;
  children: (hablar: () => void) => ReactNode;
  abierto: boolean;
  onAbierto: (a: boolean) => void;
  apretado: boolean;
  onApretado: (a: boolean) => void;
  silenciado: boolean;
  onSilenciado: (s: boolean) => void;
}) {
  const qc = useQueryClient();
  const [arrancando, setArrancando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [escuchado, setEscuchado] = useState<string | null>(null);

  const refrescar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["asistente-conversacion", conversacionId] });
  }, [qc, conversacionId]);

  const voz = useConversation({
    // "user" = terminó de hablar el vendedor (empieza a pensar); "agent" = lo que dijo el asistente.
    onMessage: ({ role, message }) => {
      setPensando(role === "user");
      if (role === "user") setEscuchado(message);
      refrescar();
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") setPensando(false);
      refrescar();
    },
    onError: (mensaje) => toast.error(`Voz: ${mensaje}`),
    onDisconnect: (d) => {
      setPensando(false);
      setEscuchado(null);
      onApretado(false);
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

  usePantallaPrendida(voz.status === "connected" || voz.status === "connecting");

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

  const conectada = voz.status === "connected";
  const estado: Estado = !conectada ? "conectando" : voz.isSpeaking ? "hablando" : pensando ? "pensando" : "escuchando";
  const titulo =
    estado !== "escuchando" ? TEXTO[estado]
    : abierto ? (silenciado ? "Micrófono apagado" : TEXTO.escuchando)
    : apretado ? "Te escucho: soltá cuando termines"
    : "Mantené apretado para hablar";

  const soltar = () => onApretado(false);

  return (
    <div className="border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center gap-3">
          <Indicador estado={estado} volumen={estado === "hablando" ? voz.getOutputVolume : voz.getInputVolume} silenciado={voz.isMuted} />
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-[16px] font-medium">{titulo}</p>
            <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {escuchado ? `«${escuchado}»` : "Se lo puede interrumpir. Para confirmar algo, decí «sí, dale» o tocá Confirmar en la tarjeta."}
            </p>
          </div>
        </div>

        {!abierto && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={!conectada}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onApretado(true);
                navigator.vibrate?.(10);
              }}
              onPointerUp={soltar}
              onPointerCancel={soltar}
              onLostPointerCapture={soltar}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                  e.preventDefault();
                  onApretado(true);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") soltar();
              }}
              onBlur={soltar}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={apretado}
              aria-label="Mantené apretado para hablar"
              className={cn(
                "flex size-22 touch-none flex-col items-center justify-center gap-0.5 rounded-full border-2 text-[12px] leading-tight font-bold tracking-wide uppercase select-none [-webkit-touch-callout:none] transition-transform disabled:opacity-50",
                apretado ? "scale-105 border-transparent bg-hd-boton text-white shadow-lg" : "border-hd-boton bg-background text-foreground",
              )}
            >
              <Mic className="size-7" />
              <span>{apretado ? "Hablá" : "Mantené"}</span>
              {!apretado && <span>apretado</span>}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1 text-[15px]" onClick={() => onAbierto(!abierto)}>
            {abierto ? "Mantener para hablar" : "Modo abierto"}
          </Button>
          {abierto && (
            <Button
              variant="outline"
              className="h-12 px-3.5 text-[15px]"
              onClick={() => onSilenciado(!silenciado)}
              disabled={!conectada}
              aria-pressed={silenciado}
            >
              {silenciado ? <MicOff /> : <Mic />} {silenciado ? "Activar" : "Silenciar"}
            </Button>
          )}
          <Button variant="destructive" className="h-12 px-4 text-[15px]" onClick={() => voz.endSession()}>
            <PhoneOff /> Cortar
          </Button>
        </div>
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
