import { cache, Fragment } from "react";
import type { Metadata } from "next";
import { Clock, Download, FileText, Lock, MapPin, TriangleAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerCharlaCompartida, type ArchivoCompartido, type CharlaCompartida } from "@/lib/clientes/link-charla";
import type { ItemHilo } from "@/lib/clientes/vista";
import { BotonImprimir } from "./imprimir";

// /charla/<token> — la charla de WhatsApp compartida por link (JS, 16/11; maqueta en
// https://claude.ai/artifact/X369vePBogcdamxSSqTMUr, página «Link»). Pública: la protege el
// token, que vence a los 30 días. Se arma en el servidor en cada visita (muestra lo último) y
// las fotos, audios y videos van con URLs firmadas por 6 h.

export const dynamic = "force-dynamic";

const leer = cache(async (token: string) => leerCharlaCompartida(createAdminClient(), token));

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const r = await leer(token);
  const titulo = r.estado === "ok" ? `Charla con ${r.charla.nombre} · Andamios Buenos Aires` : "Charla de WhatsApp · Andamios Buenos Aires";
  return {
    title: titulo,
    description: "Uso interno de Andamios Buenos Aires.",
    robots: { index: false, follow: false },
    openGraph: { title: titulo, description: "Charla de WhatsApp de clientes · uso interno de ABA" },
    referrer: "no-referrer",
  };
}

const ZONA = "America/Argentina/Buenos_Aires";
const hora = (iso: string) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA }).format(new Date(iso));
const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA }).format(new Date(iso));
const diaMesHora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA }).format(new Date(iso)).replace(",", "");
function nombreDia(iso: string) {
  const t = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA }).format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border border-[#e3dcda] bg-white p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo estático */}
        <img src="/aba-logo.png" alt="Andamios Buenos Aires" className="mx-auto h-12 w-auto" />
        <h1 className="text-[20px] font-semibold text-[#AF2C19]">{titulo}</h1>
        <p className="text-[14px] leading-relaxed text-[#555]">{texto}</p>
      </div>
    </main>
  );
}

function Ficha({ filas }: { filas: { etiqueta: string; valor: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13.5px] leading-snug">
      {filas.map((f) => (
        <Fragment key={f.etiqueta}>
          <dt className="text-[#555]">{f.etiqueta}</dt>
          <dd className="m-0 min-w-0 break-words">{f.valor}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Tarjeta({ titulo, children, className = "" }: { titulo: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-2.5 rounded-xl border border-[#e3dcda] bg-white px-5 py-4 break-inside-avoid ${className}`}>
      <h2 className="text-[15px] font-bold text-[#AF2C19]">{titulo}</h2>
      {children}
    </section>
  );
}

/** Un archivo dentro de la charla o en la galería. */
function Medio({ a, grande = false }: { a: ArchivoCompartido; grande?: boolean }) {
  if (a.tipo === "image") {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block" aria-label={`Ver ${a.clase.toLowerCase()} ${a.numero} en grande`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
        <img src={a.url} alt={`${a.clase} ${a.numero} de ${a.de}`} loading="lazy" className={grande ? "max-h-80 w-72 max-w-full rounded-lg object-cover" : "h-32 w-full rounded-lg object-cover"} />
      </a>
    );
  }
  if (a.tipo === "video") {
    // #t=0.1: el iPhone muestra el primer cuadro en vez de un recuadro negro.
    return <video controls playsInline preload="metadata" src={`${a.url}#t=0.1`} className={grande ? "max-h-80 w-72 max-w-full rounded-lg bg-black" : "h-32 w-full rounded-lg bg-black object-cover"} aria-label={`Video ${a.numero} de ${a.de}`} />;
  }
  if (a.tipo === "audio") {
    return <audio controls preload="none" src={a.url} className="h-11 w-72 max-w-full" aria-label={`Audio de ${a.de}`} />;
  }
  return (
    <a href={a.urlDescarga} className={`flex items-center gap-2.5 rounded-lg border-[1.5px] border-[#cfcfcf] bg-white px-3 text-[13px] font-semibold text-[#1a1a1a] no-underline hover:bg-[#F7EBEB] ${grande ? "min-h-14 py-2" : "h-32 flex-col justify-center text-center"}`}>
      <FileText className="size-6 shrink-0 text-[#AF2C19]" aria-hidden />
      <span className="min-w-0 break-all">{a.nombre}</span>
    </a>
  );
}

function quien(it: ItemHilo, cliente: string): { texto: string; lado: "izq" | "der"; tono: "cliente" | "tomas" | "equipo" } {
  if (it.direccion === "entrante") return { texto: cliente, lado: "izq", tono: "cliente" };
  if (it.autor === "ia") return { texto: "Tomás · IA", lado: "der", tono: "tomas" };
  if (it.autor === "persona") return { texto: `${it.autorNombre ?? "Equipo"} · ABA`, lado: "der", tono: "equipo" };
  if (it.autor === "plantilla") return { texto: "ABA · plantilla", lado: "der", tono: "equipo" };
  return { texto: "ABA · texto fijo", lado: "der", tono: "equipo" };
}

function Charla({ c }: { c: CharlaCompartida }) {
  const cliente = c.nombre.split(" ")[0];
  const dias = c.items.map((it) => nombreDia(it.momento));
  return (
    <div className="flex flex-col gap-2.5">
      {c.items.map((it, i) => {
        const dia = dias[i];
        const separador = i === 0 || dia !== dias[i - 1];
        const cabecera = separador ? (
          <div className="flex justify-center py-1 break-inside-avoid">
            <span className="rounded-md bg-[#E8E8E8] px-2.5 py-0.5 text-[12px] font-semibold">{dia}</span>
          </div>
        ) : null;
        if (it.direccion === "evento") {
          return (
            <Fragment key={it.id}>
              {cabecera}
              <p className="text-center text-[12.5px] text-[#555]">{hora(it.momento)} · {it.texto}</p>
            </Fragment>
          );
        }
        const q = quien(it, cliente);
        const archivo = c.archivoDe[it.id];
        const ubicacion = it.adjunto?.tipo === "ubicacion" ? it.adjunto : null;
        const fondo = q.tono === "cliente" ? "border border-[#e0dad8] bg-white rounded-tl-[4px]" : q.tono === "tomas" ? "bg-[#E0F2FE] rounded-tr-[4px]" : "bg-[#F7EBEB] rounded-tr-[4px]";
        const colorQuien = q.tono === "cliente" ? "text-[#555]" : q.tono === "tomas" ? "text-[#0c4a6e]" : "text-[#AF2C19]";
        return (
          <Fragment key={it.id}>
            {cabecera}
            <div className={`flex ${q.lado === "der" ? "justify-end" : "justify-start"} break-inside-avoid`}>
              <div className={`flex max-w-[84%] flex-col gap-1.5 rounded-[14px] px-3 py-2 text-[14px] leading-relaxed sm:max-w-[75%] ${fondo}`}>
                <div className={`flex justify-between gap-3 text-[11px] font-bold tracking-wide uppercase ${colorQuien}`}>
                  <span>{q.texto}{archivo ? ` · ${archivo.clase.toLowerCase()}` : ""}</span>
                  <span className="font-normal">{hora(it.momento)}</span>
                </div>
                {archivo && <Medio a={archivo} grande />}
                {!archivo && it.adjunto?.tipo === "archivo" && (
                  <span className="text-[12.5px] text-[#555] italic">{it.adjunto.pendiente ? "El archivo se está bajando." : "Este archivo no se pudo bajar."}</span>
                )}
                {ubicacion && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${ubicacion.lat},${ubicacion.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px]">
                    <MapPin className="size-4" aria-hidden /> {[ubicacion.nombre, ubicacion.direccion].filter(Boolean).join(", ") || "Ubicación compartida"}
                  </a>
                )}
                {it.texto && !ubicacion && <p className="m-0 break-words whitespace-pre-wrap">{it.texto}</p>}
                {it.tipo === "audio" && it.transcripcion && <em className="text-[13px] text-[#3a3a3a]">«{it.transcripcion}»</em>}
                {it.estado === "error" && <span className="text-[12.5px] text-[#AF2C19]">No le llegó al cliente.</span>}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default async function CharlaCompartidaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await leer(token);
  if (r.estado !== "ok") {
    if (r.estado === "vencido") return <Aviso titulo="Este link venció" texto="Los links de las charlas duran 30 días. Pedile a quien te lo mandó que genere uno nuevo desde la charla." />;
    if (r.estado === "cortado") return <Aviso titulo="Este link ya no está disponible" texto="Lo cortaron desde la charla. Si lo necesitás, pedí uno nuevo." />;
    return <Aviso titulo="Este link no existe" texto="Revisá que esté completo, o pedí uno nuevo a quien te lo mandó." />;
  }

  const c = r.charla;
  const galeria = c.archivos.filter((a) => a.tipo !== "audio");
  return (
    <div className="print:bg-white">
      <header className="border-b border-[#e3dcda] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo estático */}
            <img src="/aba-logo.png" alt="Andamios Buenos Aires" className="h-9 w-auto sm:h-10" />
            <span className="hidden border-l border-[#cfcfcf] pl-3.5 text-[14px] text-[#555] sm:inline">Charla de WhatsApp</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[12.5px] text-[#555] sm:inline-flex print:hidden">
              <Clock className="size-4" aria-hidden /> El link vence el {fechaCorta(c.venceAt)}
            </span>
            <BotonImprimir />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6 pb-14 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] leading-tight font-semibold text-[#AF2C19] sm:text-[34px]">{c.nombre}</h1>
            <p className="text-[13px] text-[#555] sm:text-[14px]">
              <a href={`tel:+${c.telefono}`} className="text-[#AF2C19]">{c.telefonoLegible}</a>
              {c.desde && c.hasta ? ` · del ${diaMesHora(c.desde)} al ${diaMesHora(c.hasta)}` : ""} · {c.mensajes} mensajes
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {c.etiquetas.map((e, i) => (
                <span key={e} className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${i === 0 ? "bg-[#F7EBEB] text-[#AF2C19]" : "bg-[#E8E8E8]"}`}>{e}</span>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-lg border border-[#e3dcda] bg-white px-3 py-2 text-[12.5px] text-[#555]">
            <Lock className="size-4 text-[#AF2C19]" aria-hidden />
            Uso interno de ABA{c.compartidoPor ? ` · Compartido por ${c.compartidoPor}` : ""} · No reenviar al cliente
          </p>
        </section>

        <div className="flex flex-wrap items-start gap-6">
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <Tarjeta titulo="Datos del cliente">
              <Ficha filas={c.cliente} />
              {c.mapa && (
                <a href={c.mapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#AF2C19] print:hidden">
                  <MapPin className="size-4" aria-hidden /> Ver la dirección en el mapa
                </a>
              )}
            </Tarjeta>
            {(c.servicio.length > 0 || c.tarea || c.ojo) && (
              <Tarjeta titulo="El servicio">
                {c.tarea && <p className="text-[13.5px] leading-relaxed">Para <strong>{c.tarea}</strong>.</p>}
                <Ficha filas={c.servicio} />
                {c.ojo && (
                  <p className="mt-1 flex gap-2 rounded-lg bg-[#F7EBEB] px-3 py-2.5 text-[12.5px] leading-snug">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#AF2C19]" aria-hidden />
                    <span><strong>Lo que marcó Tomás:</strong> {c.ojo}</span>
                  </p>
                )}
              </Tarjeta>
            )}
            {c.equipo.length > 0 && (
              <Tarjeta titulo="Equipo">
                <Ficha filas={c.equipo} />
              </Tarjeta>
            )}
          </aside>

          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            {galeria.length > 0 && (
              <Tarjeta titulo={`Fotos, videos y archivos · ${galeria.length}`}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
                  {galeria.map((a) => (
                    <figure key={a.itemId} className="m-0 flex flex-col gap-1">
                      <Medio a={a} />
                      <figcaption className="flex items-center justify-between gap-2 text-[11.5px] text-[#555]">
                        <span>{a.clase} {a.numero} · {a.de} · {diaMesHora(a.momento)}</span>
                        <a href={a.urlDescarga} aria-label={`Bajar ${a.clase.toLowerCase()} ${a.numero}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#AF2C19] hover:bg-[#F7EBEB] print:hidden">
                          <Download className="size-4" aria-hidden />
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </Tarjeta>
            )}

            <Tarjeta titulo={<span className="flex flex-wrap items-baseline justify-between gap-3"><span>La charla</span><span className="text-[12.5px] font-normal text-[#555] print:hidden">Muestra lo último cada vez que se abre</span></span>}>
              <Charla c={c} />
            </Tarjeta>
          </div>
        </div>

        <footer className="text-center text-[12px] text-[#555]">
          Andamios Buenos Aires · Este link lo puede abrir cualquiera que lo tenga hasta el {fechaCorta(c.venceAt)}. Se puede cortar antes desde la charla.
        </footer>
      </main>
    </div>
  );
}
