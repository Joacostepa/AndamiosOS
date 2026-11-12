"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Estado3 } from "@/lib/cotizador-rapido/formulario";

// Piezas chicas del cotizador rápido: secciones, chips, campos con la marca de la IA.
// Todo lo que se toca mide 40 a 48 px (se usa en el celular, en la vereda).

export const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
export const numeroTexto = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 }));

export function leerNumero(s: string): number | null {
  let t = s.replace(/[$\s]/g, "");
  if (!t) return null;
  // «25,62» y «3.855.000» como se escriben acá; «1.5» también se entiende.
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Lo que le falta a cada sección (id → textos), desde la lista «Faltan para guardar» del editor.
 * Las secciones lo leen solas: no hace falta pasarlo por cada una.
 */
export const FaltasContext = createContext<ReadonlyMap<string, string[]>>(new Map());

/**
 * Una sección del cotizador (JS, 12/11: «que lo que falta se vea en rojo» y «que no se vea todo
 * de una»):
 *   · si le falta algo, va abierta, con el borde y el título en rojo y la lista de lo que falta;
 *   · si está completa y tiene `resumen`, se achica a un renglón en verde con ese resumen; se abre
 *     tocándolo. Sin `resumen` no se achica nunca;
 *   · si el vendedor la está usando (el foco entra), queda abierta aunque se complete, para no
 *     cerrársele mientras escribe. Se vuelve a achicar con «Achicar».
 */
export function Seccion({ id, titulo, extra, children, alerta, resumen }: { id: string; titulo: string; extra?: ReactNode; children: ReactNode; alerta?: boolean; resumen?: ReactNode }) {
  const faltas = useContext(FaltasContext).get(id) ?? [];
  const rojo = faltas.length > 0 || !!alerta;
  const completa = !rojo && resumen !== undefined && resumen !== null && resumen !== "";
  // null: decide el estado (abierta si falta algo); true/false: lo eligió el vendedor.
  const [abierta, setAbierta] = useState<boolean | null>(null);
  const abiertaAhora = rojo || (abierta ?? !completa);

  if (!abiertaAhora) {
    return (
      <section id={id} className="scroll-mt-4 overflow-hidden rounded-xl border border-emerald-500/40 bg-card">
        <button type="button" onClick={() => setAbierta(true)} aria-expanded={false}
          className="flex min-h-12 w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/40">
          <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="shrink-0 text-[14px] font-semibold">{titulo}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-muted-foreground">{resumen}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </section>
    );
  }
  return (
    <section id={id} onFocusCapture={() => { if (abierta === null) setAbierta(true); }}
      className={cn("scroll-mt-4 overflow-hidden rounded-xl border bg-card", rojo ? "border-red-500/70" : "border-border")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5", rojo ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/40")}>
        <h2 className={cn("text-[14px] font-semibold", rojo && "text-red-600 dark:text-red-400")}>{titulo}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {completa && (
            <button type="button" onClick={() => setAbierta(false)} className="min-h-9 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
              Achicar
            </button>
          )}
        </div>
      </div>
      {faltas.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-[13px] font-medium text-red-600 dark:text-red-400">
          {faltas.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

export function Chip({ activo, onClick, children, disabled, className, titulo }: { activo?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean; className?: string; titulo?: string }) {
  return (
    <button
      type="button"
      title={titulo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        activo ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chips<T extends string | number | boolean | null>({ opciones, valor, onCambiar, disabled }: { opciones: { v: T; t: ReactNode }[]; valor: T; onCambiar: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => (
        <Chip key={String(o.v)} activo={o.v === valor} onClick={() => onCambiar(o.v)} disabled={disabled}>{o.t}</Chip>
      ))}
    </div>
  );
}

export function Tri({ valor, onCambiar, bloqueado }: { valor: Estado3; onCambiar: (v: Estado3) => void; bloqueado?: boolean }) {
  return (
    <Chips
      opciones={[{ v: "base" as Estado3, t: "Base" }, { v: "opcional" as Estado3, t: "Opcional" }, { v: "no" as Estado3, t: "No" }]}
      valor={bloqueado ? "base" : valor}
      onCambiar={onCambiar}
      disabled={bloqueado}
    />
  );
}

export type MarcaIA = { cita: string; deducido: boolean } | undefined;

export function EtiquetaIA({ marca, onConfirmar }: { marca: MarcaIA; onConfirmar?: () => void }) {
  if (!marca) return null;
  if (marca.deducido) {
    return (
      <span className="inline-flex items-center gap-1">
        <span title={marca.cita} className="cursor-help rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">IA · deducido</span>
        {onConfirmar && (
          <button type="button" onClick={onConfirmar} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-amber-500/60 px-2.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
            <Check className="size-3.5" /> Confirmar
          </button>
        )}
      </span>
    );
  }
  return <span title={marca.cita} className="cursor-help rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary">IA</span>;
}

const claseInput = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function Campo({ id, etiqueta, children, marca, onConfirmar, extra }: { id?: string; etiqueta: string; children: ReactNode; marca?: MarcaIA; onConfirmar?: () => void; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">{etiqueta}</label>
        <EtiquetaIA marca={marca} onConfirmar={onConfirmar} />
        {extra}
      </div>
      {children}
    </div>
  );
}

export function Texto({ id, valor, onCambiar, onSalir, placeholder, deducido, disabled, inputMode, tipo }: {
  id: string; valor: string; onCambiar: (v: string) => void; onSalir?: () => void; placeholder?: string; deducido?: boolean; disabled?: boolean;
  inputMode?: "text" | "tel" | "email" | "numeric" | "decimal"; tipo?: string;
}) {
  return (
    <input
      id={id}
      type={tipo ?? "text"}
      value={valor}
      placeholder={placeholder}
      disabled={disabled}
      inputMode={inputMode}
      autoComplete="off"
      onChange={(e) => onCambiar(e.target.value)}
      onBlur={onSalir}
      onKeyDown={(e) => { if (e.key === "Enter" && onSalir) (e.target as HTMLInputElement).blur(); }}
      className={cn(claseInput, deducido && "border-dashed border-amber-500")}
    />
  );
}

/** Un número con coma decimal: mientras se escribe se respeta lo tipeado; al salir se prolija. */
export function Numero({ id, valor, onCambiar, placeholder, deducido, disabled, moneda, className, etiquetaAria }: {
  id?: string; valor: number | null; onCambiar: (v: number | null) => void; placeholder?: string; deducido?: boolean; disabled?: boolean; moneda?: boolean; className?: string; etiquetaAria?: string;
}) {
  // Mientras se edita se muestra lo tipeado («25,» a medio escribir); si no, el valor prolijo.
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <input
      id={id}
      aria-label={etiquetaAria}
      value={editando ?? numeroTexto(valor)}
      placeholder={placeholder}
      disabled={disabled}
      inputMode="decimal"
      autoComplete="off"
      onFocus={() => setEditando(numeroTexto(valor))}
      onBlur={() => setEditando(null)}
      onChange={(e) => { setEditando(e.target.value); onCambiar(leerNumero(e.target.value)); }}
      className={cn(claseInput, "font-mono tabular-nums", moneda && "pl-7", deducido && "border-dashed border-amber-500", className)}
    />
  );
}

export function Moneda(props: Parameters<typeof Numero>[0]) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">$</span>
      <Numero {...props} moneda />
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "ambar" | "verde" | "rojo" | "gris"; children: ReactNode }) {
  return (
    <div className={cn(
      "flex flex-col gap-2.5 rounded-lg border px-3.5 py-3 text-[14px]",
      tono === "ambar" && "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
      tono === "verde" && "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      tono === "rojo" && "border-destructive/50 bg-destructive/10 text-destructive",
      tono === "gris" && "border-border bg-muted/50 text-muted-foreground",
    )}>
      {children}
    </div>
  );
}
