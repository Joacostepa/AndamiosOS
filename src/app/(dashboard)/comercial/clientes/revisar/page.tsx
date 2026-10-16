"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Loader2, TriangleAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { buttonVariants } from "@/components/ui/button";
import { Pastilla } from "@/components/clientes/pastillas";
import { cn } from "@/lib/utils";
import { useAuditoria } from "@/hooks/use-clientes-whatsapp";
import type { DecisionAuditada } from "@/lib/clientes/vista-aprobacion";

// Comercial → WhatsApp de clientes → Revisar charlas (el auditor, docs/sofia/crm-propuesta.md
// §7, sólo admin). Dos listas y un contador:
//   · las aprobaciones decididas, con lo que propuso Sofía (el motor) contra lo que salió;
//   · las charlas donde intervino una persona (escribió, tomó, devolvió, aprobó);
//   · la racha de la etapa 2 (§9, decisión 5b): 20 aprobados seguidos sin cambios de importe,
//     metros o piezas. Una corrección de texto no la corta.

const pesos = (n: number | null) => (n === null ? "—" : `$ ${Math.round(n).toLocaleString("es-AR")}`);
const fecha = (s: string | null) => (s ? format(parseISO(s), "dd/MM HH:mm", { locale: es }) : "—");

const ESTADO: Record<string, { texto: string; tono: "gris" | "ambar" | "coral" | "rojo" }> = {
  aprobada: { texto: "Aprobada sin cambios", tono: "gris" },
  corregida: { texto: "Corregida", tono: "ambar" },
  falta_plantilla: { texto: "Aprobada, falta la plantilla", tono: "ambar" },
  rechazada: { texto: "No se mandó", tono: "rojo" },
  tomada: { texto: "La tomó una persona", tono: "coral" },
  descartada: { texto: "Descartada", tono: "rojo" },
  vencida: { texto: "Vencida", tono: "gris" },
  error: { texto: "Falló", tono: "rojo" },
  ejecutando: { texto: "Guardando", tono: "ambar" },
};

const TIPO: Record<string, string> = { precio: "Precio", tecnico: "Técnico", traspaso: "Traspaso", texto_bloqueado: "Texto bloqueado" };

function Decision({ d }: { d: DecisionAuditada }) {
  const e = ESTADO[d.estado] ?? { texto: d.estado, tono: "gris" as const };
  const distinto = d.propuesto !== null && d.enviado !== null && Math.abs(d.propuesto - d.enviado) > 1;
  return (
    <li className="flex flex-col gap-1 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/comercial/clientes?c=${d.conversacionId}`} className="min-w-0 flex-1 truncate text-[14.5px] font-medium hover:underline">{d.cliente}</Link>
        <span className="font-mono text-[12px] text-muted-foreground">#{d.numero}</span>
        <Pastilla tono={e.tono}>{e.texto}{d.correccionTipo ? ` · ${d.correccionTipo}` : ""}</Pastilla>
      </div>
      <p className="text-[13px] text-muted-foreground">{TIPO[d.tipo] ?? d.tipo}{d.resumen ? ` · ${d.resumen}` : ""}</p>
      {d.tipo === "precio" && (
        <p className={cn("text-[13.5px] tabular-nums", distinto && "text-hd-ambar")}>
          Propuso {pesos(d.propuesto)} → salió {d.estado === "rechazada" || d.estado === "tomada" ? "nada" : pesos(d.enviado)}{d.venta ? ` · ${d.venta}` : ""}
        </p>
      )}
      {d.motivoCorreccion && <p className="text-[13px]">Motivo: {d.motivoCorreccion}</p>}
      <p className="text-[12px] text-muted-foreground">{d.decididoPor ?? "—"} · {fecha(d.decididoAt)}</p>
    </li>
  );
}

export default function RevisarCharlasPage() {
  const q = useAuditoria(true);
  const [pestana, setPestana] = useState<"decisiones" | "intervenidas">("decisiones");
  const d = q.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-10">
      <header className="flex items-center gap-2">
        <Link href="/comercial/clientes" className={buttonVariants({ variant: "ghost", className: "h-10 px-2" })} aria-label="Volver a la bandeja">
          <ArrowLeft className="size-5" />
        </Link>
        <ClipboardCheck className="size-5 text-hd-boton" />
        <h1 className="flex-1 text-[17px] font-semibold">Revisar charlas</h1>
        {q.isFetching && !q.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </header>

      {q.isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : q.error || !d ? (
        <p className="flex items-center gap-2 text-sm text-destructive"><TriangleAlert className="size-4" /> {q.error?.message ?? "No se pudo leer."}</p>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4" aria-label="Racha para la etapa 2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-[15px] font-semibold">Racha para la etapa 2</h2>
              <span className="text-[22px] font-semibold tabular-nums">{d.racha.actual} de {d.racha.meta}</span>
              {d.racha.completa && <Pastilla tono="coral">Completa</Pastilla>}
            </div>
            <div className="mt-2 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5" aria-hidden>
              {Array.from({ length: d.racha.meta }, (_, i) => (
                <i key={i} className={cn("h-2 rounded-sm border border-border", i < d.racha.actual && "border-transparent bg-hd-verde")} />
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Bandejas fáciles aprobadas seguidas sin cambios de importe, metros o piezas (los cambios de texto no la cortan). De éstas, {d.racha.sinTocar} salieron sin ningún toque.
              {d.racha.ultimoCorte ? ` Se cortó por última vez el ${fecha(d.racha.ultimoCorte)}.` : ""}
            </p>
          </section>

          <div className="flex gap-1.5" role="tablist">
            {([["decisiones", `Aprobaciones decididas (${d.decisiones.length})`], ["intervenidas", `Intervino una persona (${d.intervenidas.length})`]] as const).map(([k, t]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={pestana === k}
                onClick={() => setPestana(k)}
                className={cn("h-10 rounded-full border px-3.5 text-[13.5px]", pestana === k ? "border-hd-boton bg-hd-boton/10 text-hd-boton" : "border-border text-muted-foreground")}
              >
                {t}
              </button>
            ))}
          </div>

          {pestana === "decisiones" ? (
            d.decisiones.length ? (
              <ul className="rounded-xl border border-border bg-card">{d.decisiones.map((x) => <Decision key={x.id} d={x} />)}</ul>
            ) : (
              <p className="text-[14px] text-muted-foreground">Todavía no hay aprobaciones decididas.</p>
            )
          ) : d.intervenidas.length ? (
            <ul className="rounded-xl border border-border bg-card">
              {d.intervenidas.map((c) => (
                <li key={c.conversacionId} className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/comercial/clientes?c=${c.conversacionId}`} className="min-w-0 flex-1 truncate text-[14.5px] font-medium hover:underline">{c.cliente}</Link>
                    <span className="text-[12px] text-muted-foreground">{fecha(c.ultima)}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">{c.personas.join(", ") || "Alguien"} · {c.intervenciones} {c.intervenciones === 1 ? "intervención" : "intervenciones"}</p>
                  {c.ultimoTexto && <p className="truncate text-[13px]">{c.ultimoTexto}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted-foreground">Ninguna persona intervino todavía.</p>
          )}
        </>
      )}
    </div>
  );
}
