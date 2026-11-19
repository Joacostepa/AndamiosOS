// «Copiar para Slack» (JS, 16/11): todo lo de una charla en un texto para pegar en Slack,
// mientras el equipo todavía no usa la bandeja. Los datos del cliente y del servicio (de la
// ficha que juntó Tomás), la pareja asignada, los archivos con un link que dura LINKS_DIAS días
// y la charla completa, con el formato de Slack (*negrita*).
//
// Puro: la ruta (conversaciones/:id/slack) lee la charla y firma los links; esto sólo arma el
// texto. Las fotos no viajan en el texto: van como link (Slack muestra la vista previa) y, para
// guardarlas en Slack, la pantalla tiene «Bajar archivos».

import { datosDelPedido } from "./aprobacion-alquiler.ts";
import { metros, textoFranja } from "./alquiler-simple.ts";
import type { BanderaIA } from "./facil.ts";
import { ORIGENES, type FichaSofia } from "./herramientas.ts";
import { pastilla, telefonoLegible, type CharlaListada, type ItemHilo } from "./vista.ts";

/** Cuánto dura el link de cada archivo (los de Storage son privados). */
export const LINKS_DIAS = 30;

const ZONA = "America/Argentina/Buenos_Aires";

/** «12/11 10:32» en hora de Buenos Aires (el servidor corre en UTC). */
export function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA })
    .format(new Date(iso))
    .replace(",", "");
}

const hora = (iso: string) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA }).format(new Date(iso));

/** «miércoles 12/11». */
function dia(iso: string): string {
  const d = new Date(iso);
  const nombre = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: ZONA }).format(d);
  const fecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: ZONA }).format(d);
  return `${nombre} ${fecha}`;
}

/** «2026-11-24» → «24/11/2026». */
function fechaCorta(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

const siNo = (b: boolean | null | undefined) => (b === true ? "sí" : b === false ? "no" : null);

const TRABAJO: Record<string, string> = {
  bandeja: "Bandeja de protección",
  alquiler_simple: "Alquiler de material (andamio simple)",
  fachada: "Andamio de fachada",
  otro: "Otro trabajo",
};

const TIPO_CLIENTE: Record<string, string> = { particular: "Particular", consorcio: "Consorcio", empresa: "Empresa o constructora" };

const BANDERA: Record<BanderaIA, string> = {
  descuento: "pide descuento o regatea",
  fecha: "pide una fecha puntual",
  nocturno: "trabajo de noche",
  condiciones: "pide condiciones especiales",
  enojo: "enojo o reclamo",
  seguridad: "problema de seguridad en obra",
  persona: "pide hablar con una persona",
  tramo: "sólo una parte del frente",
  otro_trabajo: "pide otro trabajo",
};

/** Un archivo del hilo con su link firmado. */
export type ArchivoSlack = { itemId: string; url: string };

export type DatosSlack = {
  charla: Pick<CharlaListada, "telefono" | "nombre" | "estado" | "motivo" | "asistente" | "createdAt">;
  ficha: FichaSofia;
  pareja: { tecnico: string | null; asistente: string | null };
  items: ItemHilo[];
  /** Los links firmados, por id del renglón del hilo. Los que no están van sin link. */
  links: Map<string, string>;
  /** Hasta cuándo andan los links. */
  vencen: Date;
};

/** «Foto», «PDF», «Video», «Audio» o «Archivo», según el tipo del mensaje y el mime. */
export function claseArchivo(tipo: string, mime: string | null): string {
  const m = mime ?? "";
  if (tipo === "sticker") return "Sticker";
  if (tipo === "image" || m.startsWith("image/")) return "Foto";
  if (tipo === "video" || m.startsWith("video/")) return "Video";
  if (tipo === "audio" || m.startsWith("audio/")) return "Audio";
  if (m === "application/pdf") return "PDF";
  return "Archivo";
}

function quienEscribio(it: ItemHilo, cliente: string): string {
  if (it.direccion === "entrante") return cliente;
  if (it.autor === "persona") return `${it.autorNombre ?? "Equipo"} (ABA)`;
  if (it.autor === "ia") return "Tomás (IA)";
  if (it.autor === "plantilla") return "ABA (plantilla de Meta)";
  return "ABA (texto fijo)";
}

/** Un dato de la ficha: lo usan el texto para Slack y la página del link (link-charla.ts). */
export type FilaFicha = { etiqueta: string; valor: string };

/** Los datos con valor (sin los vacíos ni «—»). */
function renglones(filas: [string, string | number | null | undefined][]): FilaFicha[] {
  return filas.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "—").map(([k, v]) => ({ etiqueta: k, valor: String(v) }));
}

const vinetas = (fs: FilaFicha[]) => fs.map((f) => `• ${f.etiqueta}: ${f.valor}`);

export function filasCliente(d: DatosSlack): FilaFicha[] {
  const f = d.ficha;
  const lote = f.lote;
  const ubic = f.alquiler?.ubicacion ?? null;
  const zona = ubic
    ? [ubic.lugar, ubic.partido].filter(Boolean).join(", ") || (ubic.enCaba ? "CABA" : null)
    : f.enCaba === true
      ? "CABA"
      : f.enCaba === false
        ? "fuera de CABA"
        : null;
  const direccion = ubic?.normalizada || f.direccion;
  const catastro = lote
    ? [
        lote.direccionOficial ? `dirección oficial ${lote.direccionOficial}` : null,
        lote.caras.length ? `frente ${lote.caras.map(metros).join(" + ")} m` : lote.frenteCatastro ? `frente ${metros(lote.frenteCatastro)} m` : null,
        lote.esquina ? "esquina" : null,
        lote.pisos ? `${lote.pisos} pisos` : null,
        lote.fuente === "vendedor" ? "medida que declaró el vendedor" : null,
      ].filter(Boolean).join(", ")
    : null;
  return renglones([
    ["Nombre", f.nombre ?? (d.charla.nombre ? `${d.charla.nombre} (perfil de WhatsApp)` : null)],
    ["Contacto", f.contacto && f.contacto !== f.nombre ? f.contacto : null],
    ["Teléfono", telefonoLegible(d.charla.telefono)],
    ["Mail", f.mail],
    ["CUIT", f.cuit],
    ["DNI", f.dni],
    ["Es", f.tipoCliente ? TIPO_CLIENTE[f.tipoCliente] : null],
    ["Dirección", direccion ? `${direccion}${zona && !direccion.toLowerCase().includes(zona.toLowerCase()) ? ` (${zona})` : ""}` : null],
    ["Catastro", catastro],
    ["En Odoo", f.partnerId ? `ya es contacto (id ${f.partnerId})` : null],
    ["Trato", f.trato === "usted" ? "escribe de usted" : null],
    ["Gama alta", f.segmento === "gama_alta" ? "sí" : null],
    ["Cómo nos conoció", f.origen ? `${ORIGENES[f.origen.via]}${f.origen.detalle ? ` (${f.origen.detalle})` : ""}` : null],
  ]);
}

/** El servicio. «Ojo» (lo que marcó Tomás) va último. */
export function filasServicio(d: DatosSlack): FilaFicha[] {
  const f = d.ficha;
  const out = renglones([
    ["Qué pide", f.trabajo ? TRABAJO[f.trabajo] ?? f.trabajo : null],
    ["Para qué", f.tarea],
  ]);
  if (f.trabajo === "bandeja" || f.alturaBandeja || f.necesitaAndamio !== null || f.cubreTodoElFrente !== null) {
    out.push(...renglones([
      ["Altura de la bandeja", f.alturaBandeja ? `${metros(f.alturaBandeja)} m` : null],
      ["También andamio en el frente", siNo(f.necesitaAndamio)],
      ["Todo el frente", f.cubreTodoElFrente === true ? "sí" : f.cubreTodoElFrente === false ? "sólo una parte" : null],
      ["Medida que dijo el cliente", f.metrosCliente ? `${metros(f.metrosCliente)} m` : null],
    ]));
  }
  if (f.obra) {
    out.push(...renglones([
      ["Pisos", f.obra.pisos],
      ["Tiene planos", siNo(f.obra.tienePlanos)],
      ["La obra", f.obra.descripcion],
    ]));
  }
  out.push(...renglones([["Visita", f.visita]]));

  const a = f.alquiler;
  if (a?.pedido) {
    const p = a.pedido;
    for (const r of datosDelPedido(p)) out.push(...renglones([[r.etiqueta, r.valor]]));
    out.push(...renglones([
      ["Entrega", p.fecha ? `${fechaCorta(p.fecha)}${p.franja ? `, ${textoFranja(p.franja)}` : ""}` : p.paraHoy ? "para hoy" : null],
      ["Fuera de catálogo", p.piezasFueraDeCatalogo.length ? p.piezasFueraDeCatalogo.join(", ") : null],
      ["Armado", p.montaje ? "lo pide armado" : null],
      ["Anclar", p.anclar ? "hay que anclarlo" : null],
      ["Plataforma", p.aceptaPlataforma === true ? "aceptó la plataforma propuesta" : p.aceptaPlataforma === false ? "no aceptó la plataforma propuesta" : null],
    ]));
  } else if (a && (a.piezas.length || a.entrega || a.notas)) {
    out.push(...renglones([
      ["Piezas", a.piezas.map((x) => `${x.cantidad} × ${x.descripcion}`).join(", ")],
      ["Por cuántos días", a.dias],
      ["Entrega", a.entrega === "retira" ? "retira en el depósito" : a.entrega === "envio" ? `envío${a.barrio ? ` a ${a.barrio}` : ""}` : null],
      ["Notas", a.notas],
    ]));
  }
  if (a) {
    out.push(...renglones([
      ["Presupuesto", a.cotizacion ? `N° ${a.cotizacion.numero}, enviado el ${fechaHora(a.cotizacion.at)} (entrega ${fechaCorta(a.cotizacion.fecha)}, ${textoFranja(a.cotizacion.franja)})` : null],
      ["Aceptó", a.aceptado ? `sí, el ${fechaHora(a.aceptado.at)} (entrega ${fechaCorta(a.aceptado.fecha)}, ${textoFranja(a.aceptado.franja)})` : null],
      ["Documentos", a.documentos ? (a.documentos.completosAt ? `completos (${a.documentos.recibidos.length})` : `recibidos ${a.documentos.recibidos.length}, faltan`) : null],
      ["Retiro", a.retiro ? `avisado para el ${fechaCorta(a.retiro.fecha)}, ${textoFranja(a.retiro.franja)}` : null],
    ]));
  }
  const banderas = [...new Set(f.banderas)].map((b) => BANDERA[b] ?? b);
  out.push(...renglones([["Ojo", banderas.length ? banderas.join("; ") : null]]));
  return out;
}

export function filasEquipo(d: DatosSlack): FilaFicha[] {
  const p = pastilla(d.charla, "").texto;
  return renglones([
    ["Técnico", d.pareja.tecnico],
    ["Vendedora", d.pareja.asistente],
    ["La charla", p],
    ["Empezó", fechaHora(d.charla.createdAt)],
  ]);
}

/** El texto entero, listo para pegar en Slack. */
export function textoParaSlack(d: DatosSlack): string {
  const f = d.ficha;
  const nombre = f.nombre ?? d.charla.nombre ?? telefonoLegible(d.charla.telefono);
  const cliente = (f.nombre ?? d.charla.nombre)?.split(" ")[0] || "Cliente";
  const out: string[] = [`*WhatsApp de clientes: ${nombre}*`, ""];

  out.push("*Datos del cliente*", ...vinetas(filasCliente(d)), "");
  const servicio = vinetas(filasServicio(d));
  if (servicio.length) out.push("*El servicio*", ...servicio, "");
  out.push("*Equipo*", ...vinetas(filasEquipo(d)), "");

  // Los archivos, numerados: en la charla se nombran «[Foto 2]».
  const numero = new Map<string, string>();
  const archivos: string[] = [];
  for (const it of d.items) {
    if (it.adjunto?.tipo !== "archivo") continue;
    const clase = claseArchivo(it.tipo, it.adjunto.mime);
    const n = archivos.length + 1;
    numero.set(it.id, `${clase} ${n}`);
    const de = it.direccion === "entrante" ? cliente : quienEscribio(it, cliente);
    const url = d.links.get(it.id);
    archivos.push(`${n}. ${clase} de ${de}, ${fechaHora(it.momento)}: ${url ?? (it.adjunto.pendiente ? "(todavía se está bajando)" : "(no se pudo bajar)")}`);
  }
  if (archivos.length) {
    out.push(`*Fotos y archivos* (los links andan hasta el ${fechaHora(d.vencen.toISOString()).split(" ")[0]})`, ...archivos, "");
  }

  out.push("*La charla*");
  let diaAnterior = "";
  for (const it of d.items) {
    const elDia = dia(it.momento);
    if (elDia !== diaAnterior) {
      out.push(`_${elDia}_`);
      diaAnterior = elDia;
    }
    if (it.direccion === "evento") {
      out.push(`${hora(it.momento)} · ${it.texto ?? ""}`.trimEnd());
      continue;
    }
    const partes: string[] = [];
    const adj = it.adjunto;
    if (adj?.tipo === "archivo") partes.push(`[${numero.get(it.id) ?? "Archivo"}]`);
    if (adj?.tipo === "ubicacion") {
      const donde = [adj.nombre, adj.direccion].filter(Boolean).join(", ");
      partes.push(`[Ubicación${donde ? `: ${donde}` : ""} https://www.google.com/maps/search/?api=1&query=${adj.lat},${adj.lng}]`);
    } else if (it.texto) partes.push(it.texto);
    if (it.tipo === "audio" && it.transcripcion) partes.push(`(dice: «${it.transcripcion}»)`);
    if (it.estado === "error") partes.push("(no le llegó)");
    out.push(`${hora(it.momento)} *${quienEscribio(it, cliente)}:* ${partes.join(" ")}`);
  }
  return out.join("\n").trim() + "\n";
}
