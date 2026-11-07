"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Bot, ExternalLink, FileText, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Hilo, useSeguirAbajo } from "@/components/asistente/hilo";
import { Compositor } from "@/components/asistente/compositor";
import { TarjetaAccion, TarjetaMandar, TarjetaPdf } from "@/components/asistente/tarjetas";
import { subirAdjunto, useChat, useConversacion, type Adjunto } from "@/hooks/use-asistente";
import {
  decidirAccion, ErrorConBorrador, guardarFormulario, interpretar, llamarHerramienta, tomarPropuesta, useContextoCotizador,
} from "@/hooks/use-cotizador";
import { recalcular, type ResultadoBorrador } from "@/lib/asistente/borrador";
import type { AccionVista, BorradorVista, PdfVista } from "@/lib/asistente/eventos";
import type { ClienteResumen } from "@/lib/odoo/comercial";
import type { Vecina } from "@/lib/catastro/caba";
import { aplicarFormulario, formularioDesdeBorrador, seccionDeFaltante, type Formulario } from "@/lib/cotizador-rapido/formulario";
import { aplicarPropuesta, type Cambio } from "@/lib/cotizador-rapido/propuesta";
import type { PropuestaIA } from "@/lib/cotizador-rapido/interpretar";
import { cn } from "@/lib/utils";
import { pesos } from "./campos";
import {
  loteVigente, SeccionCliente, SeccionCondiciones, SeccionJornadas, SeccionObra, SeccionTextos, SeccionTipo, setTarifasPlantillas, type EstadoCatastro,
} from "./secciones";

// El cotizador rápido sobre una conversación del asistente (docs/asistente-comercial/cotizador-rapido.md).
//
// La pantalla trabaja con una copia del formulario: cada cambio se ve al instante (el motor corre
// en el navegador) y se guarda en el servidor a los 0,7 s, que lo vuelve a calcular y es el que
// manda. Si el chat cambia el borrador, la pantalla lo vuelve a leer cuando no hay nada sin guardar.

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

type Faltante = { texto: string; seccion: string };

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const contexto = useContextoCotizador();
  const tarifas = contexto.data?.tarifas ?? null;
  const chat = useChat(id);
  const detalle = useConversacion(id, { seguirTurno: !chat.respondiendo });
  const chatOcupado = chat.respondiendo || !!detalle.data?.conversacion.trabajando;

  const [servidor, setServidor] = useState<BorradorVista | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const formRef = useRef<Formulario | null>(null);
  const versionRef = useRef(0);
  const pendiente = useRef(false);
  const enCurso = useRef<Promise<void> | null>(null);
  const otraVez = useRef(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardandoForm, setGuardandoForm] = useState(false);

  useEffect(() => {
    if (tarifas) setTarifasPlantillas(tarifas);
  }, [tarifas]);

  const adoptar = useCallback((b: BorradorVista, forzar = false) => {
    setServidor(b);
    versionRef.current = b.version;
    if (forzar || !pendiente.current) {
      const f = formularioDesdeBorrador(b.datos);
      formRef.current = f;
      setForm(f);
    }
    qc.setQueryData(["asistente-conversacion", id], (old: unknown) => (old && typeof old === "object" ? { ...(old as object), borrador: b } : old));
  }, [id, qc]);

  // El borrador de la conversación (al abrir, y cuando lo cambia el chat).
  const delServidor = detalle.data?.borrador ?? null;
  useEffect(() => {
    if (!delServidor) return;
    if (!servidor || delServidor.id !== servidor.id || delServidor.version > versionRef.current) {
      if (!pendiente.current || delServidor.id !== servidor?.id) adoptar(delServidor, delServidor.id !== servidor?.id);
    }
  }, [delServidor, servidor, adoptar]);

  const persistir = useCallback((): Promise<void> => {
    if (enCurso.current) {
      otraVez.current = true;
      return enCurso.current;
    }
    const correr = async () => {
      setGuardandoForm(true);
      do {
        otraVez.current = false;
        const f = formRef.current;
        if (!f) break;
        try {
          const r = await guardarFormulario(id, versionRef.current, f);
          versionRef.current = r.borrador.version;
          setServidor(r.borrador);
          qc.setQueryData(["asistente-conversacion", id], (old: unknown) => (old && typeof old === "object" ? { ...(old as object), borrador: r.borrador } : old));
        } catch (e) {
          pendiente.current = false;
          if (e instanceof ErrorConBorrador && e.status === 409 && e.borrador) {
            toast.warning(e.message);
            adoptar(e.borrador, true);
          } else {
            toast.error(e instanceof Error ? e.message : "No se pudo guardar");
          }
          setGuardandoForm(false);
          return;
        }
      } while (otraVez.current);
      pendiente.current = false;
      setGuardandoForm(false);
    };
    enCurso.current = correr().finally(() => {
      enCurso.current = null;
    });
    return enCurso.current;
  }, [id, qc, adoptar]);

  const cambiar = useCallback((fn: (f: Formulario) => Formulario) => {
    const actual = formRef.current;
    if (!actual) return;
    const nuevo = fn(actual);
    formRef.current = nuevo;
    setForm(nuevo);
    pendiente.current = true;
    if (enCurso.current) otraVez.current = true;
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void persistir(), 700);
  }, [persistir]);

  /** Antes de llamar al servidor por otra cosa: lo cargado tiene que estar guardado. */
  const alDia = useCallback(async () => {
    if (reloj.current) clearTimeout(reloj.current);
    if (pendiente.current || enCurso.current) await persistir();
    if (enCurso.current) await enCurso.current;
  }, [persistir]);

  // Guardar al salir de la pestaña.
  useEffect(() => {
    const salir = () => { if (pendiente.current) void persistir(); };
    window.addEventListener("pagehide", salir);
    return () => window.removeEventListener("pagehide", salir);
  }, [persistir]);

  /** Respuesta de una herramienta: el borrador nuevo (sin pisar lo que se esté escribiendo). */
  const tomarBorrador = useCallback((b: BorradorVista) => {
    if (b.id !== servidor?.id) return adoptar(b, true);
    setServidor(b);
    versionRef.current = b.version;
    if (!pendiente.current) {
      const f = formularioDesdeBorrador(b.datos);
      formRef.current = f;
      setForm(f);
    }
  }, [servidor?.id, adoptar]);

  // ── La vista previa: el motor en el navegador, con lo que hay en pantalla ─────────────
  const vista = useMemo<{ b: BorradorVista; r: ResultadoBorrador | null } | null>(() => {
    if (!servidor || !form) return null;
    if (!tarifas || servidor.datos.calculos.alquiler) return { b: servidor, r: servidor.resultado };
    const datos = aplicarFormulario(servidor.datos, form, { tarifas });
    const r = recalcular(datos, { tarifas, lista: null, hoy: hoy() });
    return { b: { ...servidor, datos, resultado: r }, r };
  }, [servidor, form, tarifas]);

  const faltantes: Faltante[] = useMemo(() => {
    const out: Faltante[] = (vista?.r?.faltantes ?? []).map((x) => ({ texto: x.texto.replace(/\s*\((verificar_frente_lote|usar_foto_como_render)[^)]*\)/g, "").replace(/con usar_foto_como_render/g, "con «Subir foto»"), seccion: `s-${seccionDeFaltante(x)}` }));
    const deducidos = Object.entries(form?.ia ?? {}).filter(([, v]) => v.deducido).map(([k]) => k);
    if (deducidos.length) out.unshift({ texto: `Confirmá lo que dedujo la IA (${deducidos.length})`, seccion: "s-tipo" });
    return out;
  }, [vista, form?.ia]);
  const seccionesConFalta = new Set(faltantes.map((x) => x.seccion));

  // ── Catastro y conflicto de canal, al salir de la dirección ────────────────────────────
  const [catastro, setCatastro] = useState<EstadoCatastro>({ estado: "nada" });
  const ultimaDir = useRef<string | null>(null);
  const verificarDireccion = useCallback(async (forzar = false) => {
    const f = formRef.current;
    const dir = f?.obra.direccion.trim();
    if (!f || !dir) return;
    if (!forzar && ultimaDir.current === dir) return;
    ultimaDir.current = dir;
    await alDia();
    if (f.obra.enCaba !== false && !loteVigente(servidor, dir)) {
      setCatastro({ estado: "cargando" });
      try {
        const r = await llamarHerramienta(id, "verificar_frente_lote", { direccion: dir });
        tomarBorrador(r.borrador);
        const c = r.contenido as { estado?: string; direccion?: string; vecinas?: Vecina[]; motivo?: string } | string;
        if (typeof c === "object" && c?.estado === "puerta_no_oficial") setCatastro({ estado: "vecinas", direccion: c.direccion ?? dir, vecinas: c.vecinas ?? [] });
        else if (typeof c === "object" && c?.estado === "fuera_de_caba") {
          setCatastro({ estado: "nada" });
          cambiar((x) => ({ ...x, obra: { ...x.obra, enCaba: false } }));
        } else if (r.esError) setCatastro({ estado: "error", mensaje: typeof c === "string" ? c : c?.motivo ?? "No se pudo verificar el frente." });
        else {
          setCatastro({ estado: "nada" });
          if (formRef.current?.obra.enCaba === null) cambiar((x) => ({ ...x, obra: { ...x.obra, enCaba: true } }));
        }
      } catch (e) {
        setCatastro({ estado: "error", mensaje: e instanceof Error ? e.message : "El catastro no respondió." });
      }
    }
    try {
      const r = await llamarHerramienta(id, "verificar_conflicto_canal", { direccion: formRef.current?.obra.direccion.trim() || dir });
      tomarBorrador(r.borrador);
    } catch {
      // Queda el faltante «revisar si otro vendedor…»: se reintenta al guardar.
    }
  }, [id, servidor, alDia, tomarBorrador, cambiar]);

  const elegirVecina = async (smp: string) => {
    setCatastro({ estado: "cargando" });
    await alDia();
    try {
      const r = await llamarHerramienta(id, "verificar_frente_lote", { smp });
      tomarBorrador(r.borrador);
      setCatastro(r.esError ? { estado: "error", mensaje: String(r.contenido) } : { estado: "nada" });
    } catch (e) {
      setCatastro({ estado: "error", mensaje: e instanceof Error ? e.message : "No se pudo." });
    }
  };
  const declararFrente = async (metros: number, origen: string) => {
    await alDia();
    try {
      const r = await llamarHerramienta(id, "verificar_frente_lote", { frenteConfirmado: metros, origen });
      tomarBorrador(r.borrador);
      if (r.esError) toast.error(String(r.contenido));
      else setCatastro({ estado: "nada" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo.");
    }
  };

  const buscarClientes = useCallback(async (texto: string) => {
    const r = await llamarHerramienta(id, "buscar_clientes", { texto });
    return (Array.isArray(r.contenido) ? r.contenido : []) as ClienteResumen[];
  }, [id]);

  // ── Pegar e interpretar ────────────────────────────────────────────────────────────────
  const [pegado, setPegado] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [cambiosIa, setCambiosIa] = useState<Cambio[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const usarPropuesta = useCallback((p: PropuestaIA) => {
    const f = formRef.current;
    if (!f) return;
    const r = aplicarPropuesta(f, p, Date.now().toString(36));
    if (r.completados) cambiar(() => r.formulario);
    if (r.cambios.length) setCambiosIa(r.cambios);
    if (p.nota) toast.info(p.nota);
    if (!r.completados && !r.cambios.length && !p.s0) toast.info("No encontré datos nuevos en lo que pegaste.");
    else if (r.completados) toast.success(`La IA completó ${r.completados} dato${r.completados === 1 ? "" : "s"}.`);
    // Con la dirección nueva, al catastro.
    if (r.formulario.obra.direccion && r.formulario.obra.direccion !== f.obra.direccion) setTimeout(() => void verificarDireccion(true), 50);
    if (p.s0) void abrirS0(p.s0, "editar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cambiar, verificarDireccion]);

  // La propuesta que se leyó en la pantalla de inicio, una vez.
  const propuestaInicial = useRef(false);
  useEffect(() => {
    if (!form || propuestaInicial.current) return;
    propuestaInicial.current = true;
    const p = tomarPropuesta(id);
    if (p) usarPropuesta(p);
  }, [form, id, usarPropuesta]);

  const adjuntar = async (archivos: File[]) => {
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      const subidos = await Promise.all(archivos.slice(0, 6).map((a) => subirAdjunto(id, a)));
      setAdjuntos((xs) => [...xs, ...subidos].slice(0, 6));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  };

  const leer = async () => {
    if (!pegado.trim() && !adjuntos.length) return;
    setLeyendo(true);
    try {
      const r = await interpretar(id, pegado, adjuntos.map(({ path, tipo, nombre }) => ({ path, tipo, nombre })));
      setPegado("");
      setAdjuntos([]);
      usarPropuesta(r.propuesta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer");
    } finally {
      setLeyendo(false);
    }
  };

  // ── Abrir un S0 ────────────────────────────────────────────────────────────────────────
  const [ventaVieja, setVentaVieja] = useState<{ venta: string; lineas: { descripcion: string; subtotal?: number }[] } | null>(null);
  const abrirS0 = async (venta: string, modo: "editar" | "reemitir") => {
    await alDia();
    try {
      const r = await llamarHerramienta(id, modo === "editar" ? "editar_presupuesto" : "nuevo_borrador", modo === "editar" ? { venta } : { desdeVenta: venta });
      if (r.esError) return void toast.error(typeof r.contenido === "string" ? r.contenido : "No se pudo abrir.");
      adoptar(r.borrador, true);
      const c = r.contenido as { ventaVieja?: { venta: string; lineas: { descripcion: string; subtotal?: number }[] } };
      setVentaVieja(modo === "reemitir" && c.ventaVieja ? c.ventaVieja : null);
      void qc.invalidateQueries({ queryKey: ["asistente-conversacion", id] });
      toast.success(modo === "editar" ? `Abrí ${venta}: al guardar se actualiza la misma orden.` : `Re-emisión de ${venta}: al guardar se cancela la vieja.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir.");
    }
  };

  // ── Render propio ──────────────────────────────────────────────────────────────────────
  const [vistaPropia, setVistaPropia] = useState<string | null>(null);
  const [subiendoRender, setSubiendoRender] = useState(false);
  const subirRender = async (archivo: File) => {
    setSubiendoRender(true);
    try {
      const a = await subirAdjunto(id, archivo);
      setVistaPropia(a.vista ?? null);
      cambiar((x) => ({ ...x, render: { eleccion: "propio", renderId: null, path: a.path } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendoRender(false);
    }
  };

  // ── PDF y guardar en Odoo ──────────────────────────────────────────────────────────────
  const [pdf, setPdf] = useState<PdfVista | null>(null);
  const [haciendoPdf, setHaciendoPdf] = useState(false);
  const vistaPrevia = async () => {
    setHaciendoPdf(true);
    await alDia();
    try {
      const r = await llamarHerramienta(id, "generar_pdf");
      const e = r.eventos.find((x) => x.t === "pdf");
      if (e && e.t === "pdf") setPdf(e.pdf);
      else toast.error(typeof r.contenido === "string" ? r.contenido : "No se pudo generar el PDF.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setHaciendoPdf(false);
    }
  };

  const [accion, setAccion] = useState<AccionVista | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [listo, setListo] = useState<{ numero: string | null; pdf: PdfVista | null; whatsapp: string | null } | null>(null);
  const [intento, setIntento] = useState(false);

  const irA = (seccion: string) => document.getElementById(seccion)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const guardarEnOdoo = async () => {
    if (faltantes.length) {
      setIntento(true);
      irA(faltantes[0].seccion);
      return toast.warning(`Falta: ${faltantes[0].texto}`);
    }
    setPreparando(true);
    await alDia();
    try {
      // El conflicto de canal se revisa siempre; si no se pudo al salir de la dirección, ahora.
      if (!servidor?.datos.conflictoCanal.revisado && formRef.current?.obra.direccion) {
        const c = await llamarHerramienta(id, "verificar_conflicto_canal", { direccion: formRef.current.obra.direccion });
        tomarBorrador(c.borrador);
      }
      const r = await llamarHerramienta(id, "guardar_presupuesto_odoo");
      tomarBorrador(r.borrador);
      const e = r.eventos.find((x) => x.t === "accion");
      if (r.esError || !e || e.t !== "accion") {
        const c = r.contenido as { faltan?: string[] } | string;
        return void toast.error(typeof c === "string" ? c : c?.faltan?.join(" · ") ?? "No se pudo preparar el guardado.");
      }
      setAccion(e.accion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar el guardado.");
    } finally {
      setPreparando(false);
    }
  };

  const decidir = async (decision: "confirmar" | "rechazar" | "reintentar") => {
    if (!accion) return;
    if (decision === "rechazar") {
      setAccion(null);
      void decidirAccion(accion.id, "rechazar").catch(() => {});
      return;
    }
    setConfirmando(true);
    try {
      const r = await decidirAccion(accion.id, decision);
      setAccion(r.accion);
      if (r.borrador) adoptar(r.borrador, true);
      if (r.ok) {
        setAccion(null);
        setListo({ numero: r.borrador?.odooVentaNombre ?? null, pdf: r.pdf, whatsapp: r.whatsapp });
        void qc.invalidateQueries({ queryKey: ["asistente-conversaciones"] });
      } else {
        toast.error(r.motivo ?? r.accion.error ?? "No se pudo guardar en Odoo.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar en Odoo.");
    } finally {
      setConfirmando(false);
    }
  };

  // ── El chat al costado ─────────────────────────────────────────────────────────────────
  const [verChat, setVerChat] = useState(false);
  const [verResumen, setVerResumen] = useState(false);

  if (detalle.error) {
    return <p className="p-6 text-destructive">{detalle.error instanceof Error ? detalle.error.message : "No se pudo abrir el presupuesto."}</p>;
  }
  if (!form || !servidor || !tarifas || !vista) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  const r = vista.r;
  const titulo = [form.cliente.razonSocial, form.obra.direccion].filter(Boolean).join(" · ") || "Presupuesto nuevo";
  const iaLlenos = Object.keys(form.ia).length;
  const deducidos = Object.values(form.ia).filter((x) => x.deducido).length;
  const bloqueado = chatOcupado;

  const resumen = (
    <Resumen r={r} faltantes={faltantes} intento={intento} onIr={(s) => { setVerResumen(false); irA(s); }} servidor={servidor}
      onGuardar={guardarEnOdoo} preparando={preparando} onPdf={vistaPrevia} haciendoPdf={haciendoPdf} pdf={pdf} />
  );

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pb-28 xl:pb-6">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="size-11" onClick={async () => { await alDia(); router.push("/comercial/asistente/cotizar"); }} aria-label="Volver al cotizador">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold">{titulo}</h1>
          <p className="truncate text-[13px] text-muted-foreground">
            {servidor.odooVentaNombre ? `Editando ${servidor.odooVentaNombre} en Odoo` : "Borrador sin guardar en Odoo"}
            {guardandoForm ? " · guardando…" : ""}
          </p>
        </div>
        {servidor.odooVentaUrl && (
          <a href={servidor.odooVentaUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 px-2 text-[14px] text-primary hover:underline">Ver en Odoo <ExternalLink className="size-3.5" /></a>
        )}
        <Button variant={verChat ? "default" : "outline"} className="h-11 gap-2" onClick={() => setVerChat(true)}>
          <Bot className="size-4" /> Asistente
        </Button>
      </header>

      {bloqueado && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-[14px]">
          <Loader2 className="size-4 animate-spin text-primary" /> El asistente está trabajando en este presupuesto: el formulario se actualiza cuando termine.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className={cn("flex min-w-0 flex-col gap-4", bloqueado && "pointer-events-none opacity-60")}>
          {/* Pegar más datos o escribir un cambio */}
          <section className="rounded-xl border border-border bg-card p-4">
            <label htmlFor="pegar" className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Sparkles className="size-4 text-primary" /> Pegá datos o escribí un cambio</label>
            <textarea id="pegar" value={pegado} onChange={(e) => setPegado(e.target.value)}
              onPaste={(e) => { const fs = Array.from(e.clipboardData.files ?? []); if (fs.length) { e.preventDefault(); void adjuntar(fs); } }}
              placeholder="El formulario de alta, el WhatsApp del cliente, tu lista de precios, o «finalmente quiere sólo 20 m y sin técnico»…"
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-background p-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {adjuntos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {adjuntos.map((a, i) => (
                  <span key={a.path} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[13px]">
                    {a.nombre}
                    <button type="button" aria-label="Quitar adjunto" onClick={() => setAdjuntos((xs) => xs.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-muted">
                {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Adjuntar
                <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void adjuntar(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              </label>
              <Button className="h-11 bg-hd-boton px-5 text-white hover:bg-hd-boton-hover" disabled={leyendo || subiendo || (!pegado.trim() && !adjuntos.length)} onClick={leer}>
                {leyendo ? <><Loader2 className="animate-spin" /> Leyendo…</> : "Completar"}
              </Button>
            </div>
          </section>

          {cambiosIa && cambiosIa.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-primary bg-card">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-[14px] font-semibold">Lo que pegaste cambia esto</div>
              <div className="flex flex-col gap-1 p-4">
                {cambiosIa.map((c, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 border-b border-border py-1.5 text-[14px] last:border-0">
                    <span>{c.campo}</span>
                    <span className="font-mono"><span className="text-muted-foreground line-through">{c.de}</span> → <span className="font-semibold text-primary">{c.a}</span></span>
                  </div>
                ))}
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="outline" className="h-11" onClick={() => setCambiosIa(null)}>Descartar</Button>
                  <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => { const cs = cambiosIa; setCambiosIa(null); cambiar((f) => cs.reduce((x, c) => c.aplicar(x), f)); }}>Aplicar</Button>
                </div>
              </div>
            </section>
          )}

          {iaLlenos > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-primary/5 px-3.5 py-2.5 text-[14px]">
              <b>La IA completó {iaLlenos} dato{iaLlenos === 1 ? "" : "s"}</b>
              {deducidos > 0 && <span className="text-amber-700 dark:text-amber-300">· {deducidos} para confirmar</span>}
              <span className="text-muted-foreground">· pasá el mouse por la marca <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">IA</span> para ver de dónde salió</span>
            </div>
          )}

          {ventaVieja && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-[14px]">
              <p className="mb-1 font-semibold">Re-emisión de {ventaVieja.venta}: así estaba (cotizalo de nuevo a valor de hoy)</p>
              {ventaVieja.lineas.slice(0, 12).map((l, i) => <p key={i} className="text-muted-foreground">· {l.descripcion}{l.subtotal ? ` — ${pesos(l.subtotal)}` : ""}</p>)}
            </div>
          )}

          <SeccionCliente f={form} cambiar={cambiar} buscar={buscarClientes} alerta={intento && seccionesConFalta.has("s-cliente")} />
          <SeccionObra f={form} cambiar={cambiar} borrador={vista.b} catastro={catastro} alerta={intento && seccionesConFalta.has("s-obra")}
            onDireccion={() => void verificarDireccion(true)} onVecina={elegirVecina} onFrente={declararFrente} />
          <SeccionTipo f={form} cambiar={cambiar} tarifas={tarifas} borrador={vista.b} alerta={intento && seccionesConFalta.has("s-tipo")} />
          <SeccionJornadas f={form} cambiar={cambiar} renders={contexto.data?.renders ?? []} alertaJornadas={intento && seccionesConFalta.has("s-jornadas")}
            alertaRender={intento && seccionesConFalta.has("s-render")} onSubir={subirRender} subiendo={subiendoRender} vistaPropia={vistaPropia}
            onDespues={async () => { await alDia(); toast.success("Quedó en «Para seguir»."); router.push("/comercial/asistente/cotizar"); }} />
          <SeccionCondiciones f={form} cambiar={cambiar} tarifas={tarifas} alerta={intento && seccionesConFalta.has("s-condiciones")} />
          <SeccionTextos f={form} cambiar={cambiar} borrador={vista.b} alerta={intento && seccionesConFalta.has("s-textos")} />
        </div>

        <aside className="hidden xl:sticky xl:top-4 xl:block">{resumen}</aside>
      </div>

      {/* Celular: el total y Guardar en la zona del pulgar; el resumen sube en una hoja. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden">
        <button type="button" onClick={() => setVerResumen(true)} className="flex min-h-12 flex-1 flex-col items-start justify-center rounded-lg border border-border px-3 text-left">
          <span className="text-[12px] text-muted-foreground">Total con IVA · ver</span>
          <span className="font-mono text-[15px] font-semibold tabular-nums">{pesos(r?.totales.total ?? 0)}</span>
        </button>
        <Button className={cn("h-12 flex-1 text-[15px]", faltantes.length ? "" : "bg-hd-boton text-white hover:bg-hd-boton-hover")} variant={faltantes.length ? "secondary" : "default"} onClick={guardarEnOdoo} disabled={preparando}>
          {preparando ? <Loader2 className="animate-spin" /> : faltantes.length ? `Faltan ${faltantes.length}` : servidor.odooVentaNombre ? "Guardar cambios" : "Guardar en Odoo"}
        </Button>
      </div>
      <Sheet open={verResumen} onOpenChange={setVerResumen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetTitle className="sr-only">Resumen</SheetTitle>
          {resumen}
        </SheetContent>
      </Sheet>

      <Sheet open={verChat} onOpenChange={setVerChat}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 pt-[env(safe-area-inset-top)] sm:max-w-md">
          <SheetTitle className="border-b border-border px-4 py-3 text-[15px]">Asistente</SheetTitle>
          <ChatLateral id={id} chat={chat} detalle={detalle.data ?? null} antes={alDia} />
        </SheetContent>
      </Sheet>

      <Dialog open={!!accion || !!listo} onOpenChange={(o) => { if (!o && !confirmando) { if (accion) void decidir("rechazar"); setListo(null); } }}>
        <DialogContent className="sm:max-w-lg">
          {listo ? (
            <>
              <DialogHeader>
                <DialogTitle>{listo.numero ? `Quedó como ${listo.numero}` : "Guardado en Odoo"}</DialogTitle>
                <DialogDescription>Con el PDF final adjunto en la orden.</DialogDescription>
              </DialogHeader>
              {listo.pdf && listo.whatsapp ? (
                <TarjetaMandar pdf={listo.pdf} texto={listo.whatsapp} telefono={servidor.datos.cliente.celular} nombre={servidor.datos.cliente.contacto} />
              ) : listo.pdf ? <TarjetaPdf pdf={listo.pdf} /> : null}
              <DialogFooter>
                <Button variant="outline" className="h-11" onClick={() => setListo(null)}>Seguir acá</Button>
                <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => router.push("/comercial/asistente/cotizar")}>Cotizar otro</Button>
              </DialogFooter>
            </>
          ) : accion ? (
            <>
              <DialogHeader>
                <DialogTitle>{accion.tipo === "reemitir_presupuesto" ? "¿Re-emito el presupuesto?" : servidor.odooVentaNombre ? `¿Guardo los cambios en ${servidor.odooVentaNombre}?` : "¿Lo guardo en Odoo?"}</DialogTitle>
                <DialogDescription>Revisá el resumen: se escribe en Odoo recién cuando confirmás.</DialogDescription>
              </DialogHeader>
              <pre className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-[14px] leading-relaxed">{accion.resumen}</pre>
              {accion.estado === "error" || accion.estado === "incierto" ? <p className="text-[14px] text-destructive">{accion.error}</p> : null}
              <DialogFooter>
                <Button variant="outline" className="h-11" disabled={confirmando} onClick={() => decidir("rechazar")}>Mejor no</Button>
                <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" disabled={confirmando} onClick={() => decidir(accion.reintentable ? "reintentar" : "confirmar")}>
                  {confirmando ? <><Loader2 className="animate-spin" /> Guardando en Odoo…</> : accion.reintentable ? "Reintentar" : "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumen({ r, faltantes, intento, onIr, servidor, onGuardar, preparando, onPdf, haciendoPdf, pdf }: {
  r: ResultadoBorrador | null; faltantes: Faltante[]; intento: boolean; onIr: (s: string) => void; servidor: BorradorVista;
  onGuardar: () => void; preparando: boolean; onPdf: () => void; haciendoPdf: boolean; pdf: PdfVista | null;
}) {
  const base = r?.lineas.filter((l) => l.seccion === "base") ?? [];
  const otras = r?.lineas.filter((l) => l.seccion !== "base") ?? [];
  const avisos = (r?.avisos ?? []).filter((a) => a.nivel === "advertencia" && !["frente_mayor", "frente_menor", "esquina"].includes(a.codigo));
  const fila = (l: { id: string; descripcion: string; calculo: string; importe: number }, gris?: boolean) => (
    <div key={l.id} className={cn("flex justify-between gap-3 border-b border-border py-2 text-[14px]", gris && "text-muted-foreground")}>
      <div className="min-w-0"><p className="leading-snug">{l.descripcion.split(" — ")[0]}</p><p className="font-mono text-[12px] text-muted-foreground">{l.calculo}</p></div>
      <span className="shrink-0 font-mono tabular-nums">{pesos(l.importe)}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5"><h2 className="text-[14px] font-semibold">Resumen</h2><span className="text-[12px] text-muted-foreground">se recalcula solo</span></div>
        <div className="px-4 pb-3">
          <p className="pt-3 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Base · va a Odoo</p>
          {base.length ? base.map((l) => fila(l)) : <p className="py-2 text-[14px] text-muted-foreground">Todavía no hay base.</p>}
          {otras.length > 0 && <><p className="pt-3 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Sólo en el PDF</p>{otras.map((l) => fila(l, true))}</>}
          <div className="flex justify-between pt-3 text-[14px]"><span>Subtotal neto</span><span className="font-mono tabular-nums">{pesos(r?.totales.subtotal ?? 0)}</span></div>
          <div className="flex justify-between text-[13px] text-muted-foreground"><span>IVA</span><span className="font-mono tabular-nums">{pesos(r?.totales.iva ?? 0)}</span></div>
          <div className="flex justify-between pt-1 text-[18px] font-bold"><span>Total con IVA</span><span className="font-mono tabular-nums">{pesos(r?.totales.total ?? 0)}</span></div>
          {r?.totales.renovacion && <p className="text-[13px] text-muted-foreground">Renovación ({r.totales.renovacion.pct} %): <span className="font-mono">{pesos(r.totales.renovacion.monto)}</span> por período</p>}
        </div>
      </section>
      {avisos.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[13px] text-amber-800 dark:text-amber-200">
          {avisos.map((a) => <p key={a.codigo}>{a.texto}</p>)}
        </div>
      )}
      {faltantes.length ? (
        <section className={cn("rounded-xl border bg-card", intento ? "border-destructive/60" : "border-amber-500/50")}>
          <div className="border-b border-border px-4 py-2.5 text-[14px] font-semibold">Faltan {faltantes.length} para guardar</div>
          <div className="flex flex-col px-4 py-2">
            {faltantes.map((x, i) => (
              <button key={i} type="button" onClick={() => onIr(x.seccion)} className="min-h-10 py-1 text-left text-[14px] text-primary underline-offset-2 hover:underline">{x.texto}</button>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2.5 text-[14px] text-emerald-800 dark:text-emerald-200">Listo para guardar: no falta nada.</p>
      )}
      <Button className={cn("h-12 w-full text-[16px]", !faltantes.length && "bg-hd-boton text-white hover:bg-hd-boton-hover")} variant={faltantes.length ? "secondary" : "default"} onClick={onGuardar} disabled={preparando}>
        {preparando ? <Loader2 className="animate-spin" /> : faltantes.length ? `Faltan ${faltantes.length} para guardar` : servidor.odooVentaNombre ? `Guardar cambios en ${servidor.odooVentaNombre}` : "Guardar en Odoo"}
      </Button>
      <Button variant="outline" className="h-11 w-full gap-2" onClick={onPdf} disabled={haciendoPdf}>
        {haciendoPdf ? <Loader2 className="animate-spin" /> : <FileText className="size-4" />} Vista previa del PDF
      </Button>
      {pdf && <TarjetaPdf key={pdf.id} pdf={pdf} />}
    </div>
  );
}

type Chat = ReturnType<typeof useChat>;
type Detalle = NonNullable<ReturnType<typeof useConversacion>["data"]>;

function ChatLateral({ id, chat, detalle, antes }: { id: string; chat: Chat; detalle: Detalle | null; antes: () => Promise<void> }) {
  const ocupado = chat.respondiendo || !!detalle?.conversacion.trabajando;
  const [cajaRef, contenidoRef] = useSeguirAbajo(id, ocupado);
  const acciones = useMemo(() => {
    const porId = new Map(chat.acciones.map((a) => [a.id, a]));
    for (const a of detalle?.acciones ?? []) porId.set(a.id, a);
    return [...porId.values()].filter((a) => ["propuesta", "presentada", "ejecutando"].includes(a.estado)).sort((a, b) => b.numero - a.numero).slice(0, 2);
  }, [chat.acciones, detalle?.acciones]);
  useEffect(() => {
    if (chat.error) toast.error(chat.error);
  }, [chat.error]);
  return (
    <>
      <div ref={cajaRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div ref={contenidoRef} className="space-y-4">
          {(detalle?.items.length ?? 0) === 0 && !ocupado && (
            <p className="text-[14px] text-muted-foreground">
              Trabaja sobre este mismo presupuesto: pedile una torre por piezas, etapas, un plan de cuotas, o consultas de Odoo y del tablero. Lo que cambie se ve en el formulario cuando termina.
            </p>
          )}
          <Hilo items={detalle?.items ?? []} enVivo={chat.enVivo} respondiendo={ocupado} />
          {!ocupado && acciones.map((a) => <TarjetaAccion key={a.id} accion={a} onDecidir={(aid, d) => void chat.decidir(aid, d)} ocupado={chat.respondiendo} />)}
        </div>
      </div>
      <Compositor
        key={id}
        conversacionId={id}
        respondiendo={ocupado}
        onEnviar={async (texto, adjuntos) => { await antes(); return chat.enviar(texto, adjuntos); }}
        onParar={chat.parar}
        transcripcionDisponible
      />
    </>
  );
}
