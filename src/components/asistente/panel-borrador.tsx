"use client";

import { ChevronUp, CircleAlert, CircleCheck, ExternalLink, ListChecks } from "lucide-react";
import type { BorradorVista } from "@/lib/asistente/eventos";

// El presupuesto en construcción, al lado del chat (en el celular, en una hoja que se abre).
// Es lo que el asistente va armando: se ve cómo quedan los números mientras se habla. En el
// celular, además, una barra abajo (en la zona del pulgar) con el total con IVA y lo que falta;
// se toca y abre esto mismo en una hoja.

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

const MODELOS: Record<string, string> = { A: "Bandeja por m.l.", B: "Fachada por m²", C: "Alquiler sin montaje", D: "Desagregado" };

export function PanelBorrador({ borrador }: { borrador: BorradorVista | null }) {
  if (!borrador) {
    return <p className="p-4 text-[14px] text-muted-foreground">Todavía no hay un presupuesto en esta conversación.</p>;
  }
  const d = borrador.datos;
  const r = borrador.resultado;
  const base = r?.lineas.filter((l) => l.seccion === "base") ?? [];
  const otras = r?.lineas.filter((l) => l.seccion !== "base") ?? [];
  const bloqueos = r?.avisos.filter((a) => a.nivel !== "info") ?? [];
  // "Frente del lote: 7,84 m (catastro, parcela 009-081-018)." — lo verificado, para verlo de un vistazo.
  const frente = r?.avisos.find((a) => a.codigo === "frente_lote" && a.nivel === "info")?.texto ?? null;

  return (
    <div className="space-y-4 p-4 text-[14px]">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">{borrador.odooVentaNombre ? `Editando ${borrador.odooVentaNombre}` : "Presupuesto en borrador"}</h2>
          {borrador.odooVentaUrl && (
            <a href={borrador.odooVentaUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-11 items-center gap-1 text-[14px] text-primary underline-offset-2 hover:underline">
              Ver en Odoo <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        {borrador.odooVentaNombre && (
          <p className="text-[13px] text-muted-foreground">Ya está en Odoo: los cambios se guardan sobre la misma orden cuando confirmás.</p>
        )}
        <p className="text-muted-foreground">
          {[d.cliente.razonSocial, d.obra.direccion].filter(Boolean).join(" · ") || "Sin cliente ni obra todavía"}
        </p>
        {frente && <p className="text-[13px] text-muted-foreground">{frente}</p>}
        {d.modelo && <p className="text-[13px] text-muted-foreground">{MODELOS[d.modelo]}{d.contrato ? ` · contrato ${d.contrato.trim()}` : ""}</p>}
      </div>

      {base.length > 0 && (
        <div className="space-y-1.5">
          {base.map((l) => (
            <div key={l.id} className="flex gap-2">
              <p className="min-w-0 flex-1 leading-snug">{l.descripcion}</p>
              <p className="shrink-0 font-mono tabular-nums">{pesos(l.importe)}</p>
            </div>
          ))}
          <div className="flex border-t border-border pt-1.5 font-semibold">
            <span className="flex-1">Subtotal neto</span>
            <span className="font-mono tabular-nums">{pesos(r!.totales.subtotal)}</span>
          </div>
          <div className="flex text-muted-foreground">
            <span className="flex-1">Total con IVA</span>
            <span className="font-mono tabular-nums">{pesos(r!.totales.total)}</span>
          </div>
          {r!.totales.renovacion && (
            <div className="flex text-muted-foreground">
              <span className="flex-1">Renovación mensual ({r!.totales.renovacion.pct} %)</span>
              <span className="font-mono tabular-nums">{pesos(r!.totales.renovacion.monto)}</span>
            </div>
          )}
        </div>
      )}

      {otras.length > 0 && (
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">Opcionales y adicionales</p>
          {otras.map((l) => (
            <div key={l.id} className="flex gap-2 text-muted-foreground">
              <p className="min-w-0 flex-1 leading-snug">{l.descripcion}</p>
              <p className="shrink-0 font-mono tabular-nums">{pesos(l.importe)}</p>
            </div>
          ))}
        </div>
      )}

      {r?.planPagos && r.planPagos.filas.length > 0 && (
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            Plan de pagos{r.planPagos.medio ? ` · ${r.planPagos.medio}` : ""}
          </p>
          {r.planPagos.filas.map((f, i) => (
            <div key={i} className="flex gap-2">
              <p className="w-24 shrink-0 text-muted-foreground">{f.cuando}</p>
              <p className="min-w-0 flex-1 leading-snug">{f.concepto}</p>
              <p className="shrink-0 font-mono tabular-nums">{pesos(f.conIva)}</p>
            </div>
          ))}
          <div className="flex border-t border-border pt-1 text-muted-foreground">
            <span className="flex-1">Total con IVA</span>
            <span className="font-mono tabular-nums">{pesos(r.planPagos.totalConIva)}</span>
          </div>
        </div>
      )}

      {r && r.faltantes.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-[13px] font-medium"><ListChecks className="size-3.5" /> Falta para guardar en Odoo</p>
          <ul className="space-y-0.5 text-[13px] text-muted-foreground">
            {r.faltantes.map((f) => <li key={f.codigo}>· {f.texto}</li>)}
          </ul>
        </div>
      ) : r && base.length > 0 ? (
        <p className="flex items-center gap-1.5 text-[13px] text-hd-verde"><CircleCheck className="size-3.5" /> Listo para guardar en Odoo</p>
      ) : null}

      {bloqueos.length > 0 && (
        <ul className="space-y-1 text-[13px]">
          {bloqueos.map((a) => (
            <li key={a.codigo + a.texto} className={`flex gap-1.5 ${a.nivel === "bloqueo" ? "text-hd-rojo" : "text-hd-ambar"}`}>
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {a.texto}
            </li>
          ))}
        </ul>
      )}

      {(d.seccion1 || d.seccion2.length > 0) && (
        <details className="rounded-md border border-border p-2.5">
          <summary className="cursor-pointer text-[13px] font-medium">Texto de la propuesta</summary>
          {d.seccion1 && <p className="mt-2 text-[13px] leading-relaxed">{d.seccion1.replace(/\*\*/g, "")}</p>}
          {d.seccion2.map((b) => (
            <div key={b.titulo} className="mt-2">
              <p className="text-[13px] font-medium">{b.titulo}</p>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{b.contenido.replace(/\*\*/g, "")}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** Los nombres cortos de lo que falta, para la barra: «CUIT, mail». */
const CORTO: Record<string, string> = {
  cliente: "cliente",
  cuit: "CUIT válido",
  obra: "dirección",
  frente_lote: "frente",
  contrato: "contrato",
  jornadas: "jornadas",
  render: "render",
  render_imagen: "imagen del render",
  seccion1: "alcance",
  seccion2: "anexo técnico",
  oferta: "líneas",
  conflicto_canal: "revisar otras cotizaciones",
  plan_pagos: "plan de pagos",
};
const CAMPO_CLIENTE: Record<string, string> = {
  razonSocial: "razón social", contacto: "contacto", celular: "celular", email: "mail", cuit: "CUIT", domicilio: "domicilio",
};

export function faltantesCortos(borrador: BorradorVista): string[] {
  const r = borrador.resultado;
  if (!r) return [];
  const c = borrador.datos.cliente;
  const out: string[] = [];
  let preguntas = 0;
  for (const f of r.faltantes) {
    if (f.codigo === "cliente_nuevo") {
      for (const [k, nombre] of Object.entries(CAMPO_CLIENTE)) if (!c[k as keyof typeof c]?.toString().trim()) out.push(nombre);
    } else if (f.codigo.startsWith("pendiente:")) preguntas++;
    else if (f.codigo.startsWith("bloqueo:")) out.push("un aviso");
    else out.push(CORTO[f.codigo] ?? f.codigo);
  }
  if (preguntas) out.push(preguntas === 1 ? "1 pregunta" : `${preguntas} preguntas`);
  return [...new Set(out)];
}

/**
 * La barra de abajo en el celular: total CON IVA (etiquetado: antes el header mostraba el neto
 * sin decirlo), si está en Odoo y si se puede guardar o qué falta. Se toca y abre la hoja.
 */
export function BarraBorrador({ borrador, onAbrir }: { borrador: BorradorVista; onAbrir: () => void }) {
  const r = borrador.resultado;
  const hayLineas = !!r?.lineas.some((l) => l.seccion === "base");
  const faltan = faltantesCortos(borrador);
  const estado = !hayLineas
    ? <span className="text-muted-foreground">Todavía sin líneas</span>
    : faltan.length
      ? <span className="text-hd-ambar">Faltan {faltan.length}: {faltan.slice(0, 3).join(", ")}{faltan.length > 3 ? "…" : ""}</span>
      : <span className="text-hd-verde">Listo para guardar</span>;
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label="Ver el presupuesto"
      className="flex min-h-12 w-full items-center gap-3 border-t border-border bg-card px-4 py-1.5 text-left active:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {borrador.odooVentaNombre && <span className="font-normal text-muted-foreground">Editando {borrador.odooVentaNombre} · </span>}
          {hayLineas ? <span className="font-mono tabular-nums">{pesos(r!.totales.total)} <span className="font-sans text-[13px] font-normal text-muted-foreground">c/IVA</span></span> : "Presupuesto"}
        </p>
        <p className="truncate text-[13px]">{estado}</p>
      </div>
      <ChevronUp className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
