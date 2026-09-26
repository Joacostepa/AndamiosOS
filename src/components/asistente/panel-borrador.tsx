"use client";

import { CircleAlert, CircleCheck, ExternalLink, ListChecks } from "lucide-react";
import type { BorradorVista } from "@/lib/asistente/eventos";

// El presupuesto en construcción, al lado del chat (en el celular, en una hoja que se abre).
// Es lo que el asistente va armando: se ve cómo quedan los números mientras se habla.

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

const MODELOS: Record<string, string> = { A: "Bandeja por m.l.", B: "Fachada por m²", C: "Alquiler sin montaje", D: "Desagregado" };

export function PanelBorrador({ borrador }: { borrador: BorradorVista | null }) {
  if (!borrador) {
    return <p className="p-4 text-[13px] text-muted-foreground">Todavía no hay un presupuesto en esta conversación.</p>;
  }
  const d = borrador.datos;
  const r = borrador.resultado;
  const base = r?.lineas.filter((l) => l.seccion === "base") ?? [];
  const otras = r?.lineas.filter((l) => l.seccion !== "base") ?? [];
  const bloqueos = r?.avisos.filter((a) => a.nivel !== "info") ?? [];
  // "Frente del lote: 7,84 m (catastro, parcela 009-081-018)." — lo verificado, para verlo de un vistazo.
  const frente = r?.avisos.find((a) => a.codigo === "frente_lote" && a.nivel === "info")?.texto ?? null;

  return (
    <div className="space-y-4 p-4 text-[13px]">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{borrador.odooVentaNombre ?? "Presupuesto en borrador"}</h2>
          {borrador.odooVentaUrl && (
            <a href={borrador.odooVentaUrl} target="_blank" rel="noreferrer" className="text-primary" aria-label="Ver en Odoo">
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">v{borrador.version}</span>
        </div>
        <p className="text-muted-foreground">
          {[d.cliente.razonSocial, d.obra.direccion].filter(Boolean).join(" · ") || "Sin cliente ni obra todavía"}
        </p>
        {frente && <p className="text-[12px] text-muted-foreground">{frente}</p>}
        {d.modelo && <p className="text-[12px] text-muted-foreground">{MODELOS[d.modelo]}{d.contrato ? ` · contrato ${d.contrato.trim()}` : ""}</p>}
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
          <p className="text-[12px] font-medium text-muted-foreground">Opcionales y adicionales</p>
          {otras.map((l) => (
            <div key={l.id} className="flex gap-2 text-muted-foreground">
              <p className="min-w-0 flex-1 leading-snug">{l.descripcion}</p>
              <p className="shrink-0 font-mono tabular-nums">{pesos(l.importe)}</p>
            </div>
          ))}
        </div>
      )}

      {r && r.faltantes.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium"><ListChecks className="size-3.5" /> Falta para guardar en Odoo</p>
          <ul className="space-y-0.5 text-[12px] text-muted-foreground">
            {r.faltantes.map((f) => <li key={f.codigo}>· {f.texto}</li>)}
          </ul>
        </div>
      ) : r && base.length > 0 ? (
        <p className="flex items-center gap-1.5 text-[12px] text-emerald-500"><CircleCheck className="size-3.5" /> Listo para guardar en Odoo</p>
      ) : null}

      {bloqueos.length > 0 && (
        <ul className="space-y-1 text-[12px]">
          {bloqueos.map((a) => (
            <li key={a.codigo + a.texto} className={`flex gap-1.5 ${a.nivel === "bloqueo" ? "text-destructive" : "text-orange-400"}`}>
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {a.texto}
            </li>
          ))}
        </ul>
      )}

      {(d.seccion1 || d.seccion2.length > 0) && (
        <details className="rounded-md border border-border p-2.5">
          <summary className="cursor-pointer text-[12px] font-medium">Texto de la propuesta</summary>
          {d.seccion1 && <p className="mt-2 text-[12px] leading-relaxed">{d.seccion1.replace(/\*\*/g, "")}</p>}
          {d.seccion2.map((b) => (
            <div key={b.titulo} className="mt-2">
              <p className="text-[12px] font-medium">{b.titulo}</p>
              <p className="whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">{b.contenido.replace(/\*\*/g, "")}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
