"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, FileText, Hand, Loader2, Pencil, RotateCw, Send, Trash2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { avisoVentana, type AvisoVentana } from "@/lib/clientes/ventana";
import type { CharlaListada } from "@/lib/clientes/vista";
import type { CorreccionAlquilerPedida, CorreccionPedida, TarjetaAprobacion, TarjetasCharla, VistaCorreccion } from "@/lib/clientes/vista-aprobacion";
import { ErrorPedido, urlPdfVistaPrevia, useAprobaciones, useDecidir, useVistaCorreccion, useVistaCorreccionAlquiler, type PedidoTarjeta } from "@/hooks/use-clientes-whatsapp";
import { Pastilla, PastillaGamaAlta } from "./pastillas";

// La tarjeta de aprobación (paso 6, docs/sofia/crm-propuesta.md §7 y la maqueta
// docs/sofia/crm-maqueta.html): lo que Sofía dejó esperando el botón de una persona.
//
//   · Precio (bandeja fácil): «Esto es lo que le va a llegar a Marcela»: el mensaje exacto, el
//     PDF (vista previa), los renglones del motor, «Por qué es fácil», la pareja y la ventana.
//     Aprobar y mandar / Corregir / No mandar · Lo tomo yo. Al aprobar, el servidor vuelve a
//     calcular: si cambió el monto, no manda y lo muestra.
//   · Técnico: la pareja propuesta y la regla que la eligió. Confirmar / Elegir otra.
//   · Texto bloqueado: lo que Sofía quiso decir y por qué lo frenó el filtro. Editar y mandar /
//     Descartar.
//   · Alquiler simple que cotizó Tomás (carril «alquiler», docs/sofia/alquiler-simple-propuesta.md):
//     el mensaje exacto (un solo total por 30 días + IVA), el pedido, el armado (destacado si la
//     plataforma va en un peldaño o no llega cómodo al techo), las líneas de la orden, el flete o
//     el retiro en el depósito, la entrega, la vendedora (siempre Tamara) y las alertas. Aprobar y mandar / Corregir (total, cantidades, fecha o texto) / Lo tomo yo.
//
// Todo lo decide el servidor, una sola vez: si otro tocó antes, se lee «Ya lo aprobó Sandra».

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
const ml = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

const TIPOS_CORRECCION: { id: CorreccionPedida["tipo"]; etiqueta: string }[] = [
  { id: "metros", etiqueta: "Metros" },
  { id: "piezas", etiqueta: "Piezas" },
  { id: "precio", etiqueta: "Precio" },
  { id: "texto", etiqueta: "Texto" },
  { id: "otro", etiqueta: "Otro" },
];

function Aviso({ tono, children, className }: { tono: "ambar" | "rojo" | "neutro" | "verde"; children: React.ReactNode; className?: string }) {
  const t = {
    ambar: "border-hd-ambar/40 bg-hd-ambar-bg text-hd-ambar",
    rojo: "border-hd-rojo/40 bg-hd-rojo-bg text-hd-rojo",
    neutro: "border-border bg-muted/50 text-muted-foreground",
    verde: "border-hd-verde/40 bg-hd-verde/10 text-hd-verde",
  }[tono];
  return <div className={cn("rounded-lg border px-3 py-2 text-[13.5px] leading-snug", t, className)}>{children}</div>;
}

function Burbuja({ texto }: { texto: string }) {
  return <div className="max-w-full rounded-xl rounded-tl-sm bg-background px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm">{texto}</div>;
}

function LineaVentana({ v }: { v: AvisoVentana }) {
  if (v.nivel === "ok") return <p className="text-[13px] text-muted-foreground tabular-nums">{v.texto}</p>;
  return <Aviso tono={v.nivel === "cerrada" ? "rojo" : "ambar"}>{v.texto}</Aviso>;
}

/** Quién sigue la charla después de decidir. Con Sofía apagada, siempre una persona. */
function ElegirDespues({ valor, onCambio, iaActiva }: { valor: "sofia" | "persona"; onCambio: (v: "sofia" | "persona") => void; iaActiva: boolean }) {
  if (!iaActiva) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]" role="radiogroup" aria-label="Después, quién sigue la charla">
      <span className="text-muted-foreground">Después:</span>
      {(["sofia", "persona"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onCambio(v)}
          className={cn("h-8 rounded-full border px-3", valor === v ? "border-hd-boton bg-hd-boton/10 text-hd-boton" : "border-border text-muted-foreground")}
        >
          {v === "sofia" ? "Sigue Tomás" : "Queda con vos"}
        </button>
      ))}
    </div>
  );
}

function errorDe(e: ErrorPedido): string {
  return e.message;
}

// ── El conjunto de la charla ───────────────────────────────────────────────────────────

export function TarjetasAprobacion({ charla, ahora, puedeEditar }: { charla: CharlaListada; ahora: number; puedeEditar: boolean }) {
  const q = useAprobaciones(charla.id);
  const d = q.data;
  if (!d?.tarjetas.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-3" id="tarjetas">
      {d.tarjetas.map((t) => (
        <Tarjeta key={t.id} t={t} charla={charla} ahora={ahora} puedeEditar={puedeEditar} datos={d} />
      ))}
    </div>
  );
}

function Tarjeta(p: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  if (p.t.precio) return <TarjetaPrecio {...p} />;
  if (p.t.tecnico) return <TarjetaTecnico {...p} />;
  if (p.t.bloqueado) return <TarjetaBloqueado {...p} />;
  if (p.t.carril === "alquiler") return <TarjetaAlquilerSimple {...p} />;
  return <TarjetaSimple {...p} />;
}

function Marco({ titulo, t, charla, tono = "ambar", children, pie }: { titulo: string; t: TarjetaAprobacion; charla?: CharlaListada; tono?: "ambar" | "rojo"; children: React.ReactNode; pie?: React.ReactNode }) {
  const estado =
    t.estado === "pendiente" ? "Espera tu OK"
    : t.estado === "ejecutando" ? "Guardando…"
    : t.estado === "error" ? "Falló: no salió"
    : t.estado === "falta_plantilla" ? "Aprobada, falta la plantilla"
    : t.estado;
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", tono === "ambar" ? "border-hd-ambar/50" : "border-hd-rojo/50")} aria-label={titulo}>
      <header className={cn("flex flex-wrap items-center gap-2 px-3 py-2", tono === "ambar" ? "bg-hd-ambar-bg" : "bg-hd-rojo-bg")}>
        <h3 className="min-w-0 flex-1 text-[14.5px] font-semibold">{titulo}</h3>
        <Pastilla tono={t.estado === "error" ? "rojo" : "ambar"}>{estado}</Pastilla>
        <span className="font-mono text-[12px] text-muted-foreground">#{t.numero}</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {charla && (charla.tarea || charla.segmento) && (
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
            <PastillaGamaAlta segmento={charla.segmento} />
            {charla.tarea && <span><span className="text-muted-foreground">Trabajo del cliente:</span> {charla.tarea}</span>}
          </p>
        )}
        {children}
      </div>
      {pie && <footer className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">{pie}</footer>}
    </section>
  );
}

/** Lo que quedó a medio camino: guardando, con error (Reintentar) o falta la plantilla. */
function EstadoIntermedio({ t, charlaId, ventanaAbierta, puedeEditar }: { t: TarjetaAprobacion; charlaId: string; ventanaAbierta: boolean; puedeEditar: boolean }) {
  const decidir = useDecidir(charlaId);
  const reintentar = () =>
    decidir.mutate(
      { aprobacionId: t.id, pedido: { accion: "reintentar" } },
      { onSuccess: (r) => toast.success(r.estado === "falta_plantilla" ? "Quedó en Odoo: falta la plantilla" : "Listo, salió", { description: r.avisos.join(" · ") || undefined }), onError: (e) => toast.error(errorDe(e)) },
    );
  if (t.estado === "ejecutando" && !t.colgada) {
    return <Aviso tono="neutro"><Loader2 className="mr-1.5 inline size-4 animate-spin" />Aprobado por {t.decididoPor ?? "alguien"}. Guardando en Odoo y mandando…</Aviso>;
  }
  if (t.estado === "error" || t.colgada) {
    return (
      <Aviso tono="rojo" className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1"><b>No salió.</b> {t.colgada ? "Se cortó mientras se guardaba: revisá Odoo; reintentar no duplica la orden." : t.error ?? "Algo falló."} {t.odooVenta ? `Ya está en Odoo (${t.odooVenta.nombre}).` : "Al cliente no le llegó nada."}</span>
        {puedeEditar && (
          <Button variant="outline" className="h-10" onClick={reintentar} disabled={decidir.isPending}>
            {decidir.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />} Reintentar
          </Button>
        )}
      </Aviso>
    );
  }
  if (t.estado === "falta_plantilla") {
    return (
      <Aviso tono="ambar" className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <b>Aprobada por {t.decididoPor ?? "alguien"}, falta la plantilla.</b> Está en Odoo{t.odooVenta ? ` (${t.odooVenta.nombre})` : ""}, pero la ventana de 24 h estaba cerrada y la plantilla «Tu presupuesto está listo» todavía no existe en Meta.
          {ventanaAbierta ? " El cliente volvió a escribir: ya se puede mandar." : " Sale cuando el cliente vuelva a escribir."}
        </span>
        {puedeEditar && ventanaAbierta && (
          <Button className="h-10 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={reintentar} disabled={decidir.isPending}>
            {decidir.isPending ? <Loader2 className="animate-spin" /> : <Send />} Mandar ahora
          </Button>
        )}
      </Aviso>
    );
  }
  return null;
}

// ── Precio ─────────────────────────────────────────────────────────────────────────────

function TarjetaPrecio({ t, charla, ahora, puedeEditar, datos }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const p = t.precio!;
  const decidir = useDecidir(charla.id);
  const vistaCorr = useVistaCorreccion(charla.id);
  const [despues, setDespues] = useState<"sofia" | "persona">(t.despuesPorDefecto);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [corr, setCorr] = useState<CorreccionPedida>({ tipo: "metros", motivo: "" });
  const [vista, setVista] = useState<{ correccion: CorreccionPedida; v: VistaCorreccion } | null>(null);
  const [preguntarVentana, setPreguntarVentana] = useState(false);
  const [tomando, setTomando] = useState(false);
  const [motivoTomar, setMotivoTomar] = useState("");

  const v = avisoVentana(charla.ultimoEntranteAt, ahora);
  const pila = (charla.nombre ?? "").split(" ")[0] || "el cliente";
  const pendiente = t.estado === "pendiente";
  const habilitado = puedeEditar && pendiente && !decidir.isPending;
  const mensaje = vista?.v.mensaje ?? p.mensaje;

  const aprobar = (confirmarVentana = false) => {
    const pedido: PedidoTarjeta = { accion: "aprobar", montoVisto: vista?.v.neto ?? p.neto, correccion: vista?.correccion ?? null, confirmarVentana, despues };
    decidir.mutate(
      { aprobacionId: t.id, pedido },
      {
        onSuccess: (r) => {
          setPreguntarVentana(false);
          setVista(null);
          setCorrigiendo(false);
          if (r.estado === "falta_plantilla") toast.warning(`Guardado en Odoo${r.venta ? ` (${r.venta})` : ""}: falta la plantilla`, { description: r.avisos.join(" · ") });
          else toast.success(`Salió la cotización #${t.numero}${r.venta ? ` · ${r.venta}` : ""}`, { description: r.avisos.join(" · ") || undefined });
        },
        onError: (e) => {
          if (e.codigo === "ventana_por_vencer") return setPreguntarVentana(true);
          if (e.codigo === "cambio_monto") {
            setVista(null);
            return toast.warning("Cambió el monto: no se mandó nada", { description: e.message, duration: 10_000 });
          }
          toast.error(errorDe(e), { duration: 10_000 });
        },
      },
    );
  };

  const recalcular = () =>
    vistaCorr.mutate(
      { aprobacionId: t.id, correccion: corr.tipo === "texto" ? { ...corr, texto: corr.texto ?? p.mensaje } : corr },
      { onSuccess: (r) => setVista({ correccion: corr.tipo === "texto" ? { ...corr, texto: corr.texto ?? p.mensaje } : corr, v: r }), onError: (e) => toast.error(e.message) },
    );

  const tomar = () =>
    decidir.mutate(
      { aprobacionId: t.id, pedido: { accion: "tomar", motivo: motivoTomar.trim() || undefined } },
      { onSuccess: () => toast.success("No se mandó: la charla queda con vos"), onError: (e) => toast.error(errorDe(e)) },
    );

  const renglones = vista?.v.renglones ?? p.renglones;
  const base = renglones.filter((r) => r.seccion === "base");
  const opcionales = renglones.filter((r) => r.seccion !== "base");

  return (
    <Marco
      titulo={`Esto es lo que le va a llegar a ${pila}`}
      t={t}
      charla={charla}
      pie={
        pendiente && puedeEditar ? (
          <>
            <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => aprobar(false)} disabled={!habilitado || p.bloqueos.length > 0 || (!!vista && vista.v.bloqueos.length > 0)}>
              {decidir.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {v.nivel === "cerrada" ? "Aprobar (sale con plantilla)" : vista ? "Aprobar la corrección y mandar" : "Aprobar y mandar"}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setCorrigiendo((x) => !x)} disabled={!habilitado}>
              <Pencil /> Corregir
            </Button>
            <Button variant="ghost" className="h-11 text-hd-rojo" onClick={() => setTomando((x) => !x)} disabled={!habilitado}>
              <Hand /> No mandar · Lo tomo yo
            </Button>
          </>
        ) : undefined
      }
    >
      <EstadoIntermedio t={t} charlaId={charla.id} ventanaAbierta={v.nivel !== "cerrada"} puedeEditar={puedeEditar} />
      {p.cambioDesdeSofia && p.montoPropuesto !== null && (
        <Aviso tono="ambar">Cambió la tarifa desde que Tomás lo armó: <s>{pesos(p.montoPropuesto)}</s> → <b>{pesos(p.neto)} + IVA</b>. Se manda el de hoy.</Aviso>
      )}
      {vista && (
        <Aviso tono="ambar">
          Corregido ({TIPOS_CORRECCION.find((x) => x.id === vista.correccion.tipo)?.etiqueta.toLowerCase()}):{" "}
          {vista.v.neto !== vista.v.netoAntes ? <><s>{pesos(vista.v.netoAntes)}</s> → <b>{pesos(vista.v.neto)} + IVA</b> (total {pesos(vista.v.total)}).</> : "los números no cambian."}{" "}
          {vista.v.cortaRacha ? `Al aprobar, la racha vuelve a 0 de ${datos.racha.meta}.` : "No corta la racha."}
          {vista.v.bloqueos.length > 0 && <span className="block text-hd-rojo">No se puede mandar así: {vista.v.bloqueos.join(" · ")}</span>}
          <button type="button" className="ml-2 underline" onClick={() => setVista(null)}>Deshacer</button>
        </Aviso>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{v.nivel === "cerrada" ? "Lo que va a salir (cuando se pueda)" : "El mensaje exacto"}</h4>
          <div className="flex flex-col gap-2 rounded-xl bg-[#e6ddd4] p-2.5 dark:bg-muted">
            <Burbuja texto={mensaje} />
            <a
              href={urlPdfVistaPrevia(charla.id, t.id, vista?.correccion ?? null)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-xl bg-background px-3 py-2 text-[14px] shadow-sm hover:underline"
            >
              <FileText className="size-5 shrink-0 text-hd-rojo" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">Presupuesto (PDF)</span>
                <span className="block text-[12px] text-muted-foreground">Ver la vista previa · el número lo pone Odoo al aprobar</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Renglones del motor</h4>
            <table className="w-full text-[13.5px] tabular-nums">
              <tbody>
                {base.map((r) => (
                  <tr key={r.id} className="border-b border-border/60"><td className="py-1 pr-2">{r.descripcion}</td><td className="py-1 text-right whitespace-nowrap">{pesos(r.importe)}</td></tr>
                ))}
                <tr><td className="py-1 pr-2 font-semibold">Neto</td><td className="py-1 text-right font-semibold whitespace-nowrap">{pesos(vista?.v.neto ?? p.neto)} + IVA</td></tr>
                <tr><td className="py-1 pr-2 text-muted-foreground">Total con IVA</td><td className="py-1 text-right whitespace-nowrap">{pesos(vista?.v.total ?? p.total)}</td></tr>
                {p.renovacion && !vista && (
                  <tr><td className="py-1 pr-2 text-muted-foreground">Renovación mensual ({p.renovacion.pct} %)</td><td className="py-1 text-right whitespace-nowrap">{pesos(p.renovacion.monto)} + IVA</td></tr>
                )}
                {opcionales.length > 0 && <tr><th colSpan={2} className="pt-2 text-left text-[12px] font-medium text-muted-foreground">Opcionales, aparte (en el PDF, no en la orden)</th></tr>}
                {opcionales.map((r) => (
                  <tr key={r.id} className="text-muted-foreground"><td className="py-0.5 pr-2">{r.descripcion.split(" — ")[0]}</td><td className="py-0.5 text-right whitespace-nowrap">{pesos(r.importe)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{p.facil ? "Por qué es fácil" : "Fácil el trabajo, no el cliente"}</h4>
            <ul className="flex flex-col gap-0.5 text-[13.5px]">
              {p.motivos.map((m, i) => (
                <li key={i} className={cn("flex gap-1.5", m.ok ? "" : "text-hd-rojo")}>
                  {m.ok ? <Check className="mt-0.5 size-4 shrink-0 text-hd-verde" /> : <X className="mt-0.5 size-4 shrink-0" />} {m.texto}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13.5px]">
            <span className="text-muted-foreground">Pareja: </span>
            {p.pareja?.asistente || p.pareja?.tecnico ? `${[p.pareja.asistente, p.pareja.tecnico].filter(Boolean).join(" con ")} — ${p.pareja.motivo}. Se confirma con el mismo botón.` : "sin pareja propuesta"}
          </p>
          <LineaVentana v={v} />
          {p.tarifaVieja && <Aviso tono="ambar">Tarifa vigente desde {p.tarifaVigenteDesde?.split("-").reverse().join("/")}: tiene más de 45 días, revisá si sigue.</Aviso>}
          {p.sinCuit && <Aviso tono="neutro">El cliente no dio CUIT: el cliente se da de alta en Odoo sin CUIT, con el aviso en la nota (completarlo antes de facturar).</Aviso>}
          {[...p.problemas, ...p.bloqueos].map((x) => <Aviso key={x} tono={p.bloqueos.includes(x) ? "rojo" : "ambar"}>{x}</Aviso>)}
        </div>
      </div>

      {corrigiendo && pendiente && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <b className="text-[14px]">Corregir: ¿qué cambia?</b>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué cambia">
            {TIPOS_CORRECCION.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={corr.tipo === x.id}
                onClick={() => setCorr({ tipo: x.id, motivo: corr.motivo, ...(x.id === "texto" ? { texto: mensaje } : {}) })}
                className={cn("h-9 rounded-full border px-3 text-[13.5px]", corr.tipo === x.id ? "border-hd-boton bg-hd-boton/10 text-hd-boton" : "border-border")}
              >
                {x.etiqueta}
              </button>
            ))}
          </div>
          {corr.tipo === "metros" && (
            <label className="flex flex-col gap-1 text-[13px]">Metros lineales (ahora {p.metros !== null ? ml(p.metros) : "—"})
              <input inputMode="decimal" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.metros ?? ""} onChange={(e) => setCorr({ ...corr, metros: Number(e.target.value.replace(",", ".")) || undefined })} placeholder="11" />
            </label>
          )}
          {corr.tipo === "precio" && (
            <label className="flex flex-col gap-1 text-[13px]">Precio por m.l., sin IVA (tarifa {pesos(p.tarifaMl)})
              <input inputMode="numeric" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.precioMl ?? ""} onChange={(e) => setCorr({ ...corr, precioMl: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="120000" />
            </label>
          )}
          {corr.tipo === "piezas" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {(["concertina", "gestoria"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-[13px]">{k === "concertina" ? "Concertina" : "Gestoría del permiso"}
                  <select className="h-11 rounded-md border border-input bg-background px-2 text-[15px]" value={corr[k] ?? ""} onChange={(e) => setCorr({ ...corr, [k]: (e.target.value || undefined) as CorreccionPedida["concertina"] })}>
                    <option value="">Sin cambios</option>
                    <option value="opcional">Opcional (aparte)</option>
                    <option value="base">Incluida en el precio</option>
                    <option value="no">No va</option>
                  </select>
                </label>
              ))}
            </div>
          )}
          {corr.tipo === "texto" && (
            <label className="flex flex-col gap-1 text-[13px]">El texto que le llega
              <textarea rows={7} className="rounded-md border border-input bg-background px-3 py-2 text-[15px]" value={corr.texto ?? mensaje} onChange={(e) => setCorr({ ...corr, texto: e.target.value })} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[13px]">Motivo (obligatorio: lo lee el auditor y va a la nota de Odoo)
            <input className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.motivo} onChange={(e) => setCorr({ ...corr, motivo: e.target.value })} placeholder={corr.tipo === "metros" ? "Pasé por la obra: va sólo por 11 m" : "Por qué cambia"} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" onClick={recalcular} disabled={vistaCorr.isPending || corr.motivo.trim().length < 3}>
              {vistaCorr.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />} Recalcular
            </Button>
            <Button variant="ghost" className="h-10" onClick={() => { setCorrigiendo(false); setVista(null); }}>Cancelar</Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">Metros, piezas y precio vuelven la racha de la etapa 2 a cero; texto y otro, no. Después de recalcular, revisá el mensaje y el PDF de arriba y aprobá.</p>
        </div>
      )}

      {preguntarVentana && (
        <Aviso tono="ambar" className="flex flex-wrap items-center gap-2" >
          <span className="min-w-0 flex-1" role="alert"><b>Se vence la ventana en menos de 2 h.</b> Si no la mandás ahora, después sólo sale con la plantilla.</span>
          <Button className="h-10 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => aprobar(true)} disabled={decidir.isPending}>Mandar ahora</Button>
          <Button variant="outline" className="h-10" onClick={() => setPreguntarVentana(false)}>Cancelar</Button>
        </Aviso>
      )}

      {tomando && pendiente && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-[14px]" value={motivoTomar} onChange={(e) => setMotivoTomar(e.target.value)} placeholder="Por qué no sale (opcional, para el auditor)" aria-label="Por qué no sale" />
          <Button variant="outline" className="h-10 text-hd-rojo" onClick={tomar} disabled={decidir.isPending}>No mandar y tomarla</Button>
        </div>
      )}

      {pendiente && puedeEditar && <ElegirDespues valor={despues} onCambio={setDespues} iaActiva={datos.iaActiva} />}
      {pendiente && <p className="text-[12.5px] text-muted-foreground">Racha para la etapa 2: {datos.racha.actual} de {datos.racha.meta} aprobados seguidos sin cambios de importe, metros o piezas.</p>}
    </Marco>
  );
}

// ── Técnico ────────────────────────────────────────────────────────────────────────────

function TarjetaTecnico({ t, charla, puedeEditar, datos }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const k = t.tecnico!;
  const decidir = useDecidir(charla.id);
  const [eligiendo, setEligiendo] = useState(false);
  const propuestaClave = `${k.propuesta?.tecnico ?? ""}|${k.propuesta?.asistente ?? ""}`;
  const [sel, setSel] = useState(propuestaClave);
  const [avisar, setAvisar] = useState(k.avisarPorDefecto);
  const [despues, setDespues] = useState<"sofia" | "persona">(t.despuesPorDefecto);
  const pendiente = t.estado === "pendiente";
  const fija = k.propuesta && !k.propuesta.requiereConfirmacion && (k.propuesta.regla === "ya_es_cliente" || k.propuesta.regla === "cuenta_socio");
  const elegida = k.opciones.find((o) => `${o.tecnico ?? ""}|${o.asistente ?? ""}` === sel) ?? null;
  const quien = (o: { tecnico: string | null; asistente: string | null }) => [o.asistente, o.tecnico].filter(Boolean).join(" con ");
  const texto = elegida?.textoCliente ?? k.textoCliente;

  const confirmar = () =>
    decidir.mutate(
      { aprobacionId: t.id, pedido: { accion: "confirmar", elegida: sel !== propuestaClave && elegida ? { tecnico: elegida.tecnico, asistente: elegida.asistente } : null, avisar, despues } },
      { onSuccess: (r) => toast.success("Asignación confirmada", { description: r.avisos.join(" · ") || undefined }), onError: (e) => toast.error(errorDe(e)) },
    );

  return (
    <Marco
      titulo="Asignar técnico"
      t={t}
      charla={charla}
      tono="rojo"
      pie={
        pendiente && puedeEditar ? (
          <>
            <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={confirmar} disabled={decidir.isPending || !elegida}>
              {decidir.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />} {sel === propuestaClave ? "Confirmar" : "Confirmar la elegida"}
            </Button>
            {!fija && <Button variant="outline" className="h-11" onClick={() => setEligiendo((x) => !x)}>Elegir otra</Button>}
          </>
        ) : undefined
      }
    >
      <p className="text-[14px] whitespace-pre-wrap">{k.resumen}</p>
      {k.disponibilidad && <p className="text-[13.5px] text-muted-foreground">Visita: {k.disponibilidad}</p>}
      {k.porQueNoFacil && k.porQueNoFacil.length > 0 && (
        <Aviso tono="ambar">
          <b className="text-foreground">Por qué no salió como bandeja fácil:</b>
          <ul className="mt-1 list-disc pl-5">
            {k.porQueNoFacil.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <span className="mt-1 block">Si te parece que era fácil, contámelo: así se ajusta la regla.</span>
        </Aviso>
      )}
      {k.propuesta ? (
        <Aviso tono="neutro">
          <b className="text-foreground">{quien(k.propuesta) || "Sin pareja"}</b> — {k.propuesta.motivo}
          {k.propuesta.tambienTrabajoCon.length > 0 && <span className="block">También trabajó con {k.propuesta.tambienTrabajoCon.join(", ")}.</span>}
          {fija && <span className="block">Ya es de esta pareja: nunca se pasa un cliente de una pareja a otra.</span>}
        </Aviso>
      ) : (
        <Aviso tono="ambar">El servidor no propuso pareja: elegí una.</Aviso>
      )}
      {(eligiendo || !k.propuesta) && pendiente && (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Pareja">
          {k.opciones.map((o) => {
            const clave = `${o.tecnico ?? ""}|${o.asistente ?? ""}`;
            return (
              <button
                key={clave}
                type="button"
                role="radio"
                aria-checked={sel === clave}
                onClick={() => setSel(clave)}
                className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[14px]", sel === clave ? "border-hd-boton bg-hd-boton/10" : "border-border")}
              >
                <span className={cn("size-4 shrink-0 rounded-full border-2", sel === clave ? "border-hd-boton bg-hd-boton" : "border-muted-foreground")} aria-hidden />
                <span className="flex-1">{o.tecnico ? `${o.tecnico} con ${o.asistente}` : `${o.asistente} sola (alquiler simple)`}</span>
                {o.siguienteEnTurno && <Pastilla tono="coral">Siguiente en el turno</Pastilla>}
                {clave === propuestaClave && <Pastilla tono="suave">Propuesta</Pastilla>}
              </button>
            );
          })}
          <p className="text-[12.5px] text-muted-foreground">El turno avanza sólo si se confirma la propuesta del turno.</p>
        </div>
      )}
      {pendiente && puedeEditar && texto && (
        <label className="flex items-start gap-2 text-[13.5px]">
          <input type="checkbox" className="mt-1 size-4" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
          <span>Avisarle al cliente: «{texto}»</span>
        </label>
      )}
      {pendiente && puedeEditar && <ElegirDespues valor={despues} onCambio={setDespues} iaActiva={datos.iaActiva} />}
      {pendiente && <p className="text-[12.5px] text-muted-foreground">Mientras no confirmes, el cliente sólo leyó «ya se lo paso al equipo».</p>}
    </Marco>
  );
}

// ── Texto bloqueado ────────────────────────────────────────────────────────────────────

function TarjetaBloqueado({ t, charla, ahora, puedeEditar, datos }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const k = t.bloqueado!;
  const decidir = useDecidir(charla.id);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(k.texto);
  const [despues, setDespues] = useState<"sofia" | "persona">(t.despuesPorDefecto);
  const v = avisoVentana(charla.ultimoEntranteAt, ahora);
  const pendiente = t.estado === "pendiente";
  const mandar = () =>
    decidir.mutate(
      { aprobacionId: t.id, pedido: { accion: "mandar", texto, despues } },
      { onSuccess: () => { setEditando(false); toast.success("Mandado"); }, onError: (e) => toast.error(errorDe(e)) },
    );
  const descartar = () =>
    decidir.mutate({ aprobacionId: t.id, pedido: { accion: "tomar" } }, { onSuccess: () => toast.success("Descartado: la charla queda con vos"), onError: (e) => toast.error(errorDe(e)) });

  return (
    <Marco
      titulo="Texto bloqueado por el filtro de salida"
      t={t}
      pie={
        pendiente && puedeEditar ? (
          <>
            {editando ? (
              <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={mandar} disabled={decidir.isPending || !texto.trim() || v.nivel === "cerrada"}>
                {decidir.isPending ? <Loader2 className="animate-spin" /> : <Send />} Mandar
              </Button>
            ) : (
              <Button variant="outline" className="h-11" onClick={() => setEditando(true)}><Pencil /> Editar y mandar</Button>
            )}
            <Button variant="ghost" className="h-11 text-hd-rojo" onClick={descartar} disabled={decidir.isPending}><Trash2 /> Descartar</Button>
          </>
        ) : undefined
      }
    >
      <Aviso tono="ambar"><AlertTriangle className="mr-1 inline size-4" /> {k.motivo ?? "El filtro lo frenó"}. Al cliente no le llegó nada.</Aviso>
      <div>
        <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Lo que quiso decir Tomás</h4>
        <div className="rounded-xl bg-sky-50 px-3 py-2 text-[14px] whitespace-pre-wrap dark:bg-sky-950/40">{k.texto}</div>
      </div>
      {k.hallazgos.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
          {k.hallazgos.map((h, i) => <li key={i}>· {h.motivo}: «{h.fragmento}»</li>)}
        </ul>
      )}
      {editando && (
        <label className="flex flex-col gap-1 text-[13px]">Lo que le llega (sale con tu nombre)
          <textarea rows={5} className="rounded-md border border-input bg-background px-3 py-2 text-[15px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      )}
      {v.nivel !== "ok" && <LineaVentana v={v} />}
      {pendiente && puedeEditar && editando && <ElegirDespues valor={despues} onCambio={setDespues} iaActiva={datos.iaActiva} />}
    </Marco>
  );
}

// ── Alquiler simple que cotizó Tomás (carril «alquiler») ───────────────────────────────

const TIPOS_CORRECCION_ALQUILER: { id: CorreccionAlquilerPedida["tipo"]; etiqueta: string }[] = [
  { id: "precio", etiqueta: "Total" },
  { id: "piezas", etiqueta: "Cantidades" },
  { id: "fecha", etiqueta: "Fecha" },
  { id: "texto", etiqueta: "Texto" },
];

/** Las horas para una franja de una hora: adentro de 8 a 12 y de 13 a 16 (§6). En el depósito no hay. */
const HORAS_FRANJA = [8, 8.5, 9, 9.5, 10, 10.5, 11, 13, 13.5, 14, 14.5, 15];
const textoHora = (h: number) => `${Math.floor(h)}:${h % 1 ? "30" : "00"}`;

function franjaClave(f: CorreccionAlquilerPedida["franja"] | undefined): string {
  if (!f) return "";
  return f.tipo === "hora" ? `hora-${f.desde}` : f.tipo;
}

function franjaDeClave(v: string): CorreccionAlquilerPedida["franja"] | undefined {
  if (v === "manana" || v === "tarde") return { tipo: v };
  if (v.startsWith("hora-")) return { tipo: "hora", desde: Number(v.slice(5)) };
  return undefined;
}

function TarjetaAlquilerSimple({ t, charla, ahora, puedeEditar, datos }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const decidir = useDecidir(charla.id);
  const vistaCorr = useVistaCorreccionAlquiler(charla.id);
  const [despues, setDespues] = useState<"sofia" | "persona">(t.despuesPorDefecto);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [corr, setCorr] = useState<CorreccionAlquilerPedida>({ tipo: "precio", motivo: "" });
  const [vista, setVista] = useState<{ correccion: CorreccionAlquilerPedida; v: VistaCorreccion } | null>(null);
  const [preguntarVentana, setPreguntarVentana] = useState(false);
  const [tomando, setTomando] = useState(false);
  const [motivoTomar, setMotivoTomar] = useState("");

  const v = avisoVentana(charla.ultimoEntranteAt, ahora);
  const pila = (charla.nombre ?? "").split(" ")[0] || "el cliente";
  const pendiente = t.estado === "pendiente";
  const k = vista?.v.alquiler ?? t.alquiler ?? null;
  const habilitado = puedeEditar && pendiente && !decidir.isPending;
  const puedeAprobar = habilitado && !!k && k.neto !== null && !!k.mensaje && k.bloqueos.length === 0;

  const aprobar = (confirmarVentana = false) => {
    if (!k || k.neto === null) return;
    const pedido: PedidoTarjeta = { accion: "aprobar", montoVisto: k.neto, correccionAlquiler: vista?.correccion ?? null, confirmarVentana, despues };
    decidir.mutate(
      { aprobacionId: t.id, pedido },
      {
        onSuccess: (r) => {
          setPreguntarVentana(false);
          setVista(null);
          setCorrigiendo(false);
          if (r.estado === "falta_plantilla") toast.warning(`Guardado en Odoo${r.venta ? ` (${r.venta})` : ""}: falta la plantilla`, { description: r.avisos.join(" · ") });
          else toast.success(`Salió el presupuesto del alquiler #${t.numero}${r.venta ? ` · ${r.venta}` : ""}`, { description: r.avisos.join(" · ") || undefined });
        },
        onError: (e) => {
          if (e.codigo === "ventana_por_vencer") return setPreguntarVentana(true);
          if (e.codigo === "cambio_monto") {
            setVista(null);
            return toast.warning("Cambió el total: no se mandó nada", { description: e.message, duration: 10_000 });
          }
          toast.error(errorDe(e), { duration: 10_000 });
        },
      },
    );
  };

  const correccionLista = (): CorreccionAlquilerPedida => (corr.tipo === "texto" ? { ...corr, texto: corr.texto ?? k?.mensaje ?? "" } : corr);
  const recalcular = () => {
    const c = correccionLista();
    vistaCorr.mutate({ aprobacionId: t.id, correccion: c }, { onSuccess: (r) => setVista({ correccion: c, v: r }), onError: (e) => toast.error(e.message) });
  };

  const tomar = () =>
    decidir.mutate(
      { aprobacionId: t.id, pedido: { accion: "tomar", motivo: motivoTomar.trim() || undefined } },
      { onSuccess: () => toast.success("No se mandó: la charla queda con vos"), onError: (e) => toast.error(errorDe(e)) },
    );

  return (
    <Marco
      titulo={`Alquiler simple: esto le va a llegar a ${pila}`}
      t={t}
      charla={charla}
      pie={
        pendiente && puedeEditar ? (
          <>
            <Button className="h-11 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => aprobar(false)} disabled={!puedeAprobar}>
              {decidir.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {v.nivel === "cerrada" ? "Aprobar (sale con plantilla)" : vista ? "Aprobar la corrección y mandar" : "Aprobar y mandar"}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setCorrigiendo((x) => !x)} disabled={!habilitado || !t.alquiler}>
              <Pencil /> Corregir
            </Button>
            <Button variant="ghost" className="h-11 text-hd-rojo" onClick={() => setTomando((x) => !x)} disabled={!habilitado}>
              <Hand /> No mandar · Lo tomo yo
            </Button>
          </>
        ) : undefined
      }
    >
      <EstadoIntermedio t={t} charlaId={charla.id} ventanaAbierta={v.nivel !== "cerrada"} puedeEditar={puedeEditar} />
      {!k ? (
        <Aviso tono="rojo">{t.error ?? "No se pudo recalcular el alquiler."} Si no se arregla, tomá la charla.</Aviso>
      ) : (
        <>
          {k.cambioDesdeTomas && k.montoPropuesto !== null && k.neto !== null && !vista && (
            <Aviso tono="ambar">Cambió desde que Tomás lo armó (parámetros, flete o fecha): <s>{pesos(k.montoPropuesto)}</s> → <b>{pesos(k.neto)} + IVA</b>. Se manda el de hoy.</Aviso>
          )}
          {vista && (
            <Aviso tono="ambar">
              Corregido ({TIPOS_CORRECCION_ALQUILER.find((x) => x.id === vista.correccion.tipo)?.etiqueta.toLowerCase()}):{" "}
              {vista.v.neto !== vista.v.netoAntes ? <><s>{pesos(vista.v.netoAntes)}</s> → <b>{pesos(vista.v.neto)} + IVA</b> (con IVA {pesos(vista.v.total)}).</> : "el total no cambia."}{" "}
              {vista.v.cortaRacha ? `Al aprobar, la racha del alquiler vuelve a 0.` : "No corta la racha del alquiler."}
              <button type="button" className="ml-2 underline" onClick={() => setVista(null)}>Deshacer</button>
            </Aviso>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{v.nivel === "cerrada" ? "Lo que va a salir (cuando se pueda)" : "El mensaje exacto"}</h4>
              <div className="flex flex-col gap-2 rounded-xl bg-[#e6ddd4] p-2.5 dark:bg-muted">
                {k.mensaje ? <Burbuja texto={k.mensaje} /> : <Aviso tono="rojo">No se puede armar el mensaje: mirá lo que bloquea.</Aviso>}
              </div>
              <p className="text-[12.5px] text-muted-foreground">Sale sólo el texto, sin PDF. La orden queda en Odoo en borrador; Tomás pide los documentos cuando el cliente acepta.</p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{k.deposito ? "Total por 30 días, retira en el depósito (sin flete)" : "Total por 30 días, con la entrega y el retiro"}</p>
                <p className="text-[22px] font-semibold tabular-nums">{k.neto !== null ? `${pesos(k.neto)} + IVA` : "—"}</p>
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {k.totalConIva !== null ? `Con IVA ${pesos(k.totalConIva)}` : null}
                  {k.porDia !== null ? ` · cada día de más ${pesos(k.porDia)} + IVA` : null}
                </p>
                {k.recargo && <p className="text-[13px] tabular-nums">Incluye el recargo de la franja {k.recargo.franja} ({k.recargo.pct} %): {pesos(k.recargo.monto)}.</p>}
              </div>

              {k.entrega && (
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
                  <span className="text-muted-foreground">{k.deposito ? "Retira en el depósito:" : "Entrega:"}</span> {k.entrega.texto}, {k.entrega.franja}
                  {k.entrega.hora && <Pastilla tono="ambar">Franja de una hora</Pastilla>}
                  {k.deposito && <Pastilla tono="suave">Sin flete · Cucha Cucha 2345</Pastilla>}
                  {k.direccion && <span className="text-muted-foreground">· {k.deposito ? `obra: ${k.direccion}` : k.direccion}</span>}
                </p>
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13.5px]">
                {k.pedido.map((d) => (
                  <div key={d.etiqueta} className="contents">
                    <dt className="text-muted-foreground">{d.etiqueta}</dt>
                    <dd>{d.valor}</dd>
                  </div>
                ))}
              </dl>

              {k.armado && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Armado{k.armado.torres > 1 ? ` · ${k.armado.torres} torres` : ""}</h4>
                  <p className="text-[13.5px]">{k.armado.texto}.</p>
                  {k.armado.peldano !== null || k.armado.noLlega ? (
                    <Aviso tono="ambar"><AlertTriangle className="mr-1 inline size-4" /><b>{k.armado.peldano !== null ? "Plataforma en un peldaño (alternativa):" : "No llega cómodo:"}</b> {k.armado.plataforma}.</Aviso>
                  ) : (
                    <p className="text-[13.5px] text-muted-foreground">{k.armado.plataforma}.</p>
                  )}
                  {!k.armado.barandaSeLleva && <Aviso tono="neutro">No quiere la baranda: no se lleva, pero se cobra igual.</Aviso>}
                  {k.armado.ajustes.length > 0 && (
                    <ul className="list-disc pl-5 text-[13px] text-muted-foreground">{k.armado.ajustes.map((x) => <li key={x}>{x}</li>)}</ul>
                  )}
                </div>
              )}

              {k.lineas.length > 0 && (
                <div>
                  <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Las líneas de la orden (al cliente le llega sólo el total)</h4>
                  <table className="w-full text-[13.5px] tabular-nums">
                    <tbody>
                      {k.lineas.map((l, i) => (
                        <tr key={i} className={cn("border-b border-border/60", l.tipo === "minimo" || l.tipo === "recargo" ? "text-hd-ambar" : "")}>
                          <td className="py-1 pr-2 text-right whitespace-nowrap">{l.cantidad}</td>
                          <td className="py-1 pr-2">{l.descripcion}</td>
                          <td className="py-1 text-right whitespace-nowrap">{pesos(l.importe)}</td>
                        </tr>
                      ))}
                      <tr><td /><td className="py-1 pr-2 font-semibold">Neto</td><td className="py-1 text-right font-semibold whitespace-nowrap">{k.neto !== null ? `${pesos(k.neto)} + IVA` : "—"}</td></tr>
                    </tbody>
                  </table>
                  {k.flete?.metodo && <p className="mt-1 text-[12.5px] text-muted-foreground">Método de envío de Odoo: {k.flete.metodo}.</p>}
                  {k.minimoOperativo > 0 && k.entraSinPagarMas.length > 0 && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">Es el mínimo: sin pagar más le entra {k.entraSinPagarMas.join(" o ")} (va en el mensaje).</p>
                  )}
                </div>
              )}

              <div>
                <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">{k.facil ? "Por qué es fácil" : "Lo que tenés que mirar"}</h4>
                <ul className="flex flex-col gap-0.5 text-[13.5px]">
                  {k.motivos.map((m, i) => (
                    <li key={i} className={cn("flex gap-1.5", m.ok ? "" : "text-hd-rojo")}>
                      {m.ok ? <Check className="mt-0.5 size-4 shrink-0 text-hd-verde" /> : <X className="mt-0.5 size-4 shrink-0" />} {m.texto}
                    </li>
                  ))}
                </ul>
              </div>
              {k.alertas.length > 0 && (
                <Aviso tono="ambar">Alertas en lo que escribió: {k.alertas.join(" · ")}</Aviso>
              )}
              <p className="text-[13.5px]">
                <span className="text-muted-foreground">Vendedora en Odoo: </span>
                <b>{k.vendedora}</b> (siempre, en los alquileres de Tomás).
                {(k.pareja?.asistente || k.pareja?.tecnico) && <span className="text-muted-foreground"> Asignación de la charla: {[k.pareja.asistente, k.pareja.tecnico].filter(Boolean).join(" con ")} — {k.pareja.motivo}.</span>}
              </p>
              <LineaVentana v={v} />
              {k.sinCuit && <Aviso tono="neutro">El cliente no dio CUIT: se da de alta en Odoo sin CUIT, con el aviso en la nota (completarlo antes de facturar).</Aviso>}
              {k.avisos.map((x) => <Aviso key={x} tono="ambar">{x}</Aviso>)}
              {k.bloqueos.map((x) => <Aviso key={x} tono="rojo">{x}</Aviso>)}
            </div>
          </div>
        </>
      )}

      {corrigiendo && pendiente && k && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <b className="text-[14px]">Corregir: ¿qué cambia?</b>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué cambia">
            {TIPOS_CORRECCION_ALQUILER.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={corr.tipo === x.id}
                onClick={() => setCorr({ tipo: x.id, motivo: corr.motivo, ...(x.id === "texto" ? { texto: k.mensaje ?? "" } : {}) })}
                className={cn("h-9 rounded-full border px-3 text-[13.5px]", corr.tipo === x.id ? "border-hd-boton bg-hd-boton/10 text-hd-boton" : "border-border")}
              >
                {x.etiqueta}
              </button>
            ))}
          </div>
          {corr.tipo === "precio" && (
            <label className="flex flex-col gap-1 text-[13px]">Total del servicio por 30 días, sin IVA{k.recargo ? " y sin el recargo (se recalcula)" : ""} (ahora {k.base !== null ? pesos(k.base) : "—"})
              <input inputMode="numeric" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.total ?? ""} onChange={(e) => setCorr({ ...corr, total: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="450000" />
            </label>
          )}
          {corr.tipo === "piezas" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px]">Módulos de alto por torre (ahora {k.armado?.modulosPorTorre ?? "—"})
                <input inputMode="numeric" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.modulosPorTorre ?? ""} onChange={(e) => setCorr({ ...corr, modulosPorTorre: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder={String(k.armado?.modulosPorTorre ?? 2)} />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">Torres (ahora {k.armado?.torres ?? "—"})
                <input inputMode="numeric" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.torres ?? ""} onChange={(e) => setCorr({ ...corr, torres: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder={String(k.armado?.torres ?? 1)} />
              </label>
            </div>
          )}
          {corr.tipo === "fecha" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px]">{k.deposito ? "Día en que retira" : "Día de entrega"} (ahora {k.entrega?.texto ?? "—"})
                <input type="date" className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.fecha ?? ""} onChange={(e) => setCorr({ ...corr, fecha: e.target.value || undefined })} />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">Franja (ahora {k.entrega?.franja ?? "—"})
                <select className="h-11 rounded-md border border-input bg-background px-2 text-[15px]" value={franjaClave(corr.franja)} onChange={(e) => setCorr({ ...corr, franja: franjaDeClave(e.target.value) })}>
                  <option value="">Sin cambios</option>
                  <option value="manana">{k.deposito ? "De 10 a 12 (en el depósito)" : "De 8 a 12"}</option>
                  <option value="tarde">{k.deposito ? "De 13 a 16 (en el depósito)" : "De 13 a 16 (no los sábados)"}</option>
                  {!k.deposito && HORAS_FRANJA.map((h) => <option key={h} value={`hora-${h}`}>Una hora: de {textoHora(h)} a {textoHora(h + 1)} (con recargo)</option>)}
                </select>
              </label>
            </div>
          )}
          {corr.tipo === "texto" && (
            <label className="flex flex-col gap-1 text-[13px]">El texto que le llega
              <textarea rows={9} className="rounded-md border border-input bg-background px-3 py-2 text-[15px]" value={corr.texto ?? k.mensaje ?? ""} onChange={(e) => setCorr({ ...corr, texto: e.target.value })} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-[13px]">Motivo (obligatorio: lo lee el auditor y va a la nota de Odoo)
            <input className="h-11 rounded-md border border-input bg-background px-3 text-[16px]" value={corr.motivo} onChange={(e) => setCorr({ ...corr, motivo: e.target.value })} placeholder={corr.tipo === "precio" ? "Cliente frecuente: se le respeta el precio anterior" : "Por qué cambia"} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" onClick={recalcular} disabled={vistaCorr.isPending || corr.motivo.trim().length < 3}>
              {vistaCorr.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />} Recalcular
            </Button>
            <Button variant="ghost" className="h-10" onClick={() => { setCorrigiendo(false); setVista(null); }}>Cancelar</Button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">El total y las cantidades cortan la racha del alquiler; la fecha y el texto, no. Las cantidades vuelven a pasar por las reglas (altura, cabeza, tope). Después de recalcular, revisá el mensaje de arriba y aprobá.</p>
        </div>
      )}

      {preguntarVentana && (
        <Aviso tono="ambar" className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1" role="alert"><b>Se vence la ventana en menos de 2 h.</b> Si no lo mandás ahora, después sólo sale con la plantilla.</span>
          <Button className="h-10 bg-hd-boton text-white hover:bg-hd-boton-hover" onClick={() => aprobar(true)} disabled={decidir.isPending}>Mandar ahora</Button>
          <Button variant="outline" className="h-10" onClick={() => setPreguntarVentana(false)}>Cancelar</Button>
        </Aviso>
      )}

      {tomando && pendiente && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-[14px]" value={motivoTomar} onChange={(e) => setMotivoTomar(e.target.value)} placeholder="Por qué no sale (opcional, para el auditor)" aria-label="Por qué no sale" />
          <Button variant="outline" className="h-10 text-hd-rojo" onClick={tomar} disabled={decidir.isPending}>No mandar y tomarla</Button>
        </div>
      )}

      {pendiente && puedeEditar && <ElegirDespues valor={despues} onCambio={setDespues} iaActiva={datos.iaActiva} />}
      {pendiente && datos.rachaAlquiler && (
        <p className="text-[12.5px] text-muted-foreground">Racha del alquiler: {datos.rachaAlquiler.actual} de {datos.rachaAlquiler.meta} aprobados seguidos sin cambios del total o las cantidades (aparte de la de la bandeja).</p>
      )}
    </Marco>
  );
}

// ── Alquiler simple (y lo demás) ───────────────────────────────────────────────────────

function TarjetaSimple({ t, charla, puedeEditar }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const s = t.simple;
  const decidir = useDecidir(charla.id);
  const pendiente = t.estado === "pendiente";
  return (
    <Marco
      titulo={s ? "Pedido de alquiler simple" : "Espera tu OK"}
      t={t}
      charla={charla}
      pie={
        pendiente && puedeEditar ? (
          <Button variant="outline" className="h-11" onClick={() => decidir.mutate({ aprobacionId: t.id, pedido: { accion: "tomar" } }, { onSuccess: () => toast.success("La charla queda con vos"), onError: (e) => toast.error(errorDe(e)) })} disabled={decidir.isPending}>
            <Hand /> Lo tomo yo
          </Button>
        ) : undefined
      }
    >
      <p className="text-[14px]">{t.resumen}</p>
      {s && (
        <>
          {s.piezas.length > 0 && <ul className="text-[13.5px]">{s.piezas.map((x, i) => <li key={i}>· {x.cantidad} × {x.descripcion}</li>)}</ul>}
          <p className="text-[13.5px] text-muted-foreground">{[s.dias ? `${s.dias} días` : null, s.entrega === "retira" ? "lo retira" : s.barrio ? `envío a ${s.barrio}` : null, s.notas].filter(Boolean).join(" · ")}</p>
          {s.alertas.map((a) => <Aviso key={a} tono="ambar">{a}</Aviso>)}
          <Aviso tono="neutro">El precio del alquiler simple lo pone una persona (Tamara) hasta que haya tarifa simple probada (§4): tomá la charla y mandale el presupuesto desde la app o desde el asistente comercial.</Aviso>
        </>
      )}
    </Marco>
  );
}
