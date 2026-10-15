"use client";

// "Para decidir esta semana" (diseno.md §4.6, maqueta renderDecisiones/decDetalle).
// Una línea por tema: severidad (ícono + texto para lectores) · qué pasa · para cuándo · dueño.
// Escritorio: se despliega en el lugar (qué pasa completo, la pregunta, dueño, Ver, Anotar y
// las notas). Celular: abre una hoja desde abajo con todo en tamaño de dedo.
// Máximo 5 visibles; el resto en "Ver todas (n)". Las notas y el dueño van a Supabase.

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { DUENOS, SEV_ICONO, SEV_TEXTO, textoVence, visibles } from "@/lib/direccion/calculo/decisiones";
import { fcorta, diaBA, hoyBA } from "@/lib/direccion/formato";
import { SECCIONES } from "@/lib/direccion/secciones";
import type { Decision, Severidad } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion, useQueryMoneda } from "../contexto";
import { EstadoVacio } from "../estados";
import { TextoFrase } from "../piezas";
import { usePropios } from "./propios";

const TONO_SEV: Record<Severidad, string> = { rojo: "text-(--dir-mal)", ambar: "text-(--dir-aten)", gris: "text-muted-foreground" };

export function IconoSeveridad({ sev, className }: { sev: Severidad; className?: string }) {
  return (
    <span className={cn("inline-flex w-[18px] shrink-0 justify-center text-[13px] leading-none", TONO_SEV[sev], className)} title={SEV_TEXTO[sev]}>
      <span aria-hidden>{SEV_ICONO[sev]}</span>
      <span className="sr-only">{SEV_TEXTO[sev]}</span>
    </span>
  );
}

function ChipVence({ d }: { d: Decision }) {
  const t = textoVence(d.vence, hoyBA());
  if (!t) return null;
  return <span className="shrink-0 rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold whitespace-nowrap text-primary" title="Para cuándo">{t}</span>;
}

/** Selector de dueño (socios + gerencia). Sin "editar", sólo se lee. */
export function SelectorDueno({ d, grande }: { d: Decision; grande?: boolean }) {
  const { puedeEditar } = useDireccion();
  const p = usePropios();
  const actual = p.dueno(d);
  if (!puedeEditar) return <span className={cn("text-muted-foreground", grande ? "text-base" : "text-[12.5px]")}>Dueño: <b className="font-semibold text-foreground">{actual ?? "sin dueño"}</b></span>;
  const opciones = [...DUENOS, ...(actual && !(DUENOS as readonly string[]).includes(actual) ? [actual] : [])];
  return (
    <label className={cn("inline-flex items-center gap-1.5", grande ? "text-base font-semibold" : "text-[12.5px]")}>
      Dueño
      <select
        value={actual ?? ""}
        onChange={(e) => void p.asignarDueno(d, e.target.value || null)}
        className={cn("rounded-md border bg-background px-1.5 text-foreground", grande ? "h-10 text-base" : "h-7 max-md:h-11")}
        aria-label="Dueño"
      >
        <option value="">sin dueño</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/** Las notas de una decisión: "↳ 12/10 Jorge: «Llamo el martes»". */
export function NotasDecision({ d, grande }: { d: Decision; grande?: boolean }) {
  const notas = usePropios().notas(d.id);
  if (!notas.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {notas.map((n) => (
        <div key={n.id} className={cn("rounded-md bg-muted px-2 py-1", grande ? "text-base" : "text-[12.5px]")}>
          <span className="text-muted-foreground">↳ {fcorta(diaBA(n.fecha))} {n.autor ?? "Alguien"}:</span> “{n.texto}”
        </div>
      ))}
    </div>
  );
}

/** Formulario de "Anotar". `grande` = modo reunión (área de texto). */
export function FormNota({ d, grande, reunion, onGuardada }: { d: Decision; grande?: boolean; reunion?: boolean; onGuardada?: () => void }) {
  const p = usePropios();
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    const n = await p.anotar(d, texto, { reunion });
    setGuardando(false);
    if (n) {
      setTexto("");
      onGuardada?.();
    }
  }
  return (
    <form onSubmit={guardar} className={cn("flex gap-1.5", grande && "flex-col gap-2")}>
      {grande ? (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotar el acuerdo: qué se hace y quién"
          aria-label="Nota"
          maxLength={2000}
          className="min-h-[90px] w-full rounded-lg border bg-card p-3 text-xl"
        />
      ) : (
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Qué se decidió o quién hace qué"
          aria-label="Nota"
          maxLength={2000}
          autoFocus
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px] max-md:h-11 max-md:text-base"
        />
      )}
      <Button type="submit" size={grande ? "lg" : "sm"} disabled={!texto.trim() || guardando} className={cn(grande ? "h-10 self-start text-[15px]" : "max-md:h-11")}>
        {guardando ? "Guardando…" : grande ? "Guardar nota" : "Guardar"}
      </Button>
    </form>
  );
}

/** "Ver": abre el desglose exacto de la decisión, o la pantalla si no tiene. */
function BotonVer({ d, onAntes }: { d: Decision; onAntes?: () => void }) {
  const { abrirNodo } = useDireccion();
  const q = useQueryMoneda();
  const s = SECCIONES.find((x) => x.id === d.pantalla);
  if (d.ver) {
    return (
      <Button variant="outline" size="sm" className="max-md:h-11" onClick={() => { onAntes?.(); abrirNodo(d.ver!); }}>
        Ver detalle
      </Button>
    );
  }
  if (!s) return null;
  return (
    <Button variant="outline" size="sm" className="max-md:h-11" nativeButton={false} render={<Link href={`${s.href}${q}`} />}>
      Ver {s.titulo}
    </Button>
  );
}

/** El tema desplegado: qué pasa, la pregunta, dueño, Ver, Anotar y las notas. */
export function DetalleDecision({ d, enHoja, onVer }: { d: Decision; enHoja?: boolean; onVer?: () => void }) {
  const { puedeEditar } = useDireccion();
  const [anotando, setAnotando] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2 text-[13px]", !enHoja && "pb-3 pl-[30px] pr-1", enHoja && "text-[15px]")}>
      <div><TextoFrase frase={d.que} /></div>
      <div className="italic text-muted-foreground">{d.pregunta}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SelectorDueno d={d} />
        <BotonVer d={d} onAntes={onVer} />
        {puedeEditar && (
          <Button variant="outline" size="sm" className="max-md:h-11" aria-expanded={anotando} onClick={() => setAnotando((x) => !x)}>
            <Pencil aria-hidden /> Anotar
          </Button>
        )}
      </div>
      <NotasDecision d={d} />
      {anotando && <FormNota d={d} onGuardada={() => setAnotando(false)} />}
    </div>
  );
}

export function ListaDecisiones({ decisiones, id }: { decisiones: Decision[]; id?: string }) {
  const movil = useIsMobile();
  const p = usePropios();
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [hoja, setHoja] = useState<Decision | null>(null);
  const lista = visibles(decisiones, todas);

  return (
    <section id={id} aria-label="Para decidir esta semana" className="min-w-0 scroll-mt-28 rounded-lg border bg-card px-4 py-3.5 shadow-(--dir-sombra-1)">
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Para decidir esta semana{decisiones.length ? ` (${decisiones.length})` : ""}
      </h2>
      {!decisiones.length ? (
        <EstadoVacio positivo titulo="Nada para decidir esta semana." />
      ) : (
        <div className="flex flex-col">
          {lista.map((d) => {
            const abiertaEsta = !movil && abierta === d.id;
            const dueno = p.dueno(d);
            const conNotas = p.notas(d.id).length > 0;
            return (
              <div key={d.id} className="border-t first:border-t-0">
                <button
                  type="button"
                  aria-expanded={movil ? undefined : abiertaEsta}
                  onClick={() => (movil ? setHoja(d) : setAbierta(abiertaEsta ? null : d.id))}
                  className="flex min-h-10 w-full items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-12"
                >
                  <IconoSeveridad sev={d.sev} />
                  <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold">
                    <TextoPlano frase={d.corto} />
                  </span>
                  {!movil && <ChipVence d={d} />}
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {conNotas ? "✓ " : ""}{dueno ?? "sin dueño"}
                  </span>
                  {abiertaEsta ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
                {abiertaEsta && <DetalleDecision d={d} />}
              </div>
            );
          })}
          {decisiones.length > 5 && (
            <button type="button" onClick={() => setTodas((x) => !x)} className="mt-1.5 self-start text-[13px] font-medium text-primary hover:underline max-md:min-h-11">
              {todas ? "Ver menos" : `Ver todas (${decisiones.length})`}
            </button>
          )}
        </div>
      )}
      <Sheet open={!!hoja} onOpenChange={(o) => !o && setHoja(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-3 overflow-y-auto rounded-t-2xl px-4 pt-2 pb-6" showCloseButton>
          <div className="mx-auto h-[5px] w-11 rounded-full bg-border" aria-hidden />
          {hoja && (
            <>
              <div className="flex items-center gap-2 pr-10">
                <IconoSeveridad sev={hoja.sev} />
                <SheetTitle className="flex-1 text-base font-semibold">{SEV_TEXTO[hoja.sev]}</SheetTitle>
                <ChipVence d={hoja} />
              </div>
              <DetalleDecision d={hoja} enHoja onVer={() => setHoja(null)} />
              <Button variant="outline" className="h-11" onClick={() => setHoja(null)}>Cerrar</Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** La frase corta en una línea, sin botones adentro (la línea entera ya es un botón). */
function TextoPlano({ frase }: { frase: Decision["corto"] }) {
  return <TextoFrase frase={frase.map((p) => (typeof p === "string" ? p : { valor: p.valor }))} />;
}
