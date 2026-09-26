"use client";

import { useEffect, useRef } from "react";
import { Bot, CircleX, FileText, ImageIcon, Loader2, Wrench } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import type { ItemChat } from "@/lib/asistente/vista";
import type { EnVivo } from "@/hooks/use-asistente";

// La conversación: burbujas del vendedor a la derecha, respuestas del asistente a la
// izquierda (con markdown), y lo que el asistente está haciendo como chips chicos.

function Chips({ herramientas }: { herramientas: { id: string; etiqueta: string; error?: boolean; estado?: string }[] }) {
  if (!herramientas.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {herramientas.map((h) => {
        const error = h.error || h.estado === "error";
        return (
          <span key={h.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${error ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"}`}>
            {h.estado === "inicio" ? <Loader2 className="size-3 animate-spin" /> : error ? <CircleX className="size-3" /> : <Wrench className="size-3" />}
            {h.etiqueta}
          </span>
        );
      })}
    </div>
  );
}

function BurbujaVendedor({ texto, adjuntos }: { texto: string; adjuntos: { tipo: string; nombre: string | null; vista?: string }[] }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[14px] text-primary-foreground">
        {adjuntos.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {adjuntos.map((a, i) =>
              a.vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista local de la foto que se está subiendo
                <img key={i} src={a.vista} alt={a.nombre ?? "foto"} className="h-20 rounded-md object-cover" />
              ) : (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-primary-foreground/15 px-2 py-1 text-[12px]">
                  {a.tipo === "imagen" || a.tipo.startsWith?.("image") ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
                  {a.nombre ?? (a.tipo === "imagen" ? "Foto" : "PDF")}
                </span>
              ),
            )}
          </div>
        )}
        {texto && <p className="whitespace-pre-wrap">{texto}</p>}
      </div>
    </div>
  );
}

function BurbujaAsistente({ texto, herramientas, pensando, interrumpido }: {
  texto: string;
  herramientas: { id: string; etiqueta: string; error?: boolean; estado?: string }[];
  pensando?: boolean;
  interrumpido?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 max-w-[92%] flex-1">
        <Chips herramientas={herramientas} />
        {texto && <Markdown className="text-[14px]">{texto}</Markdown>}
        {pensando && !texto && <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Pensando…</p>}
        {interrumpido && <p className="text-[11px] text-muted-foreground">(respuesta cortada)</p>}
      </div>
    </div>
  );
}

export function Hilo({ items, enVivo, respondiendo }: { items: ItemChat[]; enVivo: EnVivo; respondiendo: boolean }) {
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, enVivo.texto, enVivo.herramientas.length, respondiendo]);

  return (
    <div className="space-y-4">
      {items.map((it) =>
        it.rol === "vendedor" ? (
          <BurbujaVendedor key={it.id} texto={it.texto} adjuntos={it.adjuntos} />
        ) : it.rol === "sistema" ? (
          <p key={it.id} className="text-center text-[11px] text-muted-foreground">{it.texto}</p>
        ) : (
          <BurbujaAsistente key={it.id} texto={it.texto} herramientas={it.herramientas} interrumpido={it.interrumpido} />
        ),
      )}
      {respondiendo && enVivo.vendedor && <BurbujaVendedor texto={enVivo.vendedor.texto} adjuntos={enVivo.vendedor.adjuntos.map((a) => ({ tipo: a.tipo, nombre: a.nombre, vista: a.vista }))} />}
      {respondiendo && (
        <BurbujaAsistente texto={enVivo.texto} herramientas={enVivo.herramientas} pensando={enVivo.pensando || (!enVivo.texto && !enVivo.herramientas.length)} />
      )}
      <div ref={fin} />
    </div>
  );
}
