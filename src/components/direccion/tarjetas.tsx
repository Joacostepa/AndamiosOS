"use client";

// TarjetaPregunta (La semana, §4.4) y TarjetaCifra (fila de cifras de las pantallas de
// detalle). Las dos reciben una `Cifra` tal como la arma el calculador.
//
// Accesibilidad (revisión E25): la tarjeta es un <article>; el nombre del indicador es el
// <button> y se estira (::after) para que toda la tarjeta abra el desglose sin anidar
// controles. La (i) queda por encima (z-10) y abre la definición sin abrir el desglose.
// La cifra va SIEMPRE en el color del texto: el color va en el chip y en el punto de meta.

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEF } from "@/lib/direccion/diccionario";
import type { Cifra } from "@/lib/direccion/tipos";
import { BotonDefinicion } from "./boton-definicion";
import { useDireccion, useFormato } from "./contexto";
import { ChipComparacion, MarcaConfianza, PuntoMeta, TextoFrase } from "./piezas";

type PropsTarjeta = {
  /** "¿Cuánta plata hay?" (12 px, mayúsculas). Por defecto, la del diccionario. */
  pregunta?: string;
  cifra: Cifra;
  /** Nombre del indicador. Por defecto, el del diccionario. */
  titulo?: string;
  /** Mini-gráfico (sparkline, barra de tramos). Sólo en escritorio. */
  mini?: React.ReactNode;
  /** Ocupa todo el ancho y es más baja (Retiros). */
  ancha?: boolean;
  /** Meta vigente (Supabase): con meta aparece el punto verde/rojo. */
  meta?: number | null;
  /** La semana no muestra chips "sin dato" (el motivo está en la (i) y en el detalle). */
  ocultarChipsSinDato?: boolean;
  /** Fuerza la variante compacta (una fila) también en escritorio. */
  compacta?: boolean;
  /** Texto que sigue a la regla debajo de la cifra ("al día 15"). */
  unidadExtra?: string;
  /** Chips que no son comparaciones ("36 % del por cobrar"). Van después de las comparaciones. */
  chipsExtra?: React.ReactNode;
  className?: string;
};

function useTarjeta(p: PropsTarjeta) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const def = DEF[p.cifra.kpi];
  const titulo = p.titulo ?? def?.nombre ?? p.cifra.kpi;
  const pregunta = p.pregunta ?? def?.pregunta ?? "";
  const texto = f.valor(p.cifra.valor);
  const sd = p.cifra.valor.tipo === "sin_dato";
  const chips = (p.cifra.comparaciones ?? []).filter((c) => !(p.ocultarChipsSinDato && c.delta == null));
  const abrir = () => abrirNodo(p.cifra.nodo ?? { tipo: p.cifra.kpi });
  const aria = `${titulo}: ${texto}${sd && p.cifra.valor.tipo === "sin_dato" ? ` (${p.cifra.valor.motivo})` : ""}. Ver desglose`;
  return { f, def, titulo, pregunta, texto, sd, chips, abrir, aria };
}

/** Línea de contexto + aviso de confianza (si no es confiable). */
function Contexto({ cifra }: { cifra: Cifra }) {
  const noConfiable = cifra.confianza.nivel !== "ok";
  if (!cifra.contexto && !noConfiable && cifra.valor.tipo !== "sin_dato") return null;
  return (
    <div className="text-[12.5px] leading-snug text-muted-foreground">
      {noConfiable && <MarcaConfianza nivel={cifra.confianza.nivel} motivo={cifra.confianza.motivo} />}
      {noConfiable && cifra.contexto && " "}
      {cifra.contexto && <TextoFrase frase={cifra.contexto} />}
      {!noConfiable && !cifra.contexto && cifra.valor.tipo === "sin_dato" && <span>{cifra.valor.motivo}</span>}
    </div>
  );
}

/** Versión de una fila (celular, §4.2 y C17): indicador, cifra, un chip y ›. */
export function TarjetaPreguntaCompacta(p: PropsTarjeta) {
  const t = useTarjeta(p);
  return (
    <article className={cn("dir-tarjeta relative flex min-h-[60px] items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-(--dir-sombra-1)", p.className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        {t.pregunta && <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t.pregunta}</div>}
        <button type="button" onClick={t.abrir} aria-label={t.aria} className="dir-estirado truncate text-left text-[13px] font-semibold">
          {t.titulo}
        </button>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <div className={cn("text-[22px] font-[650] leading-tight tracking-tight tabular-nums", t.sd && "text-muted-foreground")}>{t.texto}</div>
        {t.chips[0] && <ChipComparacion comparacion={t.chips[0]} />}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </article>
  );
}

function TarjetaPreguntaCompleta(p: PropsTarjeta) {
  const t = useTarjeta(p);
  const regla = p.cifra.regla;
  return (
    <article
      className={cn(
        "dir-tarjeta relative flex min-w-0 cursor-pointer flex-col gap-[3px] rounded-lg border bg-card px-3.5 pt-[13px] pb-3 shadow-(--dir-sombra-1) transition-shadow hover:shadow-(--dir-sombra-2)",
        p.ancha && "col-span-full flex-row flex-wrap items-center gap-x-[18px] gap-y-1",
        p.className,
      )}
    >
      <div className="flex min-h-6 items-center gap-1.5 pr-8 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {t.pregunta}
        <PuntoMeta kpi={p.cifra.kpi} valor={p.cifra.valorMeta} meta={p.meta} />
      </div>
      <BotonDefinicion kpi={p.cifra.kpi} confianza={p.cifra.confianza} meta={p.meta} className="absolute top-1.5 right-1.5" />
      <div className="text-[13px] font-semibold">
        <button type="button" onClick={t.abrir} aria-label={t.aria} className="dir-estirado text-left">
          {t.titulo}
        </button>
      </div>
      <div className={cn("text-[32px] font-[650] leading-[1.1] tracking-tight tabular-nums", t.sd && "text-muted-foreground")}>{t.texto}</div>
      {(regla || p.unidadExtra) && <div className="text-[11px] text-muted-foreground">{[regla ? t.f.unidad(regla) : null, p.unidadExtra].filter(Boolean).join(" · ")}</div>}
      {(t.chips.length > 0 || p.chipsExtra) && (
        <div className="flex flex-wrap gap-1.5">
          {t.chips.map((c, i) => <ChipComparacion key={i} comparacion={c} />)}
          {p.chipsExtra}
        </div>
      )}
      {p.mini && <div className="mt-1">{p.mini}</div>}
      <Contexto cifra={p.cifra} />
    </article>
  );
}

/**
 * La tarjeta de La semana. En el celular (< 768 px) pasa sola a la fila compacta; con
 * `compacta` es compacta siempre.
 */
export function TarjetaPregunta(p: PropsTarjeta) {
  if (p.compacta) return <TarjetaPreguntaCompacta {...p} />;
  return (
    <>
      <TarjetaPreguntaCompacta {...p} className={cn("md:hidden", p.className)} />
      <TarjetaPreguntaCompleta {...p} className={cn("max-md:hidden", p.className)} />
    </>
  );
}

/**
 * TarjetaCifra: la fila de 3–6 cifras de arriba de cada pantalla de detalle (§5). Misma
 * estructura accesible, sin mini-gráfico. `sinDesglose` = no abre nada (sólo la (i)).
 */
export function TarjetaCifra({ cifra, titulo, meta, sinDesglose, className }: { cifra: Cifra; titulo?: string; meta?: number | null; sinDesglose?: boolean; className?: string }) {
  const t = useTarjeta({ cifra, titulo });
  const clic = !sinDesglose;
  return (
    <article className={cn("dir-tarjeta relative flex min-w-0 flex-col gap-0.5 rounded-lg border bg-card px-3 pt-2.5 pb-2.5 shadow-(--dir-sombra-1)", clic && "cursor-pointer hover:shadow-(--dir-sombra-2)", className)}>
      <div className="flex min-h-[30px] items-center pr-8 text-[12.5px] font-semibold">
        {clic ? (
          <button type="button" onClick={t.abrir} aria-label={t.aria} className="dir-estirado text-left">
            {t.titulo}
          </button>
        ) : (
          t.titulo
        )}
        <PuntoMeta kpi={cifra.kpi} valor={cifra.valorMeta} meta={meta} />
      </div>
      <BotonDefinicion kpi={cifra.kpi} confianza={cifra.confianza} meta={meta} className="absolute top-1 right-1" />
      <div className={cn("text-2xl font-[650] leading-tight tracking-tight tabular-nums", t.sd && "text-muted-foreground")}>{t.texto}</div>
      {cifra.regla && <div className="text-[11px] text-muted-foreground">{t.f.unidad(cifra.regla)}</div>}
      {t.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.chips.map((c, i) => <ChipComparacion key={i} comparacion={c} />)}
        </div>
      )}
      <Contexto cifra={cifra} />
    </article>
  );
}

/** La grilla de TarjetaCifra de una pantalla de detalle. */
export function FilaCifras({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]", className)}>{children}</div>;
}
