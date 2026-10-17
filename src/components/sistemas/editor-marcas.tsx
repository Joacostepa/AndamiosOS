"use client";

// El editor de marcas del panel de reporte (docs/sistemas/contrato.md §6.4, maqueta: «Marcar»).
// Sobre la captura (o una imagen sumada) se dibuja con Lápiz y Recuadro en rojo, y con Tapar
// se esconde en negro sólido lo que no haga falta mandar (nombres, teléfonos, montos).
//
//  · Canvas 2D propio, sin librería. Las marcas se guardan como vectores en píxeles DE LA
//    IMAGEN (tipo Marca de tipos.ts), así se pueden volver a editar y el resultado no depende
//    del tamaño de la pantalla.
//  · Pointer Events (mouse, dedo y lápiz) con touch-action: none y setPointerCapture: en el
//    celular arrastrar dibuja, no mueve la página. Un segundo dedo no hace nada.
//  · En el celular ocupa toda la pantalla; en la compu, un diálogo grande. La imagen siempre
//    entra entera (se achica para caber, nunca se recorta).
//  · «Listo» devuelve la versión APLANADA (imagen + marcas en un solo bitmap, pasada por
//    normalizarImagen). Es lo único que se sube: lo tapado no viaja en ningún lado.
//
// Lleva data-capture="exclude": si alguien tocara Reportar con el editor abierto, no sale.

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Pencil, Square, Undo2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EXCLUIR_CAPTURA, TEXTOS, type ImagenLista, type Marca } from "@/lib/sistemas/tipos";
import { aCoordenadasImagen, escalaParaCaber, grosorTrazo, normalizarImagen, rectEntre } from "@/lib/sistemas/imagen";

export type PropsEditorMarcas = {
  abierto: boolean;
  /** La captura o imagen ORIGINAL (sin marcas). Nunca se sube. */
  original: ImagenLista;
  /** Las marcas que ya tenía (para volver a editar). */
  marcas: Marca[];
  onListo: (r: { imagen: ImagenLista; marcas: Marca[]; conMarcas: boolean }) => void; // imagen = aplanada con normalizarImagen
  onCancelar: () => void;
};

type Herramienta = "lapiz" | "recuadro" | "tapar";

const HERRAMIENTAS: { id: Herramienta; icono: LucideIcon; etiqueta: string }[] = [
  { id: "lapiz", icono: Pencil, etiqueta: TEXTOS.editor.lapiz },
  { id: "recuadro", icono: Square, etiqueta: TEXTOS.editor.recuadro },
  { id: "tapar", icono: EyeOff, etiqueta: TEXTOS.editor.tapar },
];

/** El rojo de las marcas (el mismo de la maqueta). */
const ROJO = "#e5484d";
/** Tapar: negro sólido, sin transparencia (lo tapado tiene que quedar ilegible). */
const NEGRO = "#000000";
/** Por debajo de esto (px de pantalla) un recuadro o un trazo es un toque sin querer. */
const MINIMO_PANTALLA = 4;
/** Aire alrededor de la imagen dentro del escenario (px CSS). */
const AIRE = 12;

type Dibujable = HTMLImageElement;

/** Pinta una marca. `grosor` en píxeles de la imagen. */
function dibujarMarca(ctx: CanvasRenderingContext2D, m: Marca, grosor: number) {
  if (m.tipo === "tapar") {
    ctx.fillStyle = NEGRO;
    ctx.fillRect(m.x, m.y, m.ancho, m.alto);
    return;
  }
  ctx.strokeStyle = ROJO;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (m.tipo === "lapiz") {
    const [primero, ...resto] = m.puntos;
    if (!primero) return;
    ctx.moveTo(primero[0], primero[1]);
    for (const [x, y] of resto) ctx.lineTo(x, y);
  } else {
    const r = Math.min(grosor * 2, m.ancho / 2, m.alto / 2);
    if (typeof ctx.roundRect === "function") ctx.roundRect(m.x, m.y, m.ancho, m.alto, r);
    else ctx.rect(m.x, m.y, m.ancho, m.alto);
  }
  ctx.stroke();
}

function pintar(ctx: CanvasRenderingContext2D, img: Dibujable | null, ancho: number, alto: number, marcas: readonly Marca[]) {
  ctx.clearRect(0, 0, ancho, alto);
  if (img) ctx.drawImage(img, 0, 0, ancho, alto);
  const grosor = grosorTrazo(ancho, alto);
  for (const m of marcas) dibujarMarca(ctx, m, grosor);
}

/**
 * Lee la imagen original para dibujarla. Con <img> y no con ImageBitmap: no hay que cerrarla
 * a mano (la junta el recolector) y la original ya viene sin EXIF de normalizarImagen.
 */
async function cargarImagen(original: ImagenLista): Promise<Dibujable> {
  const img = new Image();
  img.decoding = "async";
  img.src = original.url;
  await img.decode();
  return img;
}

export function EditorMarcas({ abierto, original, marcas, onListo, onCancelar }: PropsEditorMarcas) {
  const [herramienta, setHerramienta] = useState<Herramienta>("recuadro");
  const [lista, setLista] = useState<Marca[]>(marcas);
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre arranca con las marcas que trae y con «Recuadro» (ajuste de estado
  // durante el render, el patrón de React para «resetear al cambiar una prop»).
  const [abiertoAntes, setAbiertoAntes] = useState(abierto);
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto);
    if (abierto) {
      setLista(marcas);
      setHerramienta("recuadro");
    }
  }

  // El canvas y el escenario viven en un portal que se monta después: se guardan con ref de
  // callback (en estado) para que los efectos corran recién cuando existen.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [escenario, setEscenario] = useState<HTMLDivElement | null>(null);
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const [cargada, setCargada] = useState<{ url: string; img: Dibujable } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const img = cargada?.url === original.url ? cargada.img : null;
  const ancho = original.ancho;
  const alto = original.alto;

  // ---- cargar la imagen ----
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    cargarImagen(original)
      .then((img) => {
        if (!vivo) return;
        setCargada({ url: original.url, img });
        setFallo(null);
      })
      .catch(() => {
        if (vivo) setFallo(original.url);
      });
    return () => {
      vivo = false;
    };
  }, [abierto, original]);

  // ---- medir el escenario para que la imagen entre entera ----
  useEffect(() => {
    if (!escenario) return;
    const medir = () => setCaja({ ancho: Math.max(0, escenario.clientWidth - AIRE * 2), alto: Math.max(0, escenario.clientHeight - AIRE * 2) });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(escenario);
    return () => ro.disconnect();
  }, [escenario]);

  const enPantalla = escalaParaCaber(ancho, alto, caja.ancho, caja.alto);

  // ---- dibujo ----
  // El trazo en curso no pasa por el estado (se repinta a cada movimiento del dedo): vive en
  // una ref y se pinta en el próximo cuadro.
  const borrador = useRef<{ marca: Marca; desde: [number, number]; puntero: number } | null>(null);
  const cuadro = useRef(0);
  const listaRef = useRef(lista);
  const imgRef = useRef(img);
  useEffect(() => {
    listaRef.current = lista;
    imgRef.current = img;
  });

  const repintar = useCallback(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const b = borrador.current;
    pintar(ctx, imgRef.current, canvas.width, canvas.height, b ? [...listaRef.current, b.marca] : listaRef.current);
  }, [canvas]);

  const pedirRepintado = useCallback(() => {
    if (cuadro.current) return;
    cuadro.current = requestAnimationFrame(() => {
      cuadro.current = 0;
      repintar();
    });
  }, [repintar]);

  useEffect(() => {
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (ctx) pintar(ctx, img, canvas.width, canvas.height, lista);
  }, [canvas, img, lista, ancho, alto]);

  useEffect(() => () => cancelAnimationFrame(cuadro.current), []);

  /** Píxeles de imagen por píxel de pantalla (para los mínimos «sin querer»). */
  const imagenPorPantalla = () => {
    const r = canvas?.getBoundingClientRect();
    return r && r.width > 0 ? ancho / r.width : 1;
  };

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) =>
    aCoordenadasImagen({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), { ancho, alto });

  const alApoyar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (guardando || !img || borrador.current) return; // un segundo dedo no hace nada
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores viejos: igual dibuja mientras no salga del lienzo */
    }
    const p = punto(e);
    borrador.current = {
      desde: p,
      puntero: e.pointerId,
      marca: herramienta === "lapiz" ? { tipo: "lapiz", puntos: [p] } : { tipo: herramienta, x: p[0], y: p[1], ancho: 0, alto: 0 },
    };
    pedirRepintado();
  };

  const alMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = borrador.current;
    if (!b || e.pointerId !== b.puntero) return;
    e.preventDefault();
    // Con el dedo, el navegador junta varios movimientos por cuadro: se usan todos para que
    // el trazo del lápiz salga parejo.
    const eventos = b.marca.tipo === "lapiz" && typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const caja = e.currentTarget.getBoundingClientRect();
    const puntos = (eventos.length ? eventos : [e.nativeEvent]).map((ev) => aCoordenadasImagen({ x: ev.clientX, y: ev.clientY }, caja, { ancho, alto }));
    if (b.marca.tipo === "lapiz") {
      const minimo = 1.5 * imagenPorPantalla();
      for (const p of puntos) {
        const ultimo = b.marca.puntos[b.marca.puntos.length - 1];
        if (!ultimo || Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) >= minimo) b.marca.puntos.push(p);
      }
    } else {
      const p = puntos[puntos.length - 1] ?? b.desde;
      b.marca = { tipo: b.marca.tipo, ...rectEntre(b.desde, p, { ancho, alto }) };
    }
    pedirRepintado();
  };

  const alSoltar = (e: React.PointerEvent<HTMLCanvasElement>, cancelado = false) => {
    const b = borrador.current;
    if (!b || e.pointerId !== b.puntero) return;
    borrador.current = null;
    const minimo = MINIMO_PANTALLA * imagenPorPantalla();
    const m = b.marca;
    const sirve =
      !cancelado &&
      (m.tipo === "lapiz"
        ? m.puntos.length > 1 && m.puntos.some(([x, y]) => Math.hypot(x - b.desde[0], y - b.desde[1]) >= minimo)
        : m.ancho >= minimo && m.alto >= minimo);
    if (sirve) setLista((l) => [...l, m]);
    else pedirRepintado();
  };

  const deshacer = useCallback(() => {
    if (guardando) return;
    setLista((l) => l.slice(0, -1));
  }, [guardando]);

  const listo = async () => {
    if (guardando || !img) return;
    setGuardando(true);
    try {
      // Un lienzo aparte, a la resolución de la imagen, con la imagen y las marcas confirmadas.
      const plano = document.createElement("canvas");
      plano.width = ancho;
      plano.height = alto;
      const ctx = plano.getContext("2d");
      if (!ctx) throw new Error(TEXTOS.panel.imagenIlegible);
      pintar(ctx, img, ancho, alto, lista);
      const imagen = await normalizarImagen(plano);
      plano.width = 0;
      plano.height = 0;
      onListo({ imagen, marcas: lista, conMarcas: lista.length > 0 });
    } catch {
      toast.error(TEXTOS.panel.imagenIlegible);
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => {
    if (guardando) return;
    borrador.current = null;
    onCancelar();
  };

  const alTeclado = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.stopPropagation();
      deshacer();
    }
  };

  const atributosExcluir = { [EXCLUIR_CAPTURA.atributo]: EXCLUIR_CAPTURA.valor };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) cancelar();
      }}
      // Un clic afuera sin querer no tira lo marcado; Esc y «Cancelar» sí cierran.
      disablePointerDismissal
    >
      <DialogContent
        {...atributosExcluir}
        showCloseButton={false}
        onKeyDown={alTeclado}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          // celular: pantalla completa
          "top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none ring-0",
          // compu: diálogo grande centrado
          "sm:top-1/2 sm:left-1/2 sm:h-[min(92dvh,960px)] sm:w-[min(1100px,calc(100vw-2rem))] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:ring-1",
        )}
      >
        {/* Barra: título, herramientas y deshacer */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <DialogTitle className="mr-1 w-full text-[0.95rem] font-semibold sm:w-auto">{TEXTOS.editor.titulo}</DialogTitle>
          <div role="group" aria-label={TEXTOS.editor.titulo} className="inline-flex overflow-hidden rounded-lg border">
            {HERRAMIENTAS.map(({ id, icono: Icono, etiqueta }, i) => (
              <button
                key={id}
                type="button"
                aria-pressed={herramienta === id}
                onClick={() => setHerramienta(id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 px-3 text-[0.8rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  i > 0 && "border-l",
                  herramienta === id ? "bg-foreground text-background" : "bg-background hover:bg-muted",
                )}
              >
                <Icono className="size-4" aria-hidden />
                {etiqueta}
              </button>
            ))}
          </div>
          <Button variant="ghost" className="h-9" onClick={deshacer} disabled={guardando || lista.length === 0}>
            <Undo2 aria-hidden />
            {TEXTOS.editor.deshacer}
          </Button>
        </div>

        {/* Escenario: la imagen entera, centrada */}
        <div ref={setEscenario} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted">
          {fallo === original.url ? (
            <p className="px-6 text-center text-sm text-muted-foreground">{TEXTOS.panel.imagenIlegible}</p>
          ) : (
            <canvas
              ref={setCanvas}
              width={ancho}
              height={alto}
              aria-label={TEXTOS.editor.titulo}
              onPointerDown={alApoyar}
              onPointerMove={alMover}
              onPointerUp={(e) => alSoltar(e)}
              onPointerCancel={(e) => alSoltar(e, true)}
              onLostPointerCapture={(e) => alSoltar(e)}
              onContextMenu={(e) => e.preventDefault()}
              className={cn("block cursor-crosshair rounded-sm bg-background shadow-sm select-none", !img && "opacity-0")}
              style={{ width: enPantalla.ancho || undefined, height: enPantalla.alto || undefined, touchAction: "none" }}
            />
          )}
        </div>

        {/* Pie: la ayuda de Tapar y los botones */}
        <div className="flex flex-col gap-2 border-t px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:px-4">
          <DialogDescription className="flex-1 text-xs">{TEXTOS.editor.hint}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-9" onClick={cancelar} disabled={guardando}>
              {TEXTOS.editor.cancelar}
            </Button>
            <Button className="h-9 min-w-24" onClick={listo} disabled={guardando || !img}>
              {TEXTOS.editor.listo}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
