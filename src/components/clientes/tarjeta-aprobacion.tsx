"use client";

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, FileText, Hand, Loader2, Pencil, RotateCw, Send, Trash2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { avisoVentana, type AvisoVentana } from "@/lib/clientes/ventana";
import type { CharlaListada } from "@/lib/clientes/vista";
import type { CorreccionPedida, TarjetaAprobacion, TarjetasCharla, VistaCorreccion } from "@/lib/clientes/vista-aprobacion";
import { ErrorPedido, urlPdfVistaPrevia, useAprobaciones, useDecidir, useVistaCorreccion, type PedidoTarjeta } from "@/hooks/use-clientes-whatsapp";
import { Pastilla } from "./pastillas";

// La tarjeta de aprobación (paso 6, docs/clientes/crm-propuesta.md §7 y la maqueta
// docs/clientes/crm-maqueta.html): lo que Sofía dejó esperando el botón de una persona.
//
//   · Precio (bandeja fácil): «Esto es lo que le va a llegar a Marcela»: el mensaje exacto, el
//     PDF (vista previa), los renglones del motor, «Por qué es fácil», la pareja y la ventana.
//     Aprobar y mandar / Corregir / No mandar · Lo tomo yo. Al aprobar, el servidor vuelve a
//     calcular: si cambió el monto, no manda y lo muestra.
//   · Técnico: la pareja propuesta y la regla que la eligió. Confirmar / Elegir otra.
//   · Texto bloqueado: lo que Sofía quiso decir y por qué lo frenó el filtro. Editar y mandar /
//     Descartar.
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
          {v === "sofia" ? "Sigue Sofía" : "Queda con vos"}
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
  return <TarjetaSimple {...p} />;
}

function Marco({ titulo, t, tono = "ambar", children, pie }: { titulo: string; t: TarjetaAprobacion; tono?: "ambar" | "rojo"; children: React.ReactNode; pie?: React.ReactNode }) {
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
      <div className="flex flex-col gap-3 p-3">{children}</div>
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
        <Aviso tono="ambar">Cambió la tarifa desde que Sofía lo armó: <s>{pesos(p.montoPropuesto)}</s> → <b>{pesos(p.neto)} + IVA</b>. Se manda el de hoy.</Aviso>
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
        <h4 className="mb-1 text-[12.5px] font-semibold tracking-wide text-muted-foreground uppercase">Lo que quiso decir Sofía</h4>
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

// ── Alquiler simple (y lo demás) ───────────────────────────────────────────────────────

function TarjetaSimple({ t, charla, puedeEditar }: { t: TarjetaAprobacion; charla: CharlaListada; ahora: number; puedeEditar: boolean; datos: TarjetasCharla }) {
  const s = t.simple;
  const decidir = useDecidir(charla.id);
  const pendiente = t.estado === "pendiente";
  return (
    <Marco
      titulo={s ? "Pedido de alquiler simple" : "Espera tu OK"}
      t={t}
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
