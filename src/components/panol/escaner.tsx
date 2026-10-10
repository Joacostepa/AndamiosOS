"use client";

// El escáner de QR y códigos de barras del Pañol.
//
// ─── API ────────────────────────────────────────────────────────────────────
//
//   <Escaner
//     onCodigo={(texto) => …}   // obligatorio: el texto CRUDO leído (o escrito a mano).
//                               // Para un QR de etiqueta es la URL entera
//                               // (https://…/p/E7K2QX); pelala con normalizarCodigo()
//                               // de src/lib/panol/kiosco.ts, o pasala tal cual a
//                               // resolverCodigo(), que la limpia igual.
//     pausado={false}           // true: deja de leer SIN cortar la cámara (p. ej. mientras
//                               // se procesa un código o hay un diálogo abierto).
//     ayuda="Acercá tu credencial."   // texto opcional sobre la imagen.
//     className="h-72"          // alto del visor (por defecto h-72). El ancho es el del padre.
//     etiquetaEscribir="Escribir el código"   // texto del botón de carga manual.
//   />
//
//   apagarCamara()              // corta la cámara (no hace falta llamarlo entre pantallas).
//
// Lo que garantiza:
//   - UNA sola cámara para toda la pestaña: el MediaStream vive a nivel de módulo, así que
//     desmontar y volver a montar el escáner (cambiar de pantalla) no vuelve a pedir
//     permiso ni apaga la luz de la cámara. La primera vez se pide con el botón «Activar
//     cámara»: en iPhone tiene que salir de un toque (y ese toque también habilita el
//     pitido). Si el navegador ya tiene el permiso dado, arranca sola.
//   - Cámara trasera (facingMode: environment), lectura cada ~150 ms y el MISMO código no
//     se entrega dos veces en 1,5 s (sostener la etiqueta frente a la cámara no suma de a
//     uno por cuadro). Lo escrito a mano siempre se entrega.
//   - Pitido (WebAudio) y vibración, si el equipo la tiene, en cada lectura.
//   - Linterna sólo si la cámara la soporta (applyConstraints torch: Android sí, iPhone no).
//   - «Escribir el código» siempre visible, aunque no haya cámara o no se haya dado permiso.
//
// EL LECTOR: `barcode-detector` (ponyfill). Donde el navegador trae BarcodeDetector nativo
// (Chrome en Android) se usa ése; donde no (Safari en iPhone, Firefox) se usa ZXing en
// WebAssembly. El .wasm se sirve DESDE NUESTRO DOMINIO, no desde un CDN: el kiosco no puede
// depender de jsDelivr para leer una etiqueta.
//
//   Paso al actualizar `barcode-detector` / `zxing-wasm`: copiar el binario nuevo a
//     public/kiosco/zxing/<versión de zxing-wasm>/zxing_reader.wasm
//   desde node_modules/zxing-wasm/dist/reader/zxing_reader.wasm. El test
//   "el .wasm del escáner está en /public…" (src/lib/panol/kiosco.test.ts) falla si falta.
//   Vive bajo /kiosco y no en /zxing porque el proxy sólo deja pasar sin permiso de módulo
//   las imágenes: /kiosco lo abre quien tiene el kiosco o el Pañol en editar.

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Flashlight, Keyboard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type EscanerProps = {
  onCodigo: (texto: string) => void;
  pausado?: boolean;
  ayuda?: string;
  className?: string;
  etiquetaEscribir?: string;
};

// ─── El lector (uno por pestaña) ────────────────────────────────────────────

type Detector = { detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorNativo = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

// Los QR de las etiquetas y los códigos de barras de fábrica más comunes en ferretería.
// Cada formato de más es tiempo de más por cuadro en ZXing: no sumar sin necesidad.
const FORMATOS = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

let detector: Promise<Detector> | null = null;

function obtenerDetector(): Promise<Detector> {
  detector ??= (async () => {
    const Nativo = (globalThis as unknown as { BarcodeDetector?: DetectorNativo }).BarcodeDetector;
    if (Nativo) {
      try {
        const soportados = await Nativo.getSupportedFormats();
        if (soportados.includes("qr_code")) return new Nativo({ formats: FORMATOS.filter((f) => soportados.includes(f)) });
      } catch {
        // Algunos Chrome de escritorio lo declaran y después fallan: se cae al ZXing.
      }
    }
    const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
    await prepareZXingModule({
      overrides: {
        locateFile: (ruta: string, prefijo: string) =>
          ruta.endsWith(".wasm") ? `/kiosco/zxing/${ZXING_WASM_VERSION}/${ruta}` : prefijo + ruta,
      },
      fireImmediately: true,
    });
    return new BarcodeDetector({ formats: FORMATOS as never }) as unknown as Detector;
  })().catch((e) => {
    detector = null; // que el próximo intento vuelva a probar
    throw e;
  });
  return detector;
}

// ─── La cámara (una por pestaña) ────────────────────────────────────────────

let stream: MediaStream | null = null;
let pidiendo: Promise<MediaStream> | null = null;
let linternaPrendida = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

function pedirCamara(): Promise<MediaStream> {
  if (stream?.getVideoTracks().some((t) => t.readyState === "live")) return Promise.resolve(stream);
  if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error("SIN_CAMARA_API"));
  pidiendo ??= navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    .then((s) => {
      stream = s;
      linternaPrendida = false;
      // iPhone corta la cámara cuando la pestaña pasa a segundo plano: se vuelve a pedir.
      for (const t of s.getVideoTracks()) {
        t.addEventListener("ended", () => {
          if (stream === s) {
            stream = null;
            avisar();
          }
        });
      }
      avisar();
      return s;
    })
    .finally(() => {
      pidiendo = null;
    });
  return pidiendo;
}

export function apagarCamara() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  linternaPrendida = false;
  avisar();
}

// ─── Pitido ─────────────────────────────────────────────────────────────────

let audio: AudioContext | null = null;

/** iPhone sólo deja sonar audio después de un toque: se crea/reanuda en el primero. */
function desbloquearAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // sin audio: queda la vibración
  }
}

function pitar() {
  try {
    if (audio && audio.state === "running") {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "square";
      o.frequency.value = 1320;
      g.gain.setValueAtTime(0.08, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.13);
    }
  } catch {
    // nada
  }
  try {
    navigator.vibrate?.(60);
  } catch {
    // nada
  }
}

function textoDeError(e: unknown): string {
  const nombre = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : "";
  if (msg === "SIN_CAMARA_API") return "Este navegador no deja usar la cámara (hace falta https). Escribí el código.";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") return "No hay permiso para la cámara. Habilitalo en el navegador o escribí el código.";
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "No encontré una cámara en este equipo. Escribí el código.";
  if (nombre === "NotReadableError") return "Otra aplicación está usando la cámara. Cerrala y probá de nuevo.";
  return "No pude abrir la cámara. Probá de nuevo o escribí el código.";
}

// ─── El componente ──────────────────────────────────────────────────────────

const ANTIRREBOTE_MS = 1500;
const CADA_MS = 150;

export function Escaner({ onCodigo, pausado = false, ayuda, className, etiquetaEscribir = "Escribir el código" }: EscanerProps) {
  const actual = useSyncExternalStore(suscribir, () => stream, () => null);
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef({ texto: "", at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [errorLector, setErrorLector] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [escribir, setEscribir] = useState(false);
  const [texto, setTexto] = useState("");
  const [linterna, setLinterna] = useState(linternaPrendida);

  // Lo leído por la cámara pasa por el antirrebote; lo escrito a mano, siempre.
  const entregar = useEffectEvent((valor: string) => {
    const ahora = Date.now();
    if (valor === ultimo.current.texto && ahora - ultimo.current.at < ANTIRREBOTE_MS) {
      ultimo.current.at = ahora; // mientras siga enfrente, no se entrega de nuevo
      return;
    }
    ultimo.current = { texto: valor, at: ahora };
    pitar();
    window.dispatchEvent(new Event("panol:escaneo"));
    onCodigo(valor);
  });

  // El primer toque en cualquier lado habilita el pitido (si la cámara arrancó sola).
  useEffect(() => {
    window.addEventListener("pointerdown", desbloquearAudio, { once: true });
    return () => window.removeEventListener("pointerdown", desbloquearAudio);
  }, []);

  // Con el permiso ya dado (kiosco Android), arranca sin pedir el toque.
  useEffect(() => {
    if (stream || !navigator.permissions?.query) return;
    let vivo = true;
    navigator.permissions
      .query({ name: "camera" as PermissionName })
      .then((p) => {
        if (vivo && p.state === "granted") return pedirCamara();
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Enchufa la cámara compartida a ESTE visor.
  useEffect(() => {
    const v = video.current;
    if (!v || !actual) return;
    v.srcObject = actual;
    void v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [actual]);

  // El bucle de lectura. Pausado o sin cámara, no corre; la cámara sigue abierta.
  useEffect(() => {
    if (!actual || pausado) return;
    let vivo = true;
    let reloj = 0;
    let lector: Detector | null = null;
    obtenerDetector()
      .then((d) => {
        lector = d;
      })
      .catch(() => {
        if (vivo) setErrorLector(true);
      });
    const vuelta = async () => {
      const v = video.current;
      if (lector && v && v.readyState >= 2 && v.videoWidth > 0) {
        try {
          const r = await lector.detect(v);
          const valor = r.find((x) => x.rawValue?.trim())?.rawValue.trim();
          if (vivo && valor) entregar(valor);
        } catch {
          // un cuadro que no se pudo leer no es un error
        }
      }
      if (vivo) reloj = window.setTimeout(vuelta, CADA_MS);
    };
    void vuelta();
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
    };
  }, [actual, pausado]);

  const pista = actual?.getVideoTracks()[0];
  let puedeLinterna = false;
  try {
    puedeLinterna = !!(pista?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch;
  } catch {
    puedeLinterna = false;
  }

  async function activar() {
    desbloquearAudio();
    setError(null);
    setAbriendo(true);
    try {
      await pedirCamara();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setAbriendo(false);
    }
  }

  async function alternarLinterna() {
    if (!pista) return;
    const prender = !linterna;
    try {
      await pista.applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] });
      linternaPrendida = prender;
      setLinterna(prender);
    } catch {
      // la cámara dijo que sí y después que no: se deja como estaba
    }
  }

  function enviarEscrito(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    setEscribir(false);
    ultimo.current = { texto: t, at: Date.now() };
    pitar();
    onCodigo(t);
  }

  return (
    <div className="flex flex-col gap-3" onPointerDown={desbloquearAudio}>
      <div className={cn("relative h-72 w-full overflow-hidden rounded-xl bg-zinc-950 text-white", className)}>
        <video ref={video} playsInline muted autoPlay aria-hidden className={cn("absolute inset-0 size-full object-cover", !actual && "hidden")} />

        {actual ? (
          <>
            {/* El marco: dónde poner la etiqueta. */}
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[44%] size-48 -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-0 top-0 size-10 rounded-tl-lg border-l-4 border-t-4 border-white" />
              <span className="absolute right-0 top-0 size-10 rounded-tr-lg border-r-4 border-t-4 border-white" />
              <span className="absolute bottom-0 left-0 size-10 rounded-bl-lg border-b-4 border-l-4 border-white" />
              <span className="absolute bottom-0 right-0 size-10 rounded-br-lg border-b-4 border-r-4 border-white" />
              {!pausado && <span className="absolute inset-x-[8%] top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400" />}
            </div>
            {ayuda && (
              <p className="absolute inset-x-0 top-3 px-4 text-center text-base font-semibold [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">{ayuda}</p>
            )}
            {pausado && (
              <div className="absolute inset-0 grid place-items-center bg-black/55">
                <Loader2 aria-label="Procesando" className="size-10 animate-spin" />
              </div>
            )}
            {errorLector && (
              <p role="alert" className="absolute inset-x-3 top-12 rounded-lg bg-black/75 p-3 text-center text-base">
                No pude cargar el lector de códigos. Escribí el código.
              </p>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center">
            {ayuda && <p className="text-lg font-semibold">{ayuda}</p>}
            <button
              type="button"
              onClick={activar}
              disabled={abriendo}
              className="flex h-16 items-center gap-3 rounded-xl bg-white px-6 text-lg font-bold text-zinc-950 disabled:opacity-60"
            >
              {abriendo ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Camera className="size-6" aria-hidden />}
              Activar cámara
            </button>
            {error && (
              <p role="alert" className="max-w-sm text-base text-amber-200">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-3 flex gap-2 px-3">
          {actual && puedeLinterna && (
            <button
              type="button"
              onClick={alternarLinterna}
              aria-pressed={linterna}
              className={cn(
                "flex h-14 items-center gap-2 rounded-lg px-4 text-base font-semibold",
                linterna ? "bg-amber-200 text-zinc-950" : "border border-white/35 bg-white/15 text-white",
              )}
            >
              <Flashlight className="size-5" aria-hidden />
              Linterna
            </button>
          )}
          <button
            type="button"
            onClick={() => setEscribir((x) => !x)}
            aria-expanded={escribir}
            className="ml-auto flex h-14 items-center gap-2 rounded-lg border border-white/35 bg-white/15 px-4 text-base font-semibold text-white"
          >
            <Keyboard className="size-5" aria-hidden />
            {etiquetaEscribir}
          </button>
        </div>
      </div>

      {escribir && (
        <form onSubmit={enviarEscrito} className="flex gap-2">
          <label className="sr-only" htmlFor="escaner-codigo">
            Código
          </label>
          <input
            id="escaner-codigo"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej.: E7K2QX"
            className="h-14 min-w-0 flex-1 rounded-lg border-2 border-input bg-background px-4 font-mono text-xl uppercase tracking-widest text-foreground outline-none focus-visible:border-ring"
          />
          <button type="submit" className="h-14 rounded-lg bg-foreground px-5 text-lg font-semibold text-background">
            Listo
          </button>
        </form>
      )}
    </div>
  );
}
