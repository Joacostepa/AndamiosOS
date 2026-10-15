"use client";

import { Fragment } from "react";
import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, Loader2, MapPin } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { AdjuntoVista, ItemHilo } from "@/lib/clientes/vista";

// El hilo de la charla, estilo WhatsApp: lo del cliente a la izquierda, lo de ABA a la
// derecha (coral si lo escribió una persona), los eventos (tomó, cerró) al medio. Fotos,
// audios con la transcripción abajo como ayuda, videos, documentos y ubicaciones. Lo que sale
// lleva las tildes de entrega, y si Meta lo rechazó, el motivo (el 131047 de las 24 h).

function nombreDia(fecha: string) {
  const d = parseISO(fecha);
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

function Tildes({ estado }: { estado: ItemHilo["estado"] }) {
  switch (estado) {
    case "enviando":
      return <Clock className="size-3.5" aria-label="enviando" />;
    case "enviado":
      return <Check className="size-3.5" aria-label="enviado" />;
    case "entregado":
      return <CheckCheck className="size-3.5" aria-label="entregado" />;
    case "leido":
      return <CheckCheck className="size-3.5 text-sky-600 dark:text-sky-400" aria-label="leído" />;
    case "error":
      return <AlertCircle className="size-3.5 text-hd-rojo" aria-label="no se entregó" />;
    default:
      return null;
  }
}

function Adjunto({ a, tipo, nombreCliente }: { a: AdjuntoVista; tipo: string; nombreCliente: string }) {
  if (a.tipo === "ubicacion") {
    const url = `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-[14px] underline-offset-2 hover:underline">
        <MapPin className="size-4 shrink-0 text-hd-boton" />
        <span className="min-w-0">
          <span className="block truncate">{[a.nombre, a.direccion].filter(Boolean).join(", ") || "Ubicación compartida"}</span>
          <span className="block text-[12px] text-muted-foreground tabular-nums">{a.lat.toFixed(5)}, {a.lng.toFixed(5)} · abrir en el mapa</span>
        </span>
      </a>
    );
  }
  if (!a.url) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">
        {a.pendiente ? <Loader2 className="size-4 animate-spin" /> : <AlertCircle className="size-4 text-hd-rojo" />}
        <span className="min-w-0">
          {a.pendiente ? `Bajando ${a.nombre}…` : `No se pudo bajar ${a.nombre}.`}
          {!a.pendiente && a.error && <span className="block text-[12px]">{a.error}</span>}
        </span>
      </div>
    );
  }
  const mime = a.mime ?? "";
  if (tipo === "audio" || mime.startsWith("audio/")) {
    return <audio controls preload="none" src={a.url} className="h-11 w-64 max-w-full" aria-label={`Audio de ${nombreCliente}`} />;
  }
  if ((tipo === "image" || tipo === "sticker" || mime.startsWith("image/")) && mime !== "image/svg+xml") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage por redirección */}
        <img src={a.url} alt={a.nombre} loading="lazy" className={cn("max-h-72 rounded-lg object-cover", tipo === "sticker" ? "size-32 object-contain" : "w-64 max-w-full")} />
      </a>
    );
  }
  if (tipo === "video" || mime.startsWith("video/")) {
    return <video controls preload="none" src={a.url} className="max-h-72 w-64 max-w-full rounded-lg bg-black" aria-label={`Video de ${nombreCliente}`} />;
  }
  return (
    <a href={`${a.url}?descargar=1`} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-[14px] hover:bg-muted">
      <FileText className="size-5 shrink-0 text-hd-boton" />
      <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
      <Download className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function Burbuja({ item, nombreCliente }: { item: ItemHilo; nombreCliente: string }) {
  const sale = item.direccion === "saliente";
  const hora = format(parseISO(item.momento), "HH:mm");
  const quien = sale
    ? item.autor === "persona"
      ? item.autorNombre ?? "Equipo"
      : item.autor === "sistema"
        ? "Texto fijo"
        : item.autor === "plantilla"
          ? "Plantilla de Meta"
          : "IA"
    : nombreCliente;
  const textoEsAdjunto = item.adjunto?.tipo === "ubicacion"; // el texto de la ubicación ya está en la tarjeta
  return (
    <div className={cn("flex", sale ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] space-y-1.5 rounded-xl border px-3 py-2 text-[15px] sm:max-w-[75%]",
          sale ? "rounded-tr-sm" : "rounded-tl-sm",
          !sale && "border-border bg-card",
          sale && item.autor === "persona" && "border-transparent bg-hd-boton/10",
          sale && item.autor !== "persona" && "border-border bg-hd-card2",
          item.estado === "error" && "border-dashed border-hd-rojo",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="truncate">{quien}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 font-normal tracking-normal normal-case tabular-nums">
            {hora}
            {sale && <Tildes estado={item.estado} />}
          </span>
        </div>
        {item.adjunto && <Adjunto a={item.adjunto} tipo={item.tipo} nombreCliente={nombreCliente} />}
        {item.texto && !textoEsAdjunto && <p className="break-words whitespace-pre-wrap">{item.texto}</p>}
        {item.tipo === "audio" && item.transcripcion && (
          <p className="border-l-2 border-border pl-2 text-[13.5px] text-muted-foreground">
            <span className="mr-1 text-[11px] font-semibold uppercase">Transcripción</span>
            {item.transcripcion}
          </p>
        )}
        {item.estado === "error" && <p className="text-[13px] text-hd-rojo">{item.errorDetalle ?? "WhatsApp no lo entregó."}</p>}
      </div>
    </div>
  );
}

export function HiloCharla({ items, nombreCliente }: { items: ItemHilo[]; nombreCliente: string }) {
  if (!items.length) return <p className="py-10 text-center text-[14px] text-muted-foreground">Sin mensajes todavía.</p>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => {
        const dia = nombreDia(it.momento);
        const nuevoDia = i === 0 || nombreDia(items[i - 1].momento) !== dia;
        return (
          <Fragment key={it.id}>
            {nuevoDia && (
              <div className="flex justify-center py-1">
                <span className="rounded-md bg-muted px-2.5 py-0.5 text-[12px] text-muted-foreground first-letter:uppercase">{dia}</span>
              </div>
            )}
            {it.direccion === "evento" ? (
              <p className="text-center text-[12.5px] text-muted-foreground">
                {it.texto} <span className="tabular-nums">{format(parseISO(it.momento), "HH:mm")}</span>
              </p>
            ) : (
              <Burbuja item={it} nombreCliente={nombreCliente} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
