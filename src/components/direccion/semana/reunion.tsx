"use client";

// Modo reunión (diseno.md §7.9, maqueta renderReunion): pantalla completa, tipografía 1,5×,
// un tema por pantalla. → / Espacio avanzan, ← vuelve, Esc sale.
//  1. La narrativa · 2. Caja y cobertura · 3. Cobranzas (a quién llamar) · 4. Facturado ·
//  5. En la calle · 6. Cada tema de "Para decidir" con Anotar grande y el dueño · 7. Cierre
//  con lo anotado en esta reunión y "Copiar resumen".
// Retiros NO entra por defecto: se suma con el tilde "Incluir socios", que sólo ve quien
// tiene direccion-socios (y sólo si el servidor mandó la cifra), con el aviso en pantalla.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resumenReunion, tituloCierre } from "@/lib/direccion/calculo/decisiones";
import { cuerpoNarrativa } from "@/lib/direccion/calculo/narrativa";
import type { DetalleSemana } from "@/lib/direccion/calculo/semana-armar";
import { fdia, flarga, hoyBA, nombreLindo } from "@/lib/direccion/formato";
import type { Cifra, Decision, Frase, Oracion } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion, useFormato } from "../contexto";
import { TextoFrase } from "../piezas";
import { TarjetaCifra } from "../tarjetas";
import { FormNota, IconoSeveridad, NotasDecision, SelectorDueno } from "./decisiones";
import { usePropios } from "./propios";
import { SparkFlujo, SparkMeses } from "./tarjetas-semana";

type Paso = { id: string; decision?: Decision };

const plana = (f: Frase): Frase => f.map((p) => (typeof p === "string" ? p : { valor: p.valor }));

function Cifras({ cifras }: { cifras: (Cifra | null | undefined)[] }) {
  const ok = cifras.filter((c): c is Cifra => !!c);
  if (!ok.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] [&_.text-2xl]:text-[40px]">
      {ok.map((c) => <TarjetaCifra key={c.id ?? c.kpi} cifra={c} sinDesglose />)}
    </div>
  );
}

function Tabla({ cabeza, filas }: { cabeza: string[]; filas: React.ReactNode[][] }) {
  if (!filas.length) return null;
  return (
    <table className="w-full border-collapse text-lg">
      <thead>
        <tr className="border-b text-left text-sm text-muted-foreground">
          {cabeza.map((c, i) => <th key={c} className={cn("py-2 font-semibold", i > 0 && "text-right")}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b last:border-b-0">
            {f.map((c, j) => <td key={j} className={cn("py-2", j > 0 && "text-right tabular-nums")}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ModoReunion({
  oraciones, cifras, detalle, decisiones, onSalir,
}: {
  oraciones: Oracion[];
  cifras: Cifra[];
  detalle: DetalleSemana;
  decisiones: Decision[];
  onSalir: () => void;
}) {
  const f = useFormato();
  const { conSocios } = useDireccion();
  const propios = usePropios();
  const [paso, setPaso] = useState(0);
  const [conRetiros, setConRetiros] = useState(false);
  const [inicio] = useState(() => Date.now());
  const por = useMemo(() => new Map(cifras.map((c) => [c.id ?? c.kpi, c])), [cifras]);
  const retiros = por.get("semana_retiros");
  const hoy = hoyBA();

  const pasos: Paso[] = useMemo(() => {
    const p: Paso[] = [{ id: "narr" }, { id: "caja" }, { id: "cobr" }, { id: "fact" }, { id: "calle" }, ...decisiones.map((d) => ({ id: `dec:${d.id}`, decision: d }))];
    if (conRetiros && conSocios && retiros) p.push({ id: "socios" });
    p.push({ id: "cierre" });
    return p;
  }, [decisiones, conRetiros, conSocios, retiros]);
  const actual = pasos[Math.min(paso, pasos.length - 1)];

  const mover = useCallback((d: number) => setPaso((x) => Math.max(0, Math.min(pasos.length - 1, x + d))), [pasos.length]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const escribiendo = !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "Escape") { e.preventDefault(); onSalir(); return; }
      if (escribiendo) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); mover(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); mover(-1); }
    };
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = overflow; };
  }, [mover, onSalir]);

  // Lo anotado en ESTA reunión (desde que se abrió), con la pregunta de cada tema.
  const acuerdos = decisiones.flatMap((d) =>
    propios.notas(d.id).filter((n) => n.reunion && new Date(n.fecha).getTime() >= inicio - 1000).map((n) => ({ ...n, pregunta: d.pregunta, reservado: d.reservado, dueno: propios.dueno(d) })),
  );

  async function copiarResumen() {
    const txt = resumenReunion(flarga(hoy), acuerdos);
    try {
      await navigator.clipboard.writeText(txt);
      toast("Resumen copiado");
    } catch {
      toast("No se pudo copiar", { description: txt.slice(0, 120) });
    }
  }

  let cuerpo: React.ReactNode = null;
  const d = actual.decision;
  if (actual.id === "narr") {
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">Esta semana</h2>
        <p className="rounded-lg border border-l-[3px] border-l-primary bg-card p-5 text-[26px] leading-normal max-md:text-xl">
          {cuerpoNarrativa(oraciones).map((o, i) => <span key={o.id}>{i > 0 && " "}<TextoFrase frase={plana(o.frase)} /></span>)}
        </p>
      </>
    );
  } else if (actual.id === "caja") {
    const cob = detalle.reservado?.cobertura ?? detalle.cobertura;
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">¿Cuánta plata hay y llegamos?</h2>
        <Cifras cifras={[por.get("semana_caja"), por.get("semana_cobertura"), detalle.reunion.chequesPropios]} />
        {cob && <SparkFlujo c={cob} alto={140} />}
      </>
    );
  } else if (actual.id === "cobr") {
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">¿Quién nos debe?</h2>
        <Cifras cifras={[detalle.reunion.porCobrar, por.get("semana_vencido_30")]} />
        <Tabla
          cabeza={["A quién llamar (top 5)", "Vencido", "Atraso"]}
          filas={detalle.reunion.llamar.map((c) => [`${c.publico ? "🏛 " : ""}${nombreLindo(c.nombre)}`, f.mon({ ars: c.vencidoArs }), c.diasMax != null ? `${c.diasMax} d` : "Sin dato"])}
        />
      </>
    );
  } else if (actual.id === "fact") {
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">¿Facturamos?</h2>
        <Cifras cifras={[por.get("semana_facturado"), por.get("semana_resultado")]} />
        {detalle.facturado && <SparkMeses serie={detalle.facturado.serie} alto={140} />}
      </>
    );
  } else if (actual.id === "calle") {
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">¿Qué está en la calle y vencido?</h2>
        <Cifras cifras={[por.get("semana_dev_vencida")]} />
        {detalle.reunion.finVencido && <p className="text-lg text-muted-foreground">+ {detalle.reunion.finVencido.obras} obras con fin estimado vencido{detalle.reunion.finVencido.sinFecha ? ` (y ${detalle.reunion.finVencido.sinFecha} sin fecha cargada)` : ""}.</p>}
        <Tabla
          cabeza={["Contrato", "Abono / mes", "Sin facturar"]}
          filas={detalle.reunion.calle.map((o) => [`${o.orden} · ${nombreLindo(o.cliente)}`, o.abonoArs != null ? f.mon({ ars: o.abonoArs }) : "Sin dato", o.diasSinFacturar != null ? `${o.diasSinFacturar} d` : "Sin dato"])}
        />
      </>
    );
  } else if (d) {
    cuerpo = (
      <>
        <div className="flex items-center gap-2 text-base"><IconoSeveridad sev={d.sev} className="text-xl" /></div>
        <h2 className="text-[32px] font-semibold leading-tight tracking-tight max-md:text-2xl"><TextoFrase frase={plana(d.que)} /></h2>
        <p className="italic text-muted-foreground">{d.pregunta}</p>
        <SelectorDueno d={d} grande />
        <NotasDecision d={d} grande />
        <FormNota d={d} grande reunion />
      </>
    );
  } else if (actual.id === "socios" && retiros) {
    cuerpo = (
      <>
        <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-(--dir-aten-bg) px-2.5 py-1.5 text-sm font-semibold text-(--dir-aten)"><Lock className="size-3.5" aria-hidden /> Incluye información reservada a socios</span>
        <h2 className="text-[32px] font-semibold tracking-tight">Retiros</h2>
        <Cifras cifras={[retiros]} />
      </>
    );
  } else {
    cuerpo = (
      <>
        <h2 className="text-[32px] font-semibold tracking-tight">Cierre: {tituloCierre(acuerdos)}</h2>
        {acuerdos.length ? (
          <ul className="list-disc space-y-1.5 pl-6">
            {acuerdos.map((n) => <li key={n.id}><b>{n.pregunta}</b> {n.texto} <span className="text-muted-foreground">— {n.dueno ?? "sin dueño"}</span></li>)}
          </ul>
        ) : (
          <p className="text-muted-foreground">No se anotó nada en esta reunión. Volvé a un tema con ← para anotar.</p>
        )}
        <Button size="lg" className="h-10 self-start text-[15px]" onClick={copiarResumen}><Copy aria-hidden /> Copiar resumen</Button>
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Modo reunión" className="dir fixed inset-0 z-50 flex flex-col bg-background text-[21px] text-foreground">
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3.5 text-sm max-md:px-4">
        <b>Reunión de socios · {fdia(hoy)}</b>
        <div className="flex min-w-[120px] flex-1 gap-1" aria-hidden>
          {pasos.map((p, i) => <i key={p.id} className={cn("h-1 flex-1 rounded-sm", i < paso ? "bg-muted-foreground" : i === paso ? "bg-primary" : "bg-muted")} />)}
        </div>
        {conSocios && retiros && (
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={conRetiros} onChange={(e) => setConRetiros(e.target.checked)} className="size-4" /> Incluir socios
          </label>
        )}
        <Button variant="outline" onClick={onSalir} className="max-md:h-11"><X aria-hidden /> Salir <kbd className="ml-1 text-xs text-muted-foreground">Esc</kbd></Button>
      </div>
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 overflow-y-auto px-[max(24px,6vw)] py-8 max-md:px-4" aria-live="polite">
        {cuerpo}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t px-6 py-3.5 text-sm max-md:px-4">
        <span className="text-muted-foreground">{paso + 1} de {pasos.length}</span>
        <span className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => mover(-1)} disabled={paso === 0} className="max-md:h-11"><ChevronLeft aria-hidden /> Anterior</Button>
          <Button onClick={() => mover(1)} disabled={paso >= pasos.length - 1} className="max-md:h-11">Siguiente <ChevronRight aria-hidden /></Button>
        </span>
      </div>
    </div>
  );
}
