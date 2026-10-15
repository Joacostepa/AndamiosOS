"use client";

// PanelDesglose (§7.3): cifra → desglose → lista → Odoo.
//
// Escritorio: columna de 480 px a la derecha que NO tapa la tarjeta de origen (la pantalla
// se corre; el layout lo pone al lado del contenido). Celular: hoja desde abajo al 90 %.
// Es una pila de nodos (contexto.tsx): "←" vuelve un nivel, las migas saltan, Esc cierra.
// Cada lista cierra con su cifra: "Total {suma} = la cifra ✓" (o dice la diferencia).
//
// Los datos los trae GET /api/direccion/desglose (registro de nodos por área). El link
// "↗ Odoo" abre el registro en una pestaña nueva: es lectura, Dirección no ofrece ninguna
// acción que escriba en Odoo.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { refAQuery } from "@/lib/direccion/desglose/contrato";
import { textoCierre } from "@/lib/direccion/formato";
import type { FilaDesglose, NodoDesglose, NodoRef, SeccionDesglose } from "@/lib/direccion/tipos";
import { cn } from "@/lib/utils";
import { useDireccion, useFormato } from "./contexto";

async function pedirNodo(q: string): Promise<NodoDesglose> {
  const r = await fetch(`/api/direccion/desglose?${q}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "No se pudo abrir el desglose.");
  return j as NodoDesglose;
}

function useNodo(ref: NodoRef | undefined, pagina: number) {
  const q = ref ? refAQuery(ref, pagina) : "";
  return useQuery({ queryKey: ["direccion", "desglose", q], queryFn: () => pedirNodo(q), enabled: !!ref, staleTime: 5 * 60_000, retry: false });
}

const TONO_ETQ = {
  neutro: "bg-(--dir-neutro-bg) text-(--dir-neutro-text)",
  bien: "bg-(--dir-bien-bg) text-(--dir-bien)",
  mal: "bg-(--dir-mal-bg) text-(--dir-mal)",
  aten: "bg-(--dir-aten-bg) text-(--dir-aten)",
} as const;

function Fila({ fila }: { fila: FilaDesglose }) {
  const f = useFormato();
  const { abrirNodo } = useDireccion();
  const contenido = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[13px] font-semibold">
          {fila.titulo}
          {fila.etiqueta && <span className={cn("ml-1.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold", TONO_ETQ[fila.etiqueta.tono])}>{fila.etiqueta.texto}</span>}
        </b>
        {fila.sub && <small className="text-xs text-muted-foreground">{fila.sub}</small>}
        {fila.barra != null && (
          <span className="mt-1 block h-1.5 rounded-sm bg-(--dir-serie)" style={{ width: `${Math.max(2, Math.min(1, fila.barra) * 100)}%` }} />
        )}
      </span>
      {fila.valor && (
        <span className="flex flex-col items-end text-right text-[13px] tabular-nums">
          <span className={cn(fila.valor.tipo === "sin_dato" && "text-muted-foreground")} title={fila.valor.tipo === "sin_dato" ? fila.valor.motivo : undefined}>
            {f.valor(fila.valor)}
          </span>
          {fila.valorSub && <small className="text-xs text-muted-foreground">{fila.valorSub}</small>}
        </span>
      )}
    </>
  );
  const clase = cn("flex w-full items-center gap-2.5 border-t px-1 py-2 text-left first:border-t-0", fila.atenuada && "opacity-55");
  return (
    <div className="flex items-center gap-1.5">
      {fila.hijo ? (
        <button type="button" className={cn(clase, "hover:bg-muted/60")} onClick={() => abrirNodo(fila.hijo!, { desdePanel: true })}>
          {contenido}
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ) : (
        <div className={clase}>{contenido}</div>
      )}
      {fila.odoo?.url && (
        <a
          href={fila.odoo.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir en Odoo (pestaña nueva, sólo lectura)"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11.5px] text-muted-foreground hover:text-foreground max-md:h-11"
        >
          <ExternalLink className="size-3" aria-hidden /> Odoo
        </a>
      )}
    </div>
  );
}

function Seccion({ sec }: { sec: SeccionDesglose }) {
  const f = useFormato();
  const cierre = sec.cierre ? textoCierre(sec.cierre, f.ctx) : null;
  return (
    <section className="flex flex-col gap-1">
      {sec.titulo && <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{sec.titulo}</h3>}
      {sec.filas.length > 0 ? (
        <div>{sec.filas.map((fila) => <Fila key={fila.id} fila={fila} />)}</div>
      ) : (
        <p className="py-2 text-[13px] text-muted-foreground">Nada para mostrar.</p>
      )}
      {cierre && (
        <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", cierre.ok && "[&_b]:text-(--dir-bien)")}>
          {cierre.ok ? <Check className="size-3.5 text-(--dir-bien)" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
          <span>{cierre.ok ? <b>{cierre.texto}</b> : cierre.texto}</span>
        </div>
      )}
      {sec.nota && <p className="mt-1 text-xs text-muted-foreground">{sec.nota}</p>}
    </section>
  );
}

function exportarCsv(nodo: NodoDesglose, valor: (f: FilaDesglose) => string) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const filas = nodo.secciones.flatMap((s) => s.filas.map((f) => [s.titulo ?? "", f.titulo, f.sub ?? "", valor(f), f.valorSub ?? ""]));
  const csv = [["Sección", "Nombre", "Detalle", "Valor", ""], ...filas].map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nodo.titulo.replace(/[^\p{L}\p{N} ]/gu, "").trim() || "desglose"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Contenido() {
  const { pila, volverNodo, irANivel, cerrarPanel, reemplazarNodo } = useDireccion();
  const f = useFormato();
  const ref = pila[pila.length - 1];
  // La página es de cada nodo: al abrir otro arranca en la 1.
  const claveRef = ref ? refAQuery(ref) : "";
  const [paginas, setPaginas] = useState<Record<string, number>>({});
  const pagina = paginas[claveRef] ?? 1;
  const setPagina = (fn: (p: number) => number) => setPaginas((ps) => ({ ...ps, [claveRef]: fn(ps[claveRef] ?? 1) }));
  const { data: nodo, error, isLoading } = useNodo(ref, pagina);
  // Los títulos de los niveles anteriores para las migas (ya están en la caché de react-query).
  const padres = pila.slice(0, -1);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1 border-b px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-1.5">
          {pila.length > 1 && (
            <Button variant="ghost" size="icon-sm" onClick={volverNodo} aria-label="Volver un nivel" className="max-md:size-11">
              <ChevronLeft />
            </Button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{nodo?.titulo ?? (isLoading ? "Cargando…" : "Desglose")}</h2>
          {nodo?.csv && (
            <Button variant="outline" size="sm" onClick={() => exportarCsv(nodo, (fila) => (fila.valor ? f.valor(fila.valor) : ""))}>
              <Download /> CSV
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={cerrarPanel} aria-label="Cerrar (Esc)" className="max-md:hidden">
            <X />
          </Button>
        </div>
        {padres.length > 0 && (
          <nav aria-label="Migas" className="flex flex-wrap gap-1 text-[11.5px] text-muted-foreground">
            {padres.map((p, i) => (
              <span key={i} className="inline-flex gap-1">
                <MigaTitulo refNodo={p} onClick={() => irANivel(i)} />
                <span aria-hidden>›</span>
              </span>
            ))}
            <span>{nodo?.titulo ?? "…"}</span>
          </nav>
        )}
        {nodo && (
          <>
            <div className={cn("text-[22px] font-[650] leading-tight tabular-nums", nodo.cifra.tipo === "sin_dato" && "text-muted-foreground")}>{f.valor(nodo.cifra)}</div>
            {nodo.sub && <div className="text-[11px] text-muted-foreground">{nodo.sub}</div>}
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3 pb-5">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        )}
        {error && <p className="rounded-md bg-(--dir-aten-bg) px-3 py-2 text-[13px] text-(--dir-aten)">{(error as Error).message}</p>}
        {nodo && (
          <>
            {nodo.avisos?.map((a, i) => (
              <p key={i} className={cn("rounded-md px-3 py-2 text-[13px]", a.tono === "aten" ? "bg-(--dir-aten-bg) text-(--dir-aten)" : "bg-muted text-muted-foreground")}>
                {a.texto}
              </p>
            ))}
            {nodo.agrupar && (
              <div className="inline-flex self-start rounded-md border p-0.5 text-xs" role="group" aria-label="Agrupar por">
                {nodo.agrupar.opciones.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    aria-pressed={nodo.agrupar!.activo === o.valor}
                    onClick={() => reemplazarNodo({ ...ref!, [nodo.agrupar!.param]: o.valor })}
                    className={cn("rounded px-2.5 py-1 max-md:min-h-11", nodo.agrupar!.activo === o.valor ? "bg-secondary font-semibold" : "text-muted-foreground")}
                  >
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            )}
            {nodo.secciones.map((s, i) => <Seccion key={i} sec={s} />)}
            {nodo.pagina && nodo.pagina.total > 1 && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <span>Página {nodo.pagina.actual} de {nodo.pagina.total} · {nodo.pagina.filas} en total</span>
                <Button variant="outline" size="sm" disabled={pagina >= nodo.pagina.total} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MigaTitulo({ refNodo, onClick }: { refNodo: NodoRef; onClick: () => void }) {
  const { data } = useNodo(refNodo, 1);
  return (
    <button type="button" onClick={onClick} className="underline underline-offset-2 hover:text-foreground">
      {data?.titulo ?? "…"}
    </button>
  );
}

/**
 * El panel. Lo monta el layout UNA vez, al lado del contenido; las tarjetas lo abren con
 * `useDireccion().abrirNodo({ tipo: "<kpi>" })`.
 */
export function PanelDesglose() {
  const { pila, cerrarPanel } = useDireccion();
  const movil = useIsMobile();
  const abierto = pila.length > 0;

  useEffect(() => {
    if (!abierto || movil) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) cerrarPanel();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [abierto, movil, cerrarPanel]);

  if (movil) {
    return (
      <Sheet open={abierto} onOpenChange={(o) => !o && cerrarPanel()}>
        <SheetContent side="bottom" className="h-[90dvh] gap-0 rounded-t-2xl p-0" showCloseButton>
          <SheetTitle className="sr-only">Desglose</SheetTitle>
          <div className="mx-auto mt-2 h-[5px] w-11 rounded-full bg-border" aria-hidden />
          <Contenido />
        </SheetContent>
      </Sheet>
    );
  }
  if (!abierto) return null;
  return (
    <aside
      role="dialog"
      aria-label="Desglose"
      className="sticky top-0 ml-4 flex h-[calc(100dvh-7rem)] w-[480px] shrink-0 flex-col rounded-lg border bg-card shadow-(--dir-sombra-2)"
    >
      <Contenido />
    </aside>
  );
}
