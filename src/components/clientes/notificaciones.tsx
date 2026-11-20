"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// «Notificaciones» en la bandeja de clientes (JS, 16/11): activa las notificaciones push en ESTE
// dispositivo. Cada celular o compu se activa por su cuenta. Modos: «Todo» (cada mensaje del
// cliente y cada respuesta de Tomás) o «Sólo lo que me necesita». En el iPhone, sólo andan con
// la app agregada a la pantalla de inicio (iOS 16.4 o más).
//
// El iPhone a veces pierde la suscripción sin avisar: Apple sigue aceptando los avisos y el
// celular no los muestra (JS, 20/11: dejaron de llegar y hubo que activarlas de nuevo). Al abrir
// la bandeja, si este dispositivo las tenía activas y ya no, se reactivan solas (con el permiso
// dado) o la campana avisa en rojo. Se recuerda en el dispositivo cuál era su suscripción, para
// borrar la muerta, y si se desactivaron a propósito, para no reactivarlas.

const API = "/api/comercial/clientes/notificaciones";
type Modo = "todo" | "necesita";
type Estado = { configurado: boolean; clavePublica: string | null; suscripciones: { endpoint: string; modo: Modo; dispositivo: string | null }[] };

const CLAVE_ENDPOINT = "andamios-push-endpoint";
const CLAVE_APAGADA = "andamios-push-apagada";
function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function escribir(clave: string, valor: string | null) {
  try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no se recuerda */ }
}

function claveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pedir(cuerpo: unknown): Promise<void> {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Error ${r.status}`);
}

const esIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${so} · ${nav}`;
}

export function BotonNotificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [soporta, setSoporta] = useState<boolean | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [modo, setModo] = useState<Modo>("todo");
  const [ocupado, setOcupado] = useState(false);
  /** Este dispositivo las tenía activas y las perdió, y no se pudieron reactivar solas. */
  const [perdida, setPerdida] = useState(false);

  const cargar = useCallback(async () => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSoporta(ok);
    if (!ok) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const actual = await reg.pushManager.getSubscription();
      const r = await fetch(API);
      const e = r.ok ? ((await r.json()) as Estado) : null;
      setEstado(e);
      // Una suscripción del navegador que el servidor no conoce (se borró): se ofrece activar de nuevo.
      const conocida = actual && e?.suscripciones.find((s) => s.endpoint === actual.endpoint);
      setSub(conocida ? actual : null);
      if (conocida) {
        setModo(conocida.modo);
        escribir(CLAVE_ENDPOINT, actual.endpoint);
        return;
      }
      // ¿Las tenía activas? Lo recuerda el dispositivo o, si se le borró, el servidor por el nombre.
      const antes = leer(CLAVE_ENDPOINT);
      const nombre = nombreDispositivo();
      const previa = e?.suscripciones.find((s) => s.endpoint === antes) ?? e?.suscripciones.find((s) => s.dispositivo === nombre);
      if (leer(CLAVE_APAGADA) || !(antes || previa) || !e?.configurado || !e.clavePublica) return;
      if (Notification.permission === "granted") {
        try {
          const nueva = actual ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(e.clavePublica) }));
          const m = previa?.modo ?? "todo";
          await registrar(nueva, m, antes ?? previa?.endpoint);
          setSub(nueva);
          setModo(m);
          toast.success("Volví a activar las notificaciones de este dispositivo", { description: "Se habían desactivado solas." });
          return;
        } catch (err) {
          console.error("[notificaciones] no se pudieron reactivar solas", err);
        }
      }
      setPerdida(true);
      toast.warning("Las notificaciones de este dispositivo se desactivaron", { description: "Tocá la campana y activalas de nuevo.", duration: 12_000 });
    } catch (e) {
      console.error("[notificaciones]", e);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Le pasa la suscripción al servidor (y borra la anterior de este dispositivo, si cambió). */
  const registrar = async (s: PushSubscription, m: Modo, anterior?: string | null) => {
    const j = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await pedir({ accion: "activar", suscripcion: { endpoint: j.endpoint, keys: j.keys }, modo: m, dispositivo: nombreDispositivo(), anterior: anterior && anterior !== j.endpoint ? anterior : undefined });
    escribir(CLAVE_ENDPOINT, j.endpoint);
    escribir(CLAVE_APAGADA, null);
    setPerdida(false);
  };

  const activar = async () => {
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        toast.error("El navegador no dio permiso", { description: "Habilitá las notificaciones para este sitio en la configuración del navegador y probá de nuevo." });
        return;
      }
      if (!estado?.configurado || !estado.clavePublica) {
        toast.error("Las notificaciones todavía no están configuradas en el servidor.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const previa = await reg.pushManager.getSubscription();
      const nueva = previa ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(estado.clavePublica) }));
      await registrar(nueva, modo, leer(CLAVE_ENDPOINT));
      setSub(nueva);
      toast.success("Notificaciones activadas en este dispositivo", { description: "Te mando una de prueba." });
      await pedir({ accion: "probar", endpoint: nueva.endpoint }).catch((e: Error) => toast.error(e.message));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron activar.");
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    if (!sub) return;
    setOcupado(true);
    try {
      await pedir({ accion: "desactivar", endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => {});
      escribir(CLAVE_ENDPOINT, null);
      escribir(CLAVE_APAGADA, "1");
      setSub(null);
      toast.success("Notificaciones desactivadas en este dispositivo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setOcupado(false);
    }
  };

  const cambiarModo = async (m: Modo) => {
    setModo(m);
    if (!sub) return;
    await pedir({ accion: "modo", endpoint: sub.endpoint, modo: m }).then(
      () => toast.success(m === "todo" ? "Te llega todo" : "Te llega sólo lo que te necesita"),
      (e: Error) => toast.error(e.message),
    );
  };

  const probar = async () => {
    if (!sub) return;
    setOcupado(true);
    await pedir({ accion: "probar", endpoint: sub.endpoint }).then(() => toast.success("Prueba enviada"), (e: Error) => toast.error(e.message));
    setOcupado(false);
  };

  const Icono = sub ? BellRing : soporta === false || perdida ? BellOff : Bell;
  return (
    <>
      <Button variant="ghost" className="h-10 gap-1.5 px-2.5 text-[13.5px]" onClick={() => setAbierto((x) => !x)} title="Notificaciones en este dispositivo" aria-label="Notificaciones" aria-expanded={abierto}>
        <Icono className={sub ? "size-4 text-hd-boton" : perdida ? "size-4 text-hd-rojo" : "size-4"} />
      </Button>
      {abierto && (
        <div className="absolute top-14 right-0 left-0 z-20 space-y-2 border-b border-border bg-background p-3 text-[13.5px] shadow-md">
          <p className="font-semibold">Notificaciones en este dispositivo</p>
          {perdida && !sub && <p className="text-hd-rojo">Se desactivaron solas (al iPhone a veces le pasa). Activalas de nuevo para que te sigan llegando.</p>}
          {soporta === false ? (
            <p className="text-muted-foreground">
              {esIos() && !instalada()
                ? "En el iPhone primero agregá AndamiosOS a la pantalla de inicio (Compartir → «Agregar a inicio»), abrila desde ahí y activalas."
                : "Este navegador no permite notificaciones. Probá con Chrome, Edge, Firefox o Safari actualizados."}
            </p>
          ) : soporta === null ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Qué te llega">
                {(
                  [
                    ["todo", "Todo", "Cada mensaje del cliente y cada respuesta de Tomás"],
                    ["necesita", "Sólo lo que me necesita", "Charlas que Tomás pasa al equipo, tarjetas esperando el OK, charlas que te pasan y lo que escriben en las tuyas"],
                  ] as const
                ).map(([v, titulo, detalle]) => (
                  <label key={v} className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="modo-notificaciones" className="mt-1 size-4" checked={modo === v} onChange={() => void cambiarModo(v)} />
                    <span>
                      <span className="block font-medium">{titulo}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{detalle}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {sub ? (
                  <>
                    <Button variant="outline" className="h-10" onClick={probar} disabled={ocupado}>Mandar una de prueba</Button>
                    <Button variant="ghost" className="h-10 text-destructive" onClick={desactivar} disabled={ocupado}>Desactivar</Button>
                  </>
                ) : (
                  <Button className="h-10" onClick={activar} disabled={ocupado}>
                    {ocupado ? <Loader2 className="animate-spin" /> : <BellRing />} Activar notificaciones
                  </Button>
                )}
                <Button variant="ghost" className="h-10" onClick={() => setAbierto(false)}>Cerrar</Button>
              </div>
              {esIos() && !instalada() && <p className="text-[12.5px] text-muted-foreground">En el iPhone, sólo andan con la app agregada a la pantalla de inicio.</p>}
              {estado && !estado.configurado && <p className="text-[12.5px] text-hd-rojo">Falta configurar las claves en el servidor.</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
