"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Bot, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subirAdjunto, useConversaciones } from "@/hooks/use-asistente";
import { crearCotizacion, dejarPropuesta, interpretar, llamarHerramienta } from "@/hooks/use-cotizador";
import type { Formulario } from "@/lib/cotizador-rapido/formulario";

// La entrada del cotizador: pegar lo que se tenga (y la IA arma el presupuesto) o elegir el tipo.
// Abajo, los presupuestos sin terminar para seguir.

const TIPOS: { tipo: Formulario["tipo"]; titulo: string; detalle: string }[] = [
  { tipo: "bandeja", titulo: "Bandeja", detalle: "Por metro lineal · 3, 4 o 6 m" },
  { tipo: "desglosado", titulo: "Desglosado", detalle: "Torres, plataformas, escaleras: renglones con tus precios" },
  { tipo: "fachada", titulo: "Fachada", detalle: "Por m² · frentes del catastro" },
];

export function Inicio() {
  const router = useRouter();
  const lista = useConversaciones();
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [s0, setS0] = useState("");
  const [verS0, setVerS0] = useState(false);

  const abrir = (id: string) => router.push(`/comercial/asistente/cotizar?c=${id}`);

  const nuevo = async (tipo?: Formulario["tipo"]) => {
    setOcupado(tipo ?? "nuevo");
    try {
      const { conversacion } = await crearCotizacion(tipo);
      abrir(conversacion.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el presupuesto");
      setOcupado(null);
    }
  };

  const abrirS0 = async (venta: string, modo: "editar" | "reemitir") => {
    const numero = venta.trim().toUpperCase().replace(/^S?0?(\d+)$/, (_, n) => `S${String(n).padStart(5, "0")}`);
    if (!/^S\d{4,6}$/.test(numero)) return void toast.error("Escribí el número del presupuesto: S01917.");
    setOcupado(`s0-${modo}`);
    try {
      const { conversacion } = await crearCotizacion("bandeja");
      const r = await llamarHerramienta(conversacion.id, modo === "editar" ? "editar_presupuesto" : "nuevo_borrador", modo === "editar" ? { venta: numero } : { desdeVenta: numero });
      if (r.esError) {
        toast.error(typeof r.contenido === "string" ? r.contenido : `No pude abrir ${numero}.`);
        setOcupado(null);
        return;
      }
      abrir(conversacion.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `No pude abrir ${numero}.`);
      setOcupado(null);
    }
  };

  const completar = async () => {
    const t = texto.trim();
    if (!t && !archivos.length) return void toast.info("Pegá algo, adjuntá una captura o elegí el tipo.");
    if (/^S?0?\d{4,5}$/i.test(t) && !archivos.length) return void abrirS0(t, "editar");
    setOcupado("leer");
    try {
      const { conversacion } = await crearCotizacion();
      const adjuntos = await Promise.all(archivos.slice(0, 6).map((a) => subirAdjunto(conversacion.id, a)));
      const r = await interpretar(conversacion.id, t, adjuntos.map(({ path, tipo, nombre }) => ({ path, tipo, nombre })));
      dejarPropuesta(conversacion.id, r.propuesta);
      abrir(conversacion.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer");
      setOcupado(null);
    }
  };

  const seguir = (lista.data ?? []).filter((c) => c.estadoBorrador === "en_curso" && (c.cliente || c.obra)).slice(0, 8);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-semibold">Cotizador</h1>
          <p className="text-[14px] text-muted-foreground">Pegá lo que tengas o elegí qué vas a cotizar. El precio sale del motor, como siempre.</p>
        </div>
        <Link href="/comercial/asistente" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-muted"><Bot className="size-4" /> Ir al chat</Link>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="pegar-inicio" className="mb-2 flex items-center gap-2 text-[17px] font-semibold"><Sparkles className="size-4 text-primary" /> Pegá, soltá o adjuntá lo que tengas</label>
        <textarea id="pegar-inicio" value={texto} onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => { const fs = Array.from(e.clipboardData.files ?? []); if (fs.length) { e.preventDefault(); setArchivos((xs) => [...xs, ...fs].slice(0, 6)); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length) { e.preventDefault(); setArchivos((xs) => [...xs, ...fs].slice(0, 6)); } }}
          placeholder="El formulario de alta, la captura del WhatsApp con el cliente, tu lista de precios, una foto de la fachada o un número de presupuesto (S01917)…"
          className="min-h-36 w-full resize-y rounded-lg border border-input bg-background p-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {archivos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {archivos.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[13px]">
                {a.name || "captura.png"}
                <button type="button" aria-label="Quitar adjunto" onClick={() => setArchivos((xs) => xs.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-muted">
            <Paperclip className="size-4" /> Adjuntar
            <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); setArchivos((xs) => [...xs, ...fs].slice(0, 6)); e.target.value = ""; }} />
          </label>
          <Button className="h-11 bg-hd-boton px-6 text-[15px] text-white hover:bg-hd-boton-hover" disabled={!!ocupado} onClick={completar}>
            {ocupado === "leer" ? <><Loader2 className="animate-spin" /> Leyendo…</> : "Completar"}
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Captura con Cmd+V. La IA llena sólo lo que encuentra y te marca de dónde lo sacó; lo demás lo completás con botones.</p>
      </section>

      <div className="flex flex-col gap-2.5">
        <p className="text-[14px] font-medium text-muted-foreground">O elegí qué vas a cotizar</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TIPOS.map((t) => (
            <button key={t.tipo} type="button" disabled={!!ocupado} onClick={() => nuevo(t.tipo)}
              className="flex min-h-24 flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left hover:border-primary disabled:opacity-60">
              <span className="flex items-center gap-2 text-[16px] font-semibold">{t.titulo}{ocupado === t.tipo && <Loader2 className="size-4 animate-spin" />}</span>
              <span className="text-[13px] text-muted-foreground">{t.detalle}</span>
            </button>
          ))}
          <button type="button" disabled={!!ocupado} onClick={() => setVerS0(!verS0)}
            className="flex min-h-24 flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left hover:border-primary disabled:opacity-60">
            <span className="text-[16px] font-semibold">Abrir un S0</span>
            <span className="text-[13px] text-muted-foreground">Editar con el mismo número o re-emitir</span>
          </button>
          <Link href="/comercial/asistente" className="flex min-h-24 flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left hover:border-primary">
            <span className="text-[16px] font-semibold">Otra cosa</span>
            <span className="text-[13px] text-muted-foreground">Tribunas, etapas, consultas: por el chat</span>
          </Link>
        </div>
        {verS0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <input value={s0} onChange={(e) => setS0(e.target.value)} placeholder="S01917" autoFocus aria-label="Número de presupuesto"
              className="h-11 w-36 rounded-lg border border-input bg-background px-3 font-mono text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Button variant="outline" className="h-11" disabled={!!ocupado || !s0.trim()} onClick={() => abrirS0(s0, "editar")}>
              {ocupado === "s0-editar" && <Loader2 className="animate-spin" />} Editar (mismo número)
            </Button>
            <Button variant="outline" className="h-11" disabled={!!ocupado || !s0.trim()} onClick={() => abrirS0(s0, "reemitir")}>
              {ocupado === "s0-reemitir" && <Loader2 className="animate-spin" />} Re-emitir a valor de hoy
            </Button>
          </div>
        )}
      </div>

      {seguir.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-[14px] font-semibold">Para seguir</div>
          <ul className="divide-y divide-border">
            {seguir.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => abrir(c.id)} className="flex min-h-12 w-full flex-col justify-center px-4 py-2 text-left hover:bg-muted/60">
                  <span className="truncate text-[15px]">{[c.obra, c.cliente].filter(Boolean).join(" · ")}</span>
                  <span className="truncate text-[13px] text-muted-foreground">{c.actividad ? `hace ${formatDistanceToNowStrict(parseISO(c.actividad), { locale: es })}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
