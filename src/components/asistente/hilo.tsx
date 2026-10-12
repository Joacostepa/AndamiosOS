"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, FileText, Globe, ImageIcon } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Markdown } from "@/components/shared/markdown";
import type { ItemChat } from "@/lib/asistente/vista";
import type { EnVivo } from "@/hooks/use-asistente";
import { Pasos, Progreso } from "./progreso";

// La conversación: burbujas del vendedor a la derecha, respuestas del asistente a la
// izquierda (con markdown), lo que hizo en pasado (agrupado si son muchos pasos) y, mientras
// responde, la caja de progreso. Un separador por día, porque las charlas duran semanas.

function BurbujaVendedor({ texto, adjuntos }: { texto: string; adjuntos: { tipo: string; nombre: string | null; vista?: string }[] }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-hd-boton px-3.5 py-2 text-[15px] text-white">
        {adjuntos.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {adjuntos.map((a, i) =>
              a.vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista local de la foto que se está subiendo
                <img key={i} src={a.vista} alt={a.nombre ?? "foto"} className="h-20 rounded-md object-cover" />
              ) : (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-[13px]">
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

function BurbujaAsistente({ texto, herramientas, fuentes, interrumpido, vivo }: {
  texto: string;
  herramientas: { id: string; etiqueta: string; error?: boolean; estado?: string }[];
  fuentes?: { url: string; titulo: string }[];
  interrumpido?: boolean;
  /** La caja de progreso (sólo en la respuesta en vivo). */
  vivo?: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 max-w-[92%] flex-1">
        {vivo ?? <Pasos pasos={herramientas} />}
        {texto && (
          <div aria-live={vivo ? "polite" : undefined}>
            <Markdown className="text-[15px]">{texto}</Markdown>
          </div>
        )}
        {fuentes && fuentes.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
            <Globe className="size-3.5" /> Fuentes:
            {fuentes.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 max-w-[16rem] items-center truncate underline underline-offset-2 hover:text-foreground">{f.titulo}</a>
            ))}
          </p>
        )}
        {interrumpido && <p className="text-[13px] text-muted-foreground">(respuesta cortada)</p>}
      </div>
    </div>
  );
}

function nombreDia(fecha: string) {
  const d = parseISO(fecha);
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

function SeparadorDia({ fecha }: { fecha: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={nombreDia(fecha)}>
      <div className="h-px flex-1 bg-border" />
      <span className="text-[13px] font-medium text-muted-foreground first-letter:uppercase">{nombreDia(fecha)}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function alFondo(caja: HTMLElement) {
  caja.scrollTop = caja.scrollHeight;
}

/**
 * Mantiene el chat abajo de todo mientras crece: la respuesta en vivo, las tarjetas que salen
 * al terminar (confirmar, PDF, WhatsApp, que van DESPUÉS del hilo), una foto que termina de
 * cargar o el teclado del celular que achica la pantalla. Si el vendedor subió a leer algo no
 * lo baja de un tirón; al mandar un mensaje o abrir otra conversación vuelve abajo.
 *
 * Devuelve dos callback refs: el primero va en el div que scrollea y el segundo en el que crece
 * adentro.
 */
export function useSeguirAbajo(conversacionId: string | null, respondiendo: boolean) {
  const [caja, setCaja] = useState<HTMLDivElement | null>(null);
  const [contenido, setContenido] = useState<HTMLDivElement | null>(null);
  const abajo = useRef(true);

  useEffect(() => {
    if (!caja || !contenido) return;
    const seguir = () => {
      if (abajo.current) alFondo(caja);
    };
    const alScroll = () => {
      abajo.current = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 80;
    };
    const observador = new ResizeObserver(seguir);
    observador.observe(caja);
    observador.observe(contenido);
    caja.addEventListener("scroll", alScroll, { passive: true });
    return () => {
      observador.disconnect();
      caja.removeEventListener("scroll", alScroll);
    };
  }, [caja, contenido]);

  useEffect(() => {
    if (!caja) return;
    abajo.current = true;
    alFondo(caja);
  }, [caja, conversacionId]);

  useEffect(() => {
    if (!caja || !respondiendo) return;
    abajo.current = true;
    alFondo(caja);
  }, [caja, respondiendo]);

  return [setCaja, setContenido] as const;
}

export function Hilo({ items, enVivo, respondiendo }: { items: ItemChat[]; enVivo: EnVivo; respondiendo: boolean }) {
  return (
    <div className="space-y-4">
      {items.map((it, i) => {
        const dia = it.fecha?.slice(0, 10);
        const nuevoDia = !!dia && dia !== items[i - 1]?.fecha?.slice(0, 10);
        return (
          <Fragment key={it.id}>
            {nuevoDia && <SeparadorDia fecha={it.fecha} />}
            {it.rol === "vendedor" ? (
              <BurbujaVendedor texto={it.texto} adjuntos={it.adjuntos} />
            ) : it.rol === "sistema" ? (
              <p className="text-center text-[13px] text-muted-foreground">{it.texto}</p>
            ) : (
              <BurbujaAsistente texto={it.texto} herramientas={it.herramientas} fuentes={it.fuentes} interrumpido={it.interrumpido} />
            )}
          </Fragment>
        );
      })}
      {respondiendo && enVivo.vendedor && <BurbujaVendedor texto={enVivo.vendedor.texto} adjuntos={enVivo.vendedor.adjuntos.map((a) => ({ tipo: a.tipo, nombre: a.nombre, vista: a.vista }))} />}
      {respondiendo && (
        <BurbujaAsistente
          texto={enVivo.texto}
          herramientas={enVivo.herramientas}
          vivo={<Progreso pasos={enVivo.herramientas} progreso={enVivo.progreso} escribiendo={!!enVivo.texto && !enVivo.pensando} />}
        />
      )}
    </div>
  );
}
