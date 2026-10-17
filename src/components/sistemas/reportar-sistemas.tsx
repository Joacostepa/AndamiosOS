"use client";

// El panel «¿Qué querés avisar?» (contrato §7.1 y §7.3; maqueta: panelHTML/abrirPanel).
//
// VIVE EN EL HEADER y no tiene disparador propio: escucha tres eventos de window.
//   - sistemas:reportar → PRIMERO saca la foto de lo que se ve y DESPUÉS abre. Al revés, la
//     foto saldría con el panel tapando la pantalla. No hace nada si corre el recorrido.
//   - sistemas:abrir-reporte {modo:"recorrido"} → abre sin foto, sin trampa de foco, sin
//     poder cerrarlo ni mandarlo: el recorrido sólo lo muestra (paso 2 a 4).
//   - sistemas:cerrar-reporte → cierra, en cualquier modo.
// Así el header, el menú, ⌘K, Mis reportes y el recorrido piden lo mismo sin conocer esto.
//
// SÓLO SE SUBE LA IMAGEN APLANADA. El editor devuelve la versión con las marcas quemadas;
// la original queda en memoria únicamente para volver a editar (si tapaste un teléfono y
// querés corregir el recuadro) y se libera al cerrar. Nunca sale del navegador.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Camera, CameraOff, ImagePlus, Loader2, PenLine, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";
import { useCrearReporte, useMisReportes } from "@/hooks/use-sistemas";
import { etiquetaRol } from "@/lib/auth/acceso";
import { capturarPantalla } from "@/lib/sistemas/captura-pantalla";
import { armarContexto } from "@/lib/sistemas/contexto-cliente";
import { liberarImagen, normalizarImagen } from "@/lib/sistemas/imagen";
import { pantallaDeRuta } from "@/lib/sistemas/rutas";
import {
  ATRIBUTO_RECORRIDO_ACTIVO,
  DATA_TOUR,
  EVENTOS,
  EXCLUIR_CAPTURA,
  LIMITES,
  TEXTOS,
  TIPOS,
  TIPOS_REPORTE,
  enlaceMisReportes,
  shaCorto,
  toastGracias,
  type ContextoCliente,
  type DetalleAbrirReporte,
  type ImagenLista,
  type Marca,
  type ResultadoCaptura,
  type TipoReporte,
} from "@/lib/sistemas/tipos";
import { ICONO_TIPO, TONO_TIPO } from "@/components/sistemas/comun";
import { ponerCapturando } from "@/components/sistemas/disparar";

// El editor (canvas, pointer events) se baja recién cuando alguien toca «Marcar».
const EditorMarcas = dynamic(() => import("@/components/sistemas/editor-marcas").then((m) => m.EditorMarcas), { ssr: false });

const EXCLUIR = { [EXCLUIR_CAPTURA.atributo]: EXCLUIR_CAPTURA.valor };

type Item = {
  id: number;
  /** Tal como vino (captura o imagen sumada). Sólo para volver a editar: no se sube. */
  original: ImagenLista;
  /** Con las marcas quemadas. Si no hay marcas, se sube la original (no tiene nada tapado). */
  aplanada: ImagenLista | null;
  marcas: Marca[];
  esCaptura: boolean;
};

/** Qué pasó con la foto automática, para el texto del recuadro vacío. */
type EstadoCaptura = "ok" | "fallo" | "quitada";

let siguienteId = 1;
const liberarItem = (i: Item) => {
  liberarImagen(i.aplanada);
  liberarImagen(i.original);
};

function recorridoActivo(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(ATRIBUTO_RECORRIDO_ACTIVO);
}

export function ReportarSistemas() {
  const router = useRouter();
  const { data: user } = useUser();
  const crear = useCrearReporte();

  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"normal" | "recorrido">("normal");
  const [imagenes, setImagenes] = useState<Item[]>([]);
  const [captura, setCaptura] = useState<EstadoCaptura>("ok");
  const [tipo, setTipo] = useState<TipoReporte | null>(null);
  const [texto, setTexto] = useState("");
  const [frena, setFrena] = useState(false);
  const [contexto, setContexto] = useState<ContextoCliente | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [destello, setDestello] = useState(0);

  const recorrido = modo === "recorrido";
  const mis = useMisReportes({ enabled: abierto && !recorrido });

  // Refs para los oyentes de window, que se registran una sola vez.
  const abiertoRef = useRef(false);
  const modoRef = useRef<"normal" | "recorrido">("normal");
  const capturandoRef = useRef(false);
  const imagenesRef = useRef<Item[]>([]);
  const enviandoRef = useRef(false);
  useEffect(() => {
    abiertoRef.current = abierto;
  }, [abierto]);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(() => {
    enviandoRef.current = crear.isPending;
  }, [crear.isPending]);

  /** Vacía el formulario y libera las imágenes (los object URL no se liberan solos). */
  const limpiar = useCallback(() => {
    imagenesRef.current.forEach(liberarItem);
    imagenesRef.current = [];
    setImagenes([]);
    setTipo(null);
    setTexto("");
    setFrena(false);
    setEditando(null);
    setContexto(null);
  }, []);

  const cerrar = useCallback(() => {
    abiertoRef.current = false;
    setAbierto(false);
  }, []);

  // ── Los tres eventos ───────────────────────────────────────────────────────
  useEffect(() => {
    async function reportar() {
      if (recorridoActivo() || abiertoRef.current || capturandoRef.current) return;
      capturandoRef.current = true;
      ponerCapturando(true);
      // El contexto, ANTES de la foto: la ruta y los errores de lo que la persona estaba viendo.
      let ctx: ContextoCliente | null = null;
      try {
        ctx = armarContexto();
      } catch {
        ctx = null;
      }
      let r: ResultadoCaptura;
      try {
        r = await capturarPantalla();
      } catch {
        r = { ok: false, motivo: "error" };
      }
      capturandoRef.current = false;
      ponerCapturando(false);
      // Mientras se sacaba la foto arrancó el recorrido (o se abrió por otro lado): se descarta.
      if (recorridoActivo() || abiertoRef.current) {
        if (r.ok) liberarImagen(r.imagen);
        return;
      }
      limpiar();
      const items = r.ok ? [{ id: siguienteId++, original: r.imagen, aplanada: null, marcas: [], esCaptura: true }] : [];
      imagenesRef.current = items;
      setImagenes(items);
      setCaptura(r.ok ? "ok" : "fallo");
      setContexto(ctx);
      modoRef.current = "normal";
      setModo("normal");
      abiertoRef.current = true;
      setAbierto(true);
      if (r.ok) setDestello((d) => d + 1);
    }

    function abrirReporte(e: Event) {
      const detalle = (e as CustomEvent<DetalleAbrirReporte | undefined>).detail;
      if (detalle && detalle.modo !== "recorrido") return;
      // Abierto de verdad, con lo que la persona ya cargó: no se le pisa con el de muestra (el
      // recorrido espera a que no haya diálogos abiertos; esto es por las dudas).
      if (abiertoRef.current && modoRef.current === "normal") return;
      limpiar();
      setCaptura("ok");
      modoRef.current = "recorrido";
      setModo("recorrido");
      abiertoRef.current = true;
      setAbierto(true);
    }

    function cerrarReporte() {
      cerrar();
    }

    window.addEventListener(EVENTOS.reportar, reportar);
    window.addEventListener(EVENTOS.abrirReporte, abrirReporte);
    window.addEventListener(EVENTOS.cerrarReporte, cerrarReporte);
    return () => {
      window.removeEventListener(EVENTOS.reportar, reportar);
      window.removeEventListener(EVENTOS.abrirReporte, abrirReporte);
      window.removeEventListener(EVENTOS.cerrarReporte, cerrarReporte);
    };
  }, [cerrar, limpiar]);

  // Al desmontar (logout, cambio de layout), nada queda colgado en memoria.
  useEffect(() => () => imagenesRef.current.forEach(liberarItem), []);

  // ── Sumar imágenes: archivo, pegar, arrastrar ──────────────────────────────
  const sumar = useCallback(async (archivos: Blob[]) => {
    const imgs = archivos.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) {
      if (archivos.length) toast.error(TEXTOS.panel.imagenIlegible);
      return;
    }
    const lugar = LIMITES.imagenes - imagenesRef.current.length;
    if (lugar <= 0 || imgs.length > lugar) toast.info(TEXTOS.panel.imagenesMax);
    for (const f of imgs.slice(0, Math.max(0, lugar))) {
      try {
        const img = await normalizarImagen(f);
        if (!abiertoRef.current || imagenesRef.current.length >= LIMITES.imagenes) {
          liberarImagen(img);
          continue;
        }
        const item: Item = { id: siguienteId++, original: img, aplanada: null, marcas: [], esCaptura: false };
        imagenesRef.current = [...imagenesRef.current, item];
        setImagenes(imagenesRef.current);
      } catch {
        toast.error(TEXTOS.panel.imagenIlegible);
      }
    }
  }, []);

  // Ctrl+V / ⌘V con una imagen en el portapapeles, mientras el panel está abierto. Si lo que
  // se pega es texto (en la descripción), no se toca.
  useEffect(() => {
    if (!abierto || recorrido || editando !== null) return;
    function alPegar(e: ClipboardEvent) {
      const archivos = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (archivos.length === 0) return;
      e.preventDefault();
      void sumar(archivos);
    }
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [abierto, recorrido, editando, sumar]);

  function quitar(id: number) {
    const item = imagenesRef.current.find((i) => i.id === id);
    if (!item) return;
    liberarItem(item);
    imagenesRef.current = imagenesRef.current.filter((i) => i.id !== id);
    setImagenes(imagenesRef.current);
    if (item.esCaptura) setCaptura("quitada");
  }

  function alTerminarDeMarcar(id: number, r: { imagen: ImagenLista; marcas: Marca[]; conMarcas: boolean }) {
    setEditando(null);
    const item = imagenesRef.current.find((i) => i.id === id);
    if (!item) {
      liberarImagen(r.imagen);
      return;
    }
    const nueva = r.conMarcas ? r.imagen : null;
    if (item.aplanada && item.aplanada.url !== nueva?.url) liberarImagen(item.aplanada);
    // Sin marcas no hace falta otra copia: se sube la original, que no tiene nada tapado.
    if (!r.conMarcas && r.imagen.url !== item.original.url) liberarImagen(r.imagen);
    imagenesRef.current = imagenesRef.current.map((i) => (i.id === id ? { ...i, aplanada: nueva, marcas: r.conMarcas ? r.marcas : [] } : i));
    setImagenes(imagenesRef.current);
  }

  // ── Mandar ─────────────────────────────────────────────────────────────────
  const descripcion = texto.trim();
  const puedeMandar = !!tipo && descripcion.length >= LIMITES.descripcionMin && !crear.isPending;

  function mandar() {
    if (recorrido || !tipo || !puedeMandar) return;
    const ctx = contexto ?? armarContexto();
    crear.mutate(
      {
        body: {
          tipo,
          descripcion,
          frena: tipo === "error" && frena,
          ruta: ctx.ruta || `${location.pathname}${location.search}`,
          tituloPantalla: ctx.tituloPantalla || document.title,
          shaCliente: ctx.sha || process.env.NEXT_PUBLIC_SHA || "local",
          contexto: ctx,
        },
        imagenes: imagenesRef.current.map((i) => i.aplanada ?? i.original),
      },
      {
        onSuccess: (r) => {
          const t = toastGracias(user?.nombre ?? "", r.numero, r.frena);
          toast.success(t.titulo, {
            description: t.detalle,
            duration: 8000,
            action: { label: TEXTOS.toast.verMisReportes, onClick: () => router.push(enlaceMisReportes(r.id)) },
          });
          cerrar();
        },
        // El panel queda abierto con todo lo cargado: se puede volver a intentar.
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo mandar. Probá de nuevo."),
      },
    );
  }

  // ── Lo que se ve ───────────────────────────────────────────────────────────
  const ruta = contexto?.ruta || (typeof location !== "undefined" ? location.pathname : "");
  const pantalla = pantallaDeRuta(ruta);
  const nMis = mis.data?.reportes.length ?? 0;
  const enEdicion = editando !== null ? imagenes.find((i) => i.id === editando) ?? null : null;

  const filasContexto = useMemo(() => {
    const [fPantalla, fUsuario, fDispositivo, fVersion, fErrores, fAnteriores] = TEXTOS.panel.contextoFilas;
    const errores = contexto?.errores ?? [];
    const pedidos = contexto?.pedidos ?? [];
    const ultimoPedido = pedidos.at(-1);
    const ultimo = ultimoPedido
      ? `${ultimoPedido.metodo} ${ultimoPedido.url} → ${ultimoPedido.status || "sin respuesta"}`
      : errores.at(-1)?.mensaje.slice(0, 90);
    const cuantos = errores.length + pedidos.length;
    return [
      [fPantalla, `${pantalla} · ${ruta.split("?")[0] || "/"}`],
      [fUsuario, user ? `${user.nombre} ${user.apellido} (${etiquetaRol(user.rol)})` : "—"],
      [fDispositivo, contexto?.dispositivo || "—"],
      [fVersion, shaCorto(contexto?.sha || process.env.NEXT_PUBLIC_SHA || "local")],
      [fErrores, cuantos ? `${cuantos}${ultimo ? ` · ${ultimo}` : ""}` : "Ninguno"],
      [fAnteriores, (contexto?.rutas ?? []).slice(-4).map((r) => r.ruta).join(" → ") || "—"],
    ] as const;
  }, [contexto, pantalla, ruta, user]);

  return (
    <>
      <DialogPrimitive.Root
        open={abierto}
        modal={!recorrido}
        // Un clic afuera nunca lo cierra (como en la maqueta): tiraría sin aviso lo escrito, las
        // marcas y las imágenes. Se cierra con Cancelar, la X o Esc.
        disablePointerDismissal
        onOpenChange={(abrir) => {
          // En el recorrido no se cierra con nada (ni Esc); mandando, tampoco.
          if (abrir || recorrido || enviandoRef.current) return;
          cerrar();
        }}
        onOpenChangeComplete={(abrir) => {
          if (!abrir && !abiertoRef.current) limpiar();
        }}
      >
        <DialogPrimitive.Portal>
          {!recorrido && (
            <DialogPrimitive.Backdrop
              {...EXCLUIR}
              className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0"
            />
          )}
          <DialogPrimitive.Popup
            {...EXCLUIR}
            initialFocus={recorrido ? false : undefined}
            finalFocus={recorrido ? false : undefined}
            className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-popover text-sm text-popover-foreground shadow-lg outline-none transition duration-200 ease-out data-ending-style:translate-x-10 data-ending-style:opacity-0 data-starting-style:translate-x-10 data-starting-style:opacity-0 sm:max-w-[420px] motion-reduce:transition-none"
          >
            {/* Encabezado */}
            <div className="flex items-start gap-2.5 border-b px-4 pt-4 pb-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{TEXTOS.panel.titulo}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {TEXTOS.panel.subtitulo}
                </DialogPrimitive.Description>
              </div>
              {!recorrido && (
                <DialogPrimitive.Close
                  disabled={crear.isPending}
                  render={<Button variant="ghost" size="icon" className="-mt-1 -mr-1 size-11 sm:size-8" />}
                >
                  <X />
                  <span className="sr-only">Cerrar</span>
                </DialogPrimitive.Close>
              )}
            </div>

            {/* Cuerpo: en el recorrido es inerte (no se elige, no se escribe, no se manda). */}
            <div
              inert={recorrido}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3.5">
                {!recorrido && nMis > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      cerrar();
                      router.push("/sistemas/mis-reportes");
                    }}
                    className="self-start text-[12.5px] text-primary underline underline-offset-3"
                  >
                    {TEXTOS.boton.misReportes} ({nMis})
                  </button>
                )}

                <SeccionImagenes
                  recorrido={recorrido}
                  imagenes={imagenes}
                  captura={captura}
                  pantalla={pantalla}
                  onSumar={sumar}
                  onQuitar={quitar}
                  onMarcar={setEditando}
                />

                <section data-tour={DATA_TOUR.tipos} className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-muted-foreground">{TEXTOS.panel.queEs}</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {TIPOS_REPORTE.map((t) => (
                      <TarjetaTipo key={t} tipo={t} elegido={tipo === t} onElegir={() => setTipo(t)} />
                    ))}
                  </div>
                  <p className="mb-1.5 text-[12px] text-muted-foreground">{TEXTOS.panel.noSabes}</p>
                  <label htmlFor="sis-descripcion" className="text-[12px] font-semibold text-muted-foreground">
                    {TEXTOS.panel.contalo}
                  </label>
                  <Textarea
                    id="sis-descripcion"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    maxLength={LIMITES.descripcionMax}
                    placeholder={tipo ? TIPOS[tipo].placeholder : TEXTOS.panel.placeholderSinTipo}
                    className="min-h-24 text-base leading-snug sm:text-[13.5px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        mandar();
                      }
                    }}
                  />
                </section>

                {tipo === "error" && (
                  <section className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold text-muted-foreground">{TEXTOS.panel.frena}</span>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={TEXTOS.panel.frena}>
                      {([true, false] as const).map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          role="radio"
                          aria-checked={frena === v}
                          onClick={() => setFrena(v)}
                          className={cn(
                            "min-h-9 rounded-full border-[1.5px] px-3 text-[12.5px] transition-colors",
                            frena === v ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-muted-foreground",
                          )}
                        >
                          {v ? TEXTOS.panel.frenaSi : TEXTOS.panel.frenaNo}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <details className="group border-t pt-2.5 text-[12.5px] text-muted-foreground">
                  <summary className="cursor-pointer leading-snug marker:text-muted-foreground">{TEXTOS.panel.contexto}</summary>
                  <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {filasContexto.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt>{k}</dt>
                        <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[12px]">{TEXTOS.panel.contextoHint}</p>
                </details>
              </div>

              <div className="flex justify-end gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button variant="ghost" className="h-10 sm:h-9" disabled={crear.isPending} onClick={cerrar}>
                  {TEXTOS.panel.cancelar}
                </Button>
                <Button
                  data-tour={DATA_TOUR.mandar}
                  className="h-10 gap-2 px-3.5 sm:h-9"
                  disabled={!recorrido && !puedeMandar}
                  onClick={mandar}
                >
                  {crear.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  {crear.isPending ? TEXTOS.panel.mandando : TEXTOS.panel.mandar}
                </Button>
              </div>
            </div>

            {/* Dentro del árbol del panel (aunque se pinte en su propio portal): así es un
                diálogo anidado y Esc o un clic en el editor no cierran también el panel. */}
            {enEdicion && (
              <EditorMarcas
                abierto
                original={enEdicion.original}
                marcas={enEdicion.marcas}
                onListo={(r) => alTerminarDeMarcar(enEdicion.id, r)}
                onCancelar={() => setEditando(null)}
              />
            )}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {destello > 0 && <Destello key={destello} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SeccionImagenes({
  recorrido,
  imagenes,
  captura,
  pantalla,
  onSumar,
  onQuitar,
  onMarcar,
}: {
  recorrido: boolean;
  imagenes: Item[];
  captura: EstadoCaptura;
  pantalla: string;
  onSumar: (f: Blob[]) => void;
  onQuitar: (id: number) => void;
  onMarcar: (id: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const principal = imagenes[0] ?? null;
  const resto = imagenes.slice(1);
  const lleno = imagenes.length >= LIMITES.imagenes;

  const botonSumar = (
    <Button variant="outline" size="sm" className="h-9 sm:h-7" disabled={lleno} onClick={() => input.current?.click()}>
      <ImagePlus />
      {TEXTOS.panel.sumarImagen}
    </Button>
  );

  return (
    <section
      data-tour={DATA_TOUR.captura}
      className={cn("flex flex-col gap-2 rounded-lg transition-shadow", arrastrando && "ring-2 ring-primary ring-offset-4 ring-offset-popover")}
      onDragOver={(e) => {
        if (recorrido || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false);
      }}
      onDrop={(e) => {
        if (recorrido) return;
        e.preventDefault();
        setArrastrando(false);
        onSumar(Array.from(e.dataTransfer.files));
      }}
    >
      <span className="text-[12px] font-semibold text-muted-foreground">
        {principal && !principal.esCaptura ? "Imágenes" : `${TEXTOS.panel.fotoDe} · ${pantalla}`}
      </span>

      {recorrido ? (
        <>
          <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-lg border bg-muted/60 px-4 text-center text-[13px] text-muted-foreground">
            <Camera className="size-6" />
            <span>{TEXTOS.panel.capturaRecorrido}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" tabIndex={-1}>
              <PenLine />
              {TEXTOS.panel.marcar}
            </Button>
            <Button variant="outline" size="sm" tabIndex={-1}>
              <ImagePlus />
              {TEXTOS.panel.sumarImagen}
            </Button>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              {TEXTOS.panel.quitar}
            </Button>
          </div>
        </>
      ) : principal ? (
        <>
          <button
            type="button"
            onClick={() => onMarcar(principal.id)}
            className="group relative block cursor-zoom-in overflow-hidden rounded-md border bg-background"
            title={TEXTOS.panel.marcar}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, no pasa por next/image */}
            <img
              src={(principal.aplanada ?? principal.original).url}
              alt={TEXTOS.panel.fotoDe}
              className="max-h-[42vh] w-full object-contain object-top"
            />
          </button>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-9 sm:h-7" onClick={() => onMarcar(principal.id)}>
              <PenLine />
              {TEXTOS.panel.marcar}
            </Button>
            {botonSumar}
            <Button variant="ghost" size="sm" className="h-9 sm:h-7" onClick={() => onQuitar(principal.id)}>
              {TEXTOS.panel.quitar}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1.5 rounded-lg border-[1.5px] border-dashed px-4 py-4 text-center text-[13px] text-muted-foreground">
            <CameraOff className="size-5" />
            <span>
              {captura === "fallo" ? TEXTOS.panel.capturaFallo : captura === "quitada" ? TEXTOS.panel.capturaQuitada : TEXTOS.panel.pegarHint}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">{botonSumar}</div>
        </>
      )}

      {!recorrido && resto.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resto.map((i) => (
            <div key={i.id} className="relative">
              <button
                type="button"
                onClick={() => onMarcar(i.id)}
                title={TEXTOS.panel.marcar}
                className="block overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL local */}
                <img src={(i.aplanada ?? i.original).url} alt="Imagen sumada" className="h-12 w-16 object-cover" />
              </button>
              <button
                type="button"
                onClick={() => onQuitar(i.id)}
                aria-label={TEXTOS.panel.quitar}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-popover text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!recorrido && principal && <p className="hidden text-[12px] text-muted-foreground sm:block">{TEXTOS.panel.pegarHint}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (archivos.length) onSumar(archivos);
        }}
      />
    </section>
  );
}

function TarjetaTipo({ tipo, elegido, onElegir }: { tipo: TipoReporte; elegido: boolean; onElegir: () => void }) {
  const Icono = ICONO_TIPO[tipo];
  const tono = TONO_TIPO[tipo];
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onElegir}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg border-[1.5px] bg-background px-2.5 py-2.5 text-left transition-colors sm:flex-col sm:items-start sm:gap-1.5",
        !elegido && "border-border hover:border-muted-foreground",
      )}
      style={elegido ? { borderColor: tono.borde, backgroundColor: tono.fondo } : undefined}
    >
      <b className="flex w-28 shrink-0 items-center gap-1.5 text-[13.5px] font-semibold sm:w-auto">
        <Icono className="size-4" style={{ color: tono.texto }} />
        {TIPOS[tipo].etiqueta}
      </b>
      <small className="text-[11.5px] leading-snug text-muted-foreground">{TIPOS[tipo].texto}</small>
    </button>
  );
}

/** El «flash» de la foto: blanco que se apaga en medio segundo. Sin él no se nota que se sacó. */
function Destello() {
  const [apagado, setApagado] = useState(false);
  // Sólo se monta después de un clic (nunca en el servidor): se puede leer matchMedia acá.
  const [fuera, setFuera] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (fuera) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setApagado(true));
    });
    return () => cancelAnimationFrame(id);
  }, [fuera]);
  if (fuera) return null;
  return (
    <div
      {...EXCLUIR}
      aria-hidden
      onTransitionEnd={() => setFuera(true)}
      className="pointer-events-none fixed inset-0 z-[60] bg-white transition-opacity duration-500 ease-out"
      style={{ opacity: apagado ? 0 : 0.7 }}
    />
  );
}
