"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lote, Vecina } from "@/lib/catastro/caba";
import type { ClienteResumen } from "@/lib/odoo/comercial";
import type { Render } from "@/lib/parametros-cotizacion/tipos";
import type { Tarifas, Linea } from "@/lib/cotizador/tipos";
import { validarCuit } from "@/lib/cotizador/cuit";
import { CATEGORIAS_FACHADA, type CategoriaFachada } from "@/lib/cotizador/fachada";
import type { BorradorVista } from "@/lib/asistente/eventos";
import {
  categoriaParaPrecio, FORMAS_PAGO, idFila, productoParaConcepto, rangoCategoria, tarifaBandeja, type Formulario,
} from "@/lib/cotizador-rapido/formulario";
import { Aviso, Campo, Chip, Chips, Moneda, Numero, numeroTexto, pesos, Seccion, Texto, Tri } from "./campos";

export type Cambiar = (fn: (f: Formulario) => Formulario) => void;

export type EstadoCatastro =
  | { estado: "nada" }
  | { estado: "cargando" }
  | { estado: "vecinas"; direccion: string; vecinas: Vecina[] }
  | { estado: "error"; mensaje: string };

const confirmarIa = (f: Formulario, k: string): Formulario => (f.ia[k] ? { ...f, ia: { ...f.ia, [k]: { ...f.ia[k], deducido: false } } } : f);
const sinIa = (f: Formulario, k: string): Formulario => {
  if (!f.ia[k]) return f;
  const ia = { ...f.ia };
  delete ia[k];
  return { ...f, ia };
};

/** El renglón de una sección completa (Seccion → resumen): los datos que hay, separados por «·». */
const renglon = (...partes: (string | null | undefined | false)[]) => partes.filter((x): x is string => !!x && !!x.trim()).join(" · ") || undefined;
const nro = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

// ── Cliente ─────────────────────────────────────────────────────────────────────────────

export function SeccionCliente({ f, cambiar, buscar, alerta }: { f: Formulario; cambiar: Cambiar; buscar: (t: string) => Promise<ClienteResumen[]>; alerta: boolean }) {
  const c = f.cliente;
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ClienteResumen[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return;
    const id = setTimeout(() => {
      setBuscando(true);
      buscar(t).then(setRes).catch(() => setRes([])).finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(id);
  }, [q, buscar]);

  const poner = (k: keyof Formulario["cliente"], v: string) => cambiar((x) => sinIa({ ...x, cliente: { ...x.cliente, [k]: v } }, k));
  const cuit = c.cuit.trim() ? validarCuit(c.cuit) : null;

  if (c.partnerId) {
    return (
      <Seccion id="s-cliente" titulo="Cliente" alerta={alerta} resumen={renglon(c.razonSocial, c.cuit && `CUIT ${c.cuit}`, "ya es cliente")} extra={<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Ya es cliente en Odoo</span>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Cliente</p>
            <p className="truncate text-[15px] font-medium">{c.razonSocial}</p>
            <p className="truncate text-[13px] text-muted-foreground">{[c.cuit, c.celular, c.email].filter(Boolean).join(" · ")}</p>
          </div>
          <Campo id="cli-contacto" etiqueta="Dirigido a" marca={f.ia.contacto}>
            <Texto id="cli-contacto" valor={c.contacto} onCambiar={(v) => poner("contacto", v)} placeholder="Nombre de la persona" />
          </Campo>
        </div>
        <div>
          <button type="button" className="min-h-10 text-[14px] text-primary underline-offset-2 hover:underline" onClick={() => cambiar((x) => ({ ...x, cliente: { partnerId: null, razonSocial: "", contacto: "", celular: "", email: "", cuit: "", domicilio: "", domicilioObra: false } }))}>
            Cambiar de cliente
          </button>
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion id="s-cliente" titulo="Cliente" alerta={alerta} resumen={c.razonSocial.trim() ? renglon(c.razonSocial, c.cuit && `CUIT ${c.cuit}`, c.contacto !== c.razonSocial && c.contacto) : undefined} extra={c.razonSocial ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Nuevo: se da de alta al guardar</span> : undefined}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cli-buscar" className="text-[13px] font-medium text-muted-foreground">Buscar en Odoo</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id="cli-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, CUIT, mail o teléfono" autoComplete="off"
            className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        {res && q.trim().length >= 2 && (
          res.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {res.map((r) => (
                <li key={r.id}>
                  <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60"
                    onClick={() => { setQ(""); setRes(null); cambiar((x) => ({ ...x, cliente: { partnerId: r.id, razonSocial: r.nombre, contacto: x.cliente.contacto, celular: r.telefono ?? "", email: r.email ?? "", cuit: r.cuit ?? "", domicilio: r.direccion ?? "", domicilioObra: false } })); }}>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{r.nombre}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{[r.empresa, r.telefono, r.email].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{r.cuit ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted-foreground">No está en Odoo: completá los datos y se da de alta al guardar.</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="cli-razon" etiqueta="Razón social o nombre" marca={f.ia.razonSocial}>
          <Texto id="cli-razon" valor={c.razonSocial} onCambiar={(v) => poner("razonSocial", v)} />
        </Campo>
        <Campo id="cli-cuit" etiqueta="CUIT o DNI (puede quedar vacío)" marca={f.ia.cuit}
          extra={cuit?.valido ? <span className="text-[12px] text-emerald-600 dark:text-emerald-400">✓ válido</span> : null}>
          <Texto id="cli-cuit" valor={c.cuit} onCambiar={(v) => poner("cuit", v)} inputMode="numeric" placeholder="20-12345678-9" />
          {cuit && !cuit.valido && (
            <p className="text-[13px] text-destructive">
              {cuit.motivo}{" "}
              {cuit.propuesta && <Chip className="ml-1 min-h-8" onClick={() => poner("cuit", cuit.propuesta!.cuit)}>Usar {cuit.propuesta.cuit}</Chip>}
            </p>
          )}
        </Campo>
        <Campo id="cli-contacto" etiqueta="Contacto (dirigido a)" marca={f.ia.contacto}>
          <Texto id="cli-contacto" valor={c.contacto} onCambiar={(v) => poner("contacto", v)} />
        </Campo>
        <Campo id="cli-cel" etiqueta="Celular" marca={f.ia.celular}>
          <Texto id="cli-cel" valor={c.celular} onCambiar={(v) => poner("celular", v)} inputMode="tel" placeholder="11 5555-0123" />
        </Campo>
        <Campo id="cli-mail" etiqueta="Correo" marca={f.ia.email}>
          <Texto id="cli-mail" valor={c.email} onCambiar={(v) => poner("email", v)} inputMode="email" placeholder="nombre@empresa.com" />
        </Campo>
        <Campo id="cli-dom" etiqueta="Domicilio" marca={f.ia.domicilio}>
          <div className="flex gap-2">
            <Texto id="cli-dom" valor={c.domicilioObra ? "Igual que la obra" : c.domicilio} disabled={c.domicilioObra} onCambiar={(v) => poner("domicilio", v)} />
            <Chip activo={c.domicilioObra} onClick={() => cambiar((x) => ({ ...x, cliente: { ...x.cliente, domicilioObra: !x.cliente.domicilioObra } }))}>= obra</Chip>
          </div>
        </Campo>
      </div>
    </Seccion>
  );
}

// ── Obra y catastro ─────────────────────────────────────────────────────────────────────

const m = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m`;

export function loteVigente(b: BorradorVista | null, direccion: string): Lote | null {
  const lote = b?.datos.obra.lote ?? null;
  return lote && lote.direccionConsultada.trim() === direccion.trim() ? lote : null;
}

export function SeccionObra({ f, cambiar, borrador, catastro, onDireccion, onVecina, onFrente, alerta }: {
  f: Formulario; cambiar: Cambiar; borrador: BorradorVista | null; catastro: EstadoCatastro; alerta: boolean;
  onDireccion: () => void; onVecina: (smp: string) => void; onFrente: (metros: number, origen: string) => void;
}) {
  const lote = loteVigente(borrador, f.obra.direccion);
  const caras = lote ? (lote.caras.length ? lote.caras : lote.frenteCatastro ? [lote.frenteCatastro] : []) : [];
  const [frenteDeclarado, setFrenteDeclarado] = useState<number | null>(null);
  const [origen, setOrigen] = useState("medido en obra");
  const canal = borrador?.datos.conflictoCanal;
  const otroTecnico = canal?.resultado && /otro técnico/.test(canal.resultado);
  const enCaba = f.obra.enCaba !== false;

  // Elegir caras de una esquina: en bandeja suma los metros; en fachada son los frentes.
  const elegidas = f.tipo === "fachada" ? f.fachada.frentes : null;
  const usarCaras = (sel: number[]) => cambiar((x) => {
    const total = Math.round(sel.reduce((a, b) => a + b, 0) * 100) / 100;
    const esquina = lote?.esquina ? (sel.length === caras.length ? "las dos caras" : sel.length ? `sólo la cara de ${m(sel[0])}` : null) : x.obra.esquina;
    const y = { ...x, obra: { ...x.obra, esquina } };
    return x.tipo === "fachada"
      ? { ...y, fachada: { ...y.fachada, frentes: sel } }
      : x.tipo === "bandeja" ? sinIa({ ...y, bandeja: { ...y.bandeja, metros: total || null } }, "metros") : y;
  });

  return (
    <Seccion id="s-obra" titulo="Obra" alerta={alerta} resumen={f.obra.direccion.trim() ? renglon(f.obra.direccion, f.obra.enCaba === true ? "CABA" : f.obra.enCaba === false ? "Provincia" : null, f.obra.esquina && `esquina: ${f.obra.esquina}`) : undefined}
      extra={<Chips opciones={[{ v: true, t: "CABA" }, { v: false, t: "Provincia" }]} valor={enCaba} onCambiar={(v) => cambiar((x) => ({ ...x, obra: { ...x.obra, enCaba: v } }))} />}>
      <Campo id="obra-dir" etiqueta="Dirección de la obra (calle y altura)" marca={f.ia.direccion}>
        <Texto id="obra-dir" valor={f.obra.direccion} placeholder="Florida 375" onCambiar={(v) => cambiar((x) => sinIa({ ...x, obra: { ...x.obra, direccion: v } }, "direccion"))} onSalir={onDireccion} />
      </Campo>

      {!f.obra.direccion.trim() ? (
        <p className="text-[13px] text-muted-foreground">Al salir del campo se verifica el frente en el catastro y si otro vendedor ya cotizó esa dirección.</p>
      ) : !enCaba ? (
        <Aviso tono="gris">Fuera de CABA no hay catastro: el frente lo da el cliente. La gestoría del permiso no aplica.</Aviso>
      ) : catastro.estado === "cargando" ? (
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verificando el frente en el catastro…</p>
      ) : catastro.estado === "vecinas" ? (
        <Aviso tono="ambar">
          <span><b>{catastro.direccion} no es una puerta oficial.</b> ¿Cuál de estas parcelas es la obra?</span>
          <div className="flex flex-wrap gap-2">
            {catastro.vecinas.map((v) => (
              <button key={v.smp} type="button" onClick={() => onVecina(v.smp)} className="min-h-11 rounded-lg border border-amber-500/50 bg-background px-3 text-left text-[14px] text-foreground hover:bg-muted">
                <b>{v.direccion}</b>{v.frenteCatastro ? ` · ${m(v.frenteCatastro)} de frente` : ""}
              </button>
            ))}
          </div>
        </Aviso>
      ) : catastro.estado === "error" ? (
        <Aviso tono="ambar">
          <span>{catastro.mensaje}</span>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={onDireccion} className="min-h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground hover:bg-muted">Probar de nuevo</button>
            <FrenteDeclarado valor={frenteDeclarado} setValor={setFrenteDeclarado} origen={origen} setOrigen={setOrigen} onUsar={onFrente} />
          </div>
        </Aviso>
      ) : lote ? (
        caras.length ? (
          <Aviso tono={lote.esquina ? "ambar" : "verde"}>
            <span>
              {lote.fuente === "vendedor" ? `Frente declarado: ${m(caras[0])} (${lote.nota ?? "sin detalle"}).` : `✓ Catastro: ${lote.esquina ? "esquina, " : ""}${caras.length > 1 ? `${caras.map(m).join(" + ")}` : `frente ${m(caras[0])}`} · parcela ${lote.smp}${lote.direccionOficial ? ` (${lote.direccionOficial})` : ""}.`}
              {lote.esquina && " Elegí qué caras cubre:"}
            </span>
            {lote.esquina || f.tipo === "fachada" ? (
              <div className="flex flex-wrap gap-2">
                {caras.map((cara, i) => {
                  const on = elegidas ? elegidas.some((x) => Math.abs(x - cara) < 0.01) : !!f.obra.esquina && (f.obra.esquina === "las dos caras" || f.obra.esquina.includes(m(cara)));
                  return (
                    <Chip key={i} activo={on} className="bg-background text-foreground" onClick={() => {
                      const actuales = elegidas ?? (f.obra.esquina === "las dos caras" ? caras : caras.filter((c2) => f.obra.esquina?.includes(m(c2))));
                      usarCaras(on ? actuales.filter((x) => Math.abs(x - cara) >= 0.01) : [...actuales, cara]);
                    }}>
                      {lote.calles[i] ? `${lote.calles[i]} · ` : ""}{m(cara)}
                    </Chip>
                  );
                })}
                {lote.esquina && <Chip className="bg-background text-foreground" activo={f.obra.esquina === "las dos caras"} onClick={() => usarCaras(caras)}>Las dos</Chip>}
              </div>
            ) : f.tipo === "bandeja" && !f.bandeja.metros ? (
              <div><Chip className="bg-background text-foreground" onClick={() => usarCaras(caras)}>Usar {m(caras[0])} (todo el frente)</Chip></div>
            ) : null}
          </Aviso>
        ) : (
          <Aviso tono="ambar">
            <span>El catastro tiene la parcela {lote.smp} pero no la medida del frente.</span>
            <FrenteDeclarado valor={frenteDeclarado} setValor={setFrenteDeclarado} origen={origen} setOrigen={setOrigen} onUsar={onFrente} />
          </Aviso>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          Falta verificar el frente.
          <button type="button" onClick={onDireccion} className="min-h-10 rounded-lg border border-border px-3 text-[14px] text-foreground hover:bg-muted">Verificar ahora</button>
        </div>
      )}

      {canal?.revisado && canal.resultado && (
        <p className={cn("text-[13px]", otroTecnico ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {otroTecnico ? "⚠ " : "✓ "}Conflicto de canal: {canal.resultado}
        </p>
      )}
    </Seccion>
  );
}

function FrenteDeclarado({ valor, setValor, origen, setOrigen, onUsar }: { valor: number | null; setValor: (n: number | null) => void; origen: string; setOrigen: (s: string) => void; onUsar: (m: number, o: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-foreground">
      <div className="w-28"><Numero valor={valor} onCambiar={setValor} placeholder="Frente m" etiquetaAria="Frente en metros" /></div>
      <div className="w-48"><Texto id="frente-origen" valor={origen} onCambiar={setOrigen} placeholder="De dónde sale" /></div>
      <button type="button" disabled={!valor || !origen.trim()} onClick={() => valor && onUsar(valor, origen)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-[14px] hover:bg-muted disabled:opacity-50">Usar esta medida</button>
    </div>
  );
}

// ── El tipo: bandeja, fachada o desglosado ──────────────────────────────────────────────

const TIPOS: { v: Formulario["tipo"]; t: string }[] = [{ v: "bandeja", t: "Bandeja" }, { v: "fachada", t: "Fachada" }, { v: "desglosado", t: "Desglosado" }];

/** El renglón de la sección del tipo cuando está completa. */
function resumenTipo(f: Formulario): string | undefined {
  if (f.tipo === "bandeja") return f.bandeja.metros ? renglon(`${nro(f.bandeja.metros)} m.l.`, `${nro(f.bandeja.altura)} m de alto`) : undefined;
  if (f.tipo === "fachada") {
    const frente = f.fachada.frentes.reduce((a, b) => a + b, 0);
    return frente && f.fachada.altura ? renglon(`${nro(frente)} m de frente`, `${nro(f.fachada.altura)} m de alto`) : undefined;
  }
  const n = f.desglose.filas.length;
  return n ? `${n} ${n === 1 ? "renglón" : "renglones"}` : undefined;
}

export function SeccionTipo({ f, cambiar, tarifas, borrador, alerta }: { f: Formulario; cambiar: Cambiar; tarifas: Tarifas; borrador: BorradorVista | null; alerta: boolean }) {
  const titulo = { bandeja: "Bandeja de protección · por m.l.", fachada: "Fachada · por m²", desglosado: "Desglosado · renglones con tus montos" }[f.tipo];
  return (
    <Seccion id="s-tipo" titulo={titulo} alerta={alerta} resumen={resumenTipo(f)} extra={<Chips opciones={TIPOS} valor={f.tipo} onCambiar={(v) => cambiar((x) => ({ ...x, tipo: v }))} />}>
      {f.tipo === "bandeja" ? <Bandeja f={f} cambiar={cambiar} tarifas={tarifas} borrador={borrador} />
        : f.tipo === "fachada" ? <Fachada f={f} cambiar={cambiar} tarifas={tarifas} />
          : <Desglose f={f} cambiar={cambiar} borrador={borrador} />}
    </Seccion>
  );
}

function Bandeja({ f, cambiar, tarifas, borrador }: { f: Formulario; cambiar: Cambiar; tarifas: Tarifas; borrador: BorradorVista | null }) {
  const b = f.bandeja;
  const tarifa = tarifaBandeja(b.altura, tarifas);
  const set = (k: keyof Formulario["bandeja"], v: unknown, ia?: string) => cambiar((x) => { const y = { ...x, bandeja: { ...x.bandeja, [k]: v } }; return ia ? sinIa(y, ia) : y; });
  const otra = ![3, 4, 6, 8].includes(b.altura);
  const precio = b.precioMl ?? (typeof tarifa === "number" ? tarifa : null);
  const desvio = !!b.precioMl && (typeof tarifa === "number" ? b.precioMl !== tarifa : tarifa ? b.precioMl < tarifa.min || b.precioMl > tarifa.max : false);
  const lote = loteVigente(borrador, f.obra.direccion);
  const aviso = borrador?.resultado?.avisos.find((a) => a.codigo === "frente_mayor" || a.codigo === "frente_menor");
  const frente = lote ? (lote.caras.length ? lote.caras.reduce((a, x) => a + x, 0) : lote.frenteCatastro) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="b-metros" etiqueta="Metros lineales" marca={f.ia.metros} onConfirmar={() => cambiar((x) => confirmarIa(x, "metros"))}>
          <Numero id="b-metros" valor={b.metros} onCambiar={(v) => set("metros", v, "metros")} placeholder="Del catastro o los del cliente" deducido={f.ia.metros?.deducido} />
          {b.metros !== null && b.metros > 0 && b.metros < tarifas.bandeja.minimoMl && (
            <p className="text-[13px] text-amber-700 dark:text-amber-300">Mínimo {tarifas.bandeja.minimoMl} m.l.: se facturan {tarifas.bandeja.minimoMl}.</p>
          )}
        </Campo>
        <Campo etiqueta="Altura" marca={f.ia.alturaBandeja} onConfirmar={() => cambiar((x) => confirmarIa(x, "alturaBandeja"))}>
          <div className={cn("flex flex-wrap gap-1.5", f.ia.alturaBandeja?.deducido && "rounded-xl border border-dashed border-amber-500 p-1.5")}>
            {[3, 4, 6, 8].map((a) => <Chip key={a} activo={b.altura === a} onClick={() => cambiar((x) => sinIa({ ...x, bandeja: { ...x.bandeja, altura: a, precioMl: null } }, "alturaBandeja"))}>{a} m</Chip>)}
            <Chip activo={otra} onClick={() => cambiar((x) => sinIa({ ...x, bandeja: { ...x.bandeja, altura: 0, precioMl: null } }, "alturaBandeja"))}>Otra</Chip>
          </div>
          {otra && <div className="w-32"><Numero valor={b.altura || null} onCambiar={(v) => set("altura", v ?? 0)} placeholder="m" etiquetaAria="Altura en metros" /></div>}
        </Campo>
        <Campo id="b-precio" etiqueta="Precio por m.l. (sin IVA)" marca={f.ia.precioMl}>
          <Moneda id="b-precio" valor={precio} onCambiar={(v) => set("precioMl", v, "precioMl")} placeholder="Cargá el precio" />
          <p className="text-[13px] text-muted-foreground">
            {typeof tarifa === "number" ? `Lista: ${pesos(tarifa)} a ${b.altura} m` : tarifa ? `A ${b.altura} m no hay precio fijo: ${pesos(tarifa.min)} a ${pesos(tarifa.max)}` : "Sin tarifa para esta altura: cargá el precio"}
          </p>
          {tarifa && typeof tarifa !== "number" && (
            <Chips opciones={[tarifa.min, Math.round((tarifa.min + tarifa.max) / 2 / 5000) * 5000, tarifa.max].map((v) => ({ v, t: pesos(v) }))} valor={b.precioMl ?? -1} onCambiar={(v) => set("precioMl", v)} />
          )}
        </Campo>
        {(desvio || (!tarifa && !!b.precioMl)) && (
          <Campo id="b-motivo" etiqueta="Motivo del precio (va a la nota de la orden)">
            <Texto id="b-motivo" valor={b.motivoPrecio} onCambiar={(v) => set("motivoPrecio", v)} placeholder="Cliente frecuente, voladizo de balcón…" />
          </Campo>
        )}
      </div>
      {aviso && frente !== null && (
        <Aviso tono="ambar">
          <span>{aviso.texto}</span>
          <div className="flex flex-wrap gap-2">
            <Chip className="bg-background text-foreground" onClick={() => set("metros", frente, "metros")}>Usar el catastro · {m(frente)}</Chip>
          </div>
        </Aviso>
      )}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fila nombre="Concertina" detalle={`${tarifas.bandeja.concertinaPct} % del precio por m.l.`}><Tri valor={b.concertina} onCambiar={(v) => set("concertina", v)} /></Fila>
        <Fila nombre="Gestoría del permiso" detalle={f.obra.enCaba === false ? "no aplica fuera de CABA" : `${pesos(tarifas.complementarios.gestoriaCaba)} · CABA`}>
          <Tri valor={f.obra.enCaba === false ? "no" : b.gestoria} onCambiar={(v) => set("gestoria", v)} bloqueado={false} />
        </Fila>
      </div>
    </div>
  );
}

function Fachada({ f, cambiar, tarifas }: { f: Formulario; cambiar: Cambiar; tarifas: Tarifas }) {
  const x = f.fachada;
  const set = (patch: Partial<Formulario["fachada"]>, ia?: string) => cambiar((y) => { const z = { ...y, fachada: { ...y.fachada, ...patch } }; return ia ? sinIa(z, ia) : z; });
  const desarrollo = x.frentes.reduce((a, b) => a + b, 0);
  const sup = x.altura ? desarrollo * x.altura : 0;
  const rango = x.categoria ? rangoCategoria(x.categoria, tarifas) : null;
  const precio = x.precioM2 ?? (typeof rango === "number" ? rango : null);
  const fuera = !!x.precioM2 && !!rango && (typeof rango === "number" ? x.precioM2 !== rango : x.precioM2 < rango.min || x.precioM2 > rango.max);
  const textoRango = (r: number | { min: number; max: number }) => (typeof r === "number" ? pesos(r) : `${pesos(r.min)} a ${pesos(r.max)}`);
  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Frentes (m.l. de cada cara)" marca={f.ia.frentes}>
        <div className="flex flex-wrap items-center gap-2">
          {x.frentes.map((fr, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-28"><Numero valor={fr} onCambiar={(v) => set({ frentes: x.frentes.map((y, j) => (j === i ? v ?? 0 : y)) }, "frentes")} etiquetaAria={`Frente ${i + 1}`} /></div>
              <button type="button" aria-label="Quitar frente" className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => set({ frentes: x.frentes.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Chip onClick={() => set({ frentes: [...x.frentes, 0] })}><Plus className="size-4" /> Frente</Chip>
        </div>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="f-altura" etiqueta="Altura (m)" marca={f.ia.alturaFachada}>
          <Numero id="f-altura" valor={x.altura} onCambiar={(v) => set({ altura: v }, "alturaFachada")} placeholder="9" />
        </Campo>
        <Campo etiqueta="Bandeja a 3 m"><Chips opciones={[{ v: true, t: "Sí" }, { v: false, t: "No" }]} valor={x.bandejaA3} onCambiar={(v) => set({ bandejaA3: v })} /></Campo>
        <Campo etiqueta="Filas completas de tablones"><Chips opciones={[{ v: "1" as const, t: "1" }, { v: "2" as const, t: "2" }, { v: "todas" as const, t: "Todas" }]} valor={x.filasTablones} onCambiar={(v) => set({ filasTablones: v })} /></Campo>
      </div>
      <p className="font-mono text-[13px] tabular-nums text-muted-foreground">desarrollo {numeroTexto(desarrollo)} m × {numeroTexto(x.altura ?? 0)} m = {numeroTexto(Math.round(sup * 100) / 100)} m²</p>
      <Campo etiqueta="Tipo de fachada (define el rango)">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORIAS_FACHADA) as CategoriaFachada[]).map((c) => (
            <Chip key={c} activo={x.categoria === c} titulo={CATEGORIAS_FACHADA[c]} onClick={() => set({ categoria: c })}>
              {c === "licitacion" ? "Licitación" : c.charAt(0).toUpperCase() + c.slice(1)} <span className="font-mono text-[12px] opacity-70">{textoRango(rangoCategoria(c, tarifas))}</span>
            </Chip>
          ))}
        </div>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="f-precio" etiqueta="Precio por m² (sin IVA)" marca={f.ia.precioM2}>
          <Moneda id="f-precio" valor={precio} placeholder="45.000" onCambiar={(v) => cambiar((y) => sinIa({ ...y, fachada: { ...y.fachada, precioM2: v, categoria: v ? categoriaParaPrecio(v, tarifas) ?? y.fachada.categoria : y.fachada.categoria } }, "precioM2"))} />
          <Chips opciones={[35000, 40000, 45000, 60000, 75000].map((v) => ({ v, t: v.toLocaleString("es-AR") }))} valor={x.precioM2 ?? -1}
            onCambiar={(v) => set({ precioM2: v, categoria: categoriaParaPrecio(v, tarifas) ?? x.categoria }, "precioM2")} />
        </Campo>
        <Campo id="f-objetivo" etiqueta="O el total neto al que querés llegar">
          <ObjetivoFachada sup={sup} onUsar={(p) => set({ precioM2: p, categoria: categoriaParaPrecio(p, tarifas) ?? x.categoria })} />
        </Campo>
      </div>
      {(fuera || (x.precioM2 && !rango)) && (
        <Campo id="f-motivo" etiqueta="Motivo del precio (fuera del rango; va a la nota)">
          <Texto id="f-motivo" valor={x.motivoPrecio} onCambiar={(v) => set({ motivoPrecio: v })} placeholder="Acceso complicado, precio pactado…" />
        </Campo>
      )}
      {(x.altura ?? 0) >= 15 && (
        <Aviso tono="ambar">
          <span>Con {numeroTexto(x.altura)} m, ¿el precio va escalonado? El tramo alto sube +{tarifas.fachada.saltoAPct} % (A) o +{tarifas.fachada.saltoBPct} % (B).</span>
          <div className="flex flex-wrap items-center gap-2 text-foreground">
            <Chips opciones={[{ v: "no" as const, t: "No" }, { v: "A" as const, t: `A · +${tarifas.fachada.saltoAPct} %` }, { v: "B" as const, t: `B · +${tarifas.fachada.saltoBPct} %` }]} valor={x.escalonado} onCambiar={(v) => set({ escalonado: v })} />
            {(x.escalonado === "A" || x.escalonado === "B") && <div className="w-36"><Numero valor={x.alturaCorte ?? 15} onCambiar={(v) => set({ alturaCorte: v })} etiquetaAria="Altura de corte" placeholder="Corte (m)" /></div>}
          </div>
        </Aviso>
      )}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fila nombre="Media sombra" detalle="en el alcance"><Chips opciones={[{ v: true, t: "Sí" }, { v: false, t: "No" }]} valor={x.mediaSombra} onCambiar={(v) => set({ mediaSombra: v })} /></Fila>
        <Fila nombre="Gestoría del permiso" detalle={f.obra.enCaba === false ? "no aplica fuera de CABA" : `${pesos(tarifas.complementarios.gestoriaCaba)} · CABA`}>
          <Tri valor={f.obra.enCaba === false ? "no" : x.gestoria} onCambiar={(v) => set({ gestoria: v })} />
        </Fila>
      </div>
    </div>
  );
}

function ObjetivoFachada({ sup, onUsar }: { sup: number; onUsar: (p: number) => void }) {
  const [obj, setObj] = useState<number | null>(null);
  const p = obj && sup > 0 ? Math.round(obj / sup / 100) * 100 : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Moneda valor={obj} onCambiar={setObj} placeholder="8.000.000" etiquetaAria="Total objetivo" />
      {p ? <div className="flex items-center gap-2"><span className="font-mono text-[14px] text-primary">{pesos(p)} por m²</span><Chip onClick={() => onUsar(p)}>Usar</Chip></div> : <span className="text-[13px] text-muted-foreground">Sólo la fachada: la memoria y la gestoría se suman aparte.</span>}
    </div>
  );
}

/** Los botones de «Agregar renglón», en el orden en que JS arma un desglosado (12/11). */
const PLANTILLAS: { t: string; concepto: string; porPeriodo: boolean; monto?: (t: Tarifas) => number }[] = [
  { t: "Mano de obra armado", concepto: "Mano de obra de armado", porPeriodo: false },
  { t: "Mano de obra desarme", concepto: "Mano de obra de desarme", porPeriodo: false },
  { t: "Alquiler N días", concepto: "Alquiler del material x 30 días", porPeriodo: true },
  { t: "Traslado de envío", concepto: "Traslado de envío", porPeriodo: false },
  { t: "Traslado de retiro", concepto: "Traslado de retiro", porPeriodo: false },
  { t: "Memoria de cálculo", concepto: "Memoria de cálculo", porPeriodo: false, monto: (t) => t.complementarios.ingenieriaMemoria },
  { t: "Técnico de SyH", concepto: "Técnico de Seguridad e Higiene durante armado y desarme", porPeriodo: false },
  { t: "Gestoría", concepto: "Gestión del permiso de vía pública (GCBA)", porPeriodo: false, monto: (t) => t.complementarios.gestoriaCaba },
  { t: "Etapa", concepto: "Etapa 2: desarme y rearmado", porPeriodo: false },
  { t: "Renglón libre", concepto: "", porPeriodo: false },
];

function Desglose({ f, cambiar, borrador }: { f: Formulario; cambiar: Cambiar; borrador: BorradorVista | null }) {
  const filas = f.desglose.filas;
  const setFila = (id: string, patch: Partial<(typeof filas)[number]>) =>
    cambiar((x) => sinIa({ ...x, desglose: { ...x.desglose, filas: x.desglose.filas.map((r) => (r.id === id ? { ...r, ...patch, ...(patch.concepto !== undefined ? { producto: r.productoOdoo ? r.producto : productoParaConcepto(patch.concepto, patch.porPeriodo ?? r.porPeriodo) } : {}) } : r)) } }, `fila:${id}`));
  // Lo que armó el chat con el motor (alquiler por piezas, mano de obra): se ve, se cambia por el chat.
  const delMotor: Linea[] = borrador?.resultado?.lineas.filter((l) => l.grupo !== "manual" && l.seccion === "base") ?? [];
  const agregar = (p: (typeof PLANTILLAS)[number], tarifas: Tarifas | null) => cambiar((x) => {
    const id = idFila(`${Date.now().toString(36)}-${x.desglose.filas.length + 1}`);
    return { ...x, desglose: { ...x.desglose, filas: [...x.desglose.filas, { id, concepto: p.concepto, cantidad: 1, precio: p.monto && tarifas ? p.monto(tarifas) : null, porPeriodo: p.porPeriodo, seccion: "base", producto: productoParaConcepto(p.concepto || "estructura", p.porPeriodo) }] } };
  });
  // Tab (y Shift+Tab) en un monto salta al monto del renglón de abajo (o de arriba), para cargar
  // los precios de corrido (JS, 12/11). En el último, Tab sigue de largo como siempre.
  const saltarMonto = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.key !== "Tab") return;
    const destino = document.querySelector<HTMLInputElement>(`[data-monto-fila="${e.shiftKey ? i - 1 : i + 1}"] input`);
    if (!destino) return;
    e.preventDefault();
    destino.focus();
    destino.select();
  };
  return (
    <div className="flex flex-col gap-4">
      <Campo id="d-trabajo" etiqueta="Trabajo (para los textos de la propuesta)" marca={f.ia.trabajo}>
        <Texto id="d-trabajo" valor={f.desglose.trabajo} onCambiar={(v) => cambiar((x) => sinIa({ ...x, desglose: { ...x.desglose, trabajo: v } }, "trabajo"))} placeholder="Plataforma multidireccional en hueco de escalera" />
      </Campo>
      <div className="flex flex-col divide-y divide-border">
        {filas.length === 0 && <p className="py-2 text-[14px] text-muted-foreground">Todavía no hay renglones: pegá tu lista de precios arriba o agregalos con los botones.</p>}
        {filas.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2.5 lg:grid-cols-[minmax(0,1fr)_9rem_auto_auto_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-2">
              <Texto id={`fila-${r.id}`} valor={r.concepto} onCambiar={(v) => setFila(r.id, { concepto: v })} placeholder="Concepto" />
              {f.ia[`fila:${r.id}`] && <span title={f.ia[`fila:${r.id}`].cita} className="cursor-help rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">IA</span>}
            </div>
            <div className="lg:order-none" data-monto-fila={i} onKeyDown={(e) => saltarMonto(e, i)}>
              <Moneda valor={r.precio === null ? null : r.precio * r.cantidad} onCambiar={(v) => setFila(r.id, { precio: v, cantidad: 1 })} placeholder="Monto" deducido={r.precio === null} etiquetaAria="Monto sin IVA" />
            </div>
            <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1">
              <Chips opciones={[{ v: false, t: "Única vez" }, { v: true, t: "Por período" }]} valor={r.porPeriodo} onCambiar={(v) => setFila(r.id, { porPeriodo: v })} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chips opciones={[{ v: "base" as const, t: "Base" }, { v: "opcional" as const, t: "Opcional" }]} valor={r.seccion} onCambiar={(v) => setFila(r.id, { seccion: v })} />
            </div>
            <button type="button" aria-label="Quitar renglón" className="inline-flex size-11 items-center justify-center justify-self-end rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
              onClick={() => cambiar((x) => ({ ...x, desglose: { ...x.desglose, filas: x.desglose.filas.filter((y) => y.id !== r.id) } }))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {delMotor.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-[14px]">
          <p className="mb-1 text-[13px] font-medium text-muted-foreground">Calculado por el asistente (se cambia por el chat)</p>
          {delMotor.map((l) => <div key={l.id} className="flex gap-2"><span className="min-w-0 flex-1">{l.descripcion}</span><span className="font-mono tabular-nums">{pesos(l.importe)}</span></div>)}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">Agregar renglón</span>
        <PlantillasConTarifas onAgregar={agregar} />
        <span className="text-[13px] text-muted-foreground">¿Torres o plataformas por piezas? Pedile el cómputo al asistente (botón de arriba): lo suma al mismo presupuesto.</span>
      </div>
    </div>
  );
}

/** Las plantillas necesitan las tarifas (memoria y gestoría salen con su monto). */
let tarifasPlantillas: Tarifas | null = null;
export function setTarifasPlantillas(t: Tarifas) {
  tarifasPlantillas = t;
}
function PlantillasConTarifas({ onAgregar }: { onAgregar: (p: (typeof PLANTILLAS)[number], t: Tarifas | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLANTILLAS.map((p) => <Chip key={p.t} onClick={() => onAgregar(p, tarifasPlantillas)}><Plus className="size-4" /> {p.t}</Chip>)}
    </div>
  );
}

function Fila({ nombre, detalle, children }: { nombre: string; detalle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><p className="text-[14px] font-semibold">{nombre}</p><p className="text-[13px] text-muted-foreground">{detalle}</p></div>
      {children}
    </div>
  );
}

// ── Jornadas y render ───────────────────────────────────────────────────────────────────

const TIPOS_RENDER_POR: Record<Formulario["tipo"], string[]> = {
  bandeja: ["bandeja"], fachada: ["fachada"], desglosado: ["torre", "plataforma", "apuntalamiento", "evento", "otro"],
};

export function SeccionJornadas({ f, cambiar, renders, alertaJornadas, alertaRender, onSubir, subiendo, vistaPropia, onDespues }: {
  f: Formulario; cambiar: Cambiar; renders: Render[]; alertaJornadas: boolean; alertaRender: boolean;
  onSubir: (archivo: File) => void; subiendo: boolean; vistaPropia: string | null; onDespues: () => void;
}) {
  const j = f.jornadas;
  const op = [0.5, 1, 2, 3];
  const setJ = (k: "armado" | "desarme", v: number | null) => cambiar((x) => ({ ...x, jornadas: { ...x.jornadas, [k]: v } }));
  // Primero los del tipo (los de por defecto adelante) y después el resto de la biblioteca. Se ven
  // 6; «Ver toda la biblioteca» muestra todos (JS, 12/11: en el desglosado faltaban renders).
  const delTipo = (r: Render) => TIPOS_RENDER_POR[f.tipo].includes(String(r.tipo));
  const ordenados = [...renders].sort((a, b) => Number(delTipo(b)) - Number(delTipo(a)) || Number(b.por_defecto) - Number(a.por_defecto) || a.nombre.localeCompare(b.nombre, "es"));
  const [todos, setTodos] = useState(false);
  const elegido = f.render.eleccion === "biblioteca" ? ordenados.find((r) => r.id === f.render.renderId) : undefined;
  const primeros = ordenados.filter(delTipo).slice(0, 6);
  const lista = todos ? ordenados : elegido && !primeros.includes(elegido) ? [...primeros, elegido] : primeros;
  const archivo = useRef<HTMLInputElement>(null);
  return (
    <Seccion id="s-jornadas" titulo="Jornadas y render" alerta={alertaJornadas || alertaRender}
      resumen={j.armado && j.desarme ? renglon(`${nro(j.armado)} de armado + ${nro(j.desarme)} de desarme`, { biblioteca: "render de la biblioteca", propio: "render propio", ninguno: "sin render" }[f.render.eleccion ?? "ninguno"]) : undefined} extra={<span className="text-[13px] text-muted-foreground">las jornadas las confirma el técnico</span>}>
      <div className="flex flex-wrap items-end gap-4">
        <button type="button" onClick={() => cambiar((x) => ({ ...x, jornadas: { armado: 1, desarme: 1 } }))}
          className={cn("min-h-11 min-w-24 rounded-lg px-4 text-[15px] font-semibold", j.armado === 1 && j.desarme === 1 ? "bg-hd-boton text-white" : "border border-border hover:bg-muted")}>1 + 1</button>
        {(["armado", "desarme"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">{k === "armado" ? "Armado" : "Desarme"}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {op.map((v) => <Chip key={v} activo={j[k] === v} onClick={() => setJ(k, v)}>{v.toLocaleString("es-AR")}</Chip>)}
              <div className="w-20"><Numero valor={j[k] !== null && !op.includes(j[k]!) ? j[k] : null} onCambiar={(v) => setJ(k, v)} placeholder="otra" etiquetaAria={`Jornadas de ${k}`} /></div>
            </div>
          </div>
        ))}
        <Chip onClick={onDespues} titulo="Queda en «Para seguir» y lo retomás cuando el técnico confirme">Las pregunto después</Chip>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">Render</span>
        <div className="flex flex-wrap gap-2.5">
          {lista.map((r) => (
            <BotonRender key={r.id} activo={f.render.eleccion === "biblioteca" && f.render.renderId === r.id} nombre={r.nombre} url={r.url}
              onClick={() => cambiar((x) => ({ ...x, render: { eleccion: "biblioteca", renderId: r.id, path: null } }))} />
          ))}
          <BotonRender activo={f.render.eleccion === "propio"} nombre={subiendo ? "Subiendo…" : f.render.eleccion === "propio" ? "Foto propia" : "Subir foto o render"} url={f.render.eleccion === "propio" ? vistaPropia : null}
            icono={subiendo ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />} onClick={() => archivo.current?.click()} />
          <BotonRender activo={f.render.eleccion === "ninguno"} nombre="Sin render" icono={<ImageOff className="size-6" />}
            onClick={() => cambiar((x) => ({ ...x, render: { eleccion: "ninguno", renderId: null, path: null } }))} />
        </div>
        {ordenados.length > lista.length || todos ? (
          <button type="button" onClick={() => setTodos(!todos)} className="self-start min-h-9 text-[14px] text-primary underline-offset-2 hover:underline">
            {todos ? "Ver menos" : `Ver toda la biblioteca (${ordenados.length})`}
          </button>
        ) : null}
        <input ref={archivo} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const a = e.target.files?.[0]; if (a) onSubir(a); e.target.value = ""; }} />
        {lista.length === 0 && <p className="text-[13px] text-muted-foreground">No hay renders de este tipo en la biblioteca (Parámetros → Renders).</p>}
      </div>
    </Seccion>
  );
}

function BotonRender({ activo, nombre, url, icono, onClick }: { activo: boolean; nombre: string; url?: string | null; icono?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-32 flex-col gap-1.5 rounded-xl border p-1.5 text-left text-[13px] font-medium", activo ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
      <span className="flex h-18 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {/* URLs firmadas de Storage, que vencen: next/image no suma nada acá. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : icono ?? <ImagePlus className="size-6" />}
      </span>
      <span className="line-clamp-2 px-0.5">{nombre}</span>
    </button>
  );
}

// ── Opcionales y condiciones ────────────────────────────────────────────────────────────

export function SeccionCondiciones({ f, cambiar, tarifas, alerta }: { f: Formulario; cambiar: Cambiar; tarifas: Tarifas; alerta: boolean }) {
  const altura = f.tipo === "bandeja" ? f.bandeja.altura : f.tipo === "fachada" ? f.fachada.altura ?? 0 : 0;
  const memoriaObligatoria = altura > 6;
  const jornadas = f.jornadas.armado && f.jornadas.desarme ? Math.ceil(f.jornadas.armado) + Math.ceil(f.jornadas.desarme) : null;
  const formas = [{ v: FORMAS_PAGO["5050"], t: "50 % anticipo · 50 % fin de montaje" }, { v: FORMAS_PAGO["100"], t: "100 % anticipado" }];
  const otraForma = !!f.formaPago && !formas.some((x) => x.v === f.formaPago);
  return (
    <Seccion id="s-condiciones" titulo={f.tipo === "desglosado" ? "Condiciones" : "Opcionales y condiciones"} alerta={alerta}
      resumen={renglon(`${f.plazoDias} días`, f.formaPago === FORMAS_PAGO["5050"] ? "50 % anticipo · 50 % fin de montaje" : f.formaPago === FORMAS_PAGO["100"] ? "100 % anticipado" : f.formaPago?.trim() ? "otra forma de pago" : null)}
      extra={<span className="text-[13px] text-muted-foreground">a Odoo va sólo la base; lo opcional queda en el PDF</span>}>
      {f.tipo !== "desglosado" && (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fila nombre="Técnico de Seguridad e Higiene" detalle={jornadas ? `${pesos(tarifas.complementarios.syhJornada)} × ${jornadas} jornadas` : `${pesos(tarifas.complementarios.syhJornada)} por jornada · sale con las jornadas`}>
            <Tri valor={f.syh} onCambiar={(v) => cambiar((x) => sinIa({ ...x, syh: v }, "syh"))} />
          </Fila>
          <Fila nombre="Memoria de cálculo" detalle={memoriaObligatoria ? "Base obligatoria: más de 6 m (Decreto 911/96)" : `${pesos(tarifas.complementarios.ingenieriaMemoria)} + IVA`}>
            <Tri valor={f.memoria} bloqueado={memoriaObligatoria} onCambiar={(v) => cambiar((x) => sinIa({ ...x, memoria: v }, "memoria"))} />
          </Fila>
        </div>
      )}
      <Fila nombre="Plazo" detalle="el período del alquiler">
        <div className="flex flex-wrap items-center gap-1.5">
          {[30, 10, 60, 90].map((d) => <Chip key={d} activo={f.plazoDias === d} onClick={() => cambiar((x) => ({ ...x, plazoDias: d }))}>{d} días</Chip>)}
          <div className="w-24"><Numero valor={[30, 10, 60, 90].includes(f.plazoDias) ? null : f.plazoDias} onCambiar={(v) => v && cambiar((x) => ({ ...x, plazoDias: Math.round(v) }))} placeholder="otro" etiquetaAria="Días de plazo" /></div>
        </div>
      </Fila>
      {f.plazoDias < tarifas.periodoMinimoDias && <Aviso tono="ambar">El mínimo de alquiler es de {tarifas.periodoMinimoDias} días: con {f.plazoDias} queda anotado como excepción.</Aviso>}
      <Fila nombre="Forma de pago" detalle="sale en Condiciones Económicas">
        <div className="flex flex-wrap gap-1.5">
          {formas.map((x) => <Chip key={x.t} activo={f.formaPago === x.v} onClick={() => cambiar((y) => ({ ...y, formaPago: x.v }))}>{x.t}</Chip>)}
          <Chip activo={otraForma} onClick={() => cambiar((y) => ({ ...y, formaPago: otraForma ? y.formaPago : " " }))}>Otra…</Chip>
        </div>
      </Fila>
      {otraForma && <Texto id="forma-pago" valor={f.formaPago?.trim() ?? ""} onCambiar={(v) => cambiar((y) => ({ ...y, formaPago: v || " " }))} placeholder="Cómo paga (las cuotas con e-cheqs, pedíselas al asistente)" />}
    </Seccion>
  );
}

// ── Textos de la propuesta ──────────────────────────────────────────────────────────────

export function SeccionTextos({ f, cambiar, borrador, alerta }: { f: Formulario; cambiar: Cambiar; borrador: BorradorVista | null; alerta: boolean }) {
  const d = borrador?.datos;
  const [abierto, setAbierto] = useState(false);
  const aMano = f.textos.aMano;
  const tomarDelBorrador = () => cambiar((x) => ({ ...x, textos: { aMano: true, referencia: d?.referencia ?? "", seccion1: d?.seccion1 ?? "", seccion2: d?.seccion2 ?? [] } }));
  return (
    <Seccion id="s-textos" titulo="Textos de la propuesta" alerta={alerta} resumen={aMano ? "escritos a mano" : "automáticos"}
      extra={<button type="button" className="min-h-9 text-[14px] text-primary underline-offset-2 hover:underline" onClick={() => setAbierto(!abierto)}>{abierto ? "Cerrar" : aMano ? "Ver (a mano)" : "Ver (automáticos)"}</button>}>
      {!abierto ? (
        <p className="line-clamp-2 text-[14px] text-muted-foreground">{(aMano ? f.textos.seccion1 : d?.seccion1)?.replace(/\*\*/g, "") || "Salen solos con los datos de arriba."}</p>
      ) : aMano ? (
        <div className="flex flex-col gap-3">
          <Campo id="t-ref" etiqueta="Referencia"><Texto id="t-ref" valor={f.textos.referencia} onCambiar={(v) => cambiar((x) => ({ ...x, textos: { ...x.textos, referencia: v } }))} /></Campo>
          <Campo id="t-s1" etiqueta="Sección 1 · alcance">
            <textarea id="t-s1" value={f.textos.seccion1} onChange={(e) => cambiar((x) => ({ ...x, textos: { ...x.textos, seccion1: e.target.value } }))} className="min-h-28 rounded-lg border border-input bg-background p-3 text-[15px]" />
          </Campo>
          {f.textos.seccion2.map((s, i) => (
            <Campo key={i} id={`t-s2-${i}`} etiqueta={`Sección 2 · ${s.titulo}`}>
              <textarea id={`t-s2-${i}`} value={s.contenido} onChange={(e) => cambiar((x) => ({ ...x, textos: { ...x.textos, seccion2: x.textos.seccion2.map((y, j) => (j === i ? { ...y, contenido: e.target.value } : y)) } }))} className="min-h-24 rounded-lg border border-input bg-background p-3 text-[15px]" />
            </Campo>
          ))}
          <div><Chip onClick={() => cambiar((x) => ({ ...x, textos: { ...x.textos, aMano: false } }))}>Volver a los automáticos</Chip></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-[14px]">
          <p><span className="text-muted-foreground">Referencia:</span> {d?.referencia ?? "—"}</p>
          <p className="whitespace-pre-line">{d?.seccion1?.replace(/\*\*/g, "") ?? "—"}</p>
          {d?.seccion2.map((s, i) => <div key={i}><p className="font-semibold">{s.titulo}</p><p className="whitespace-pre-line text-muted-foreground">{s.contenido.replace(/\*\*/g, "")}</p></div>)}
          <div><Chip onClick={tomarDelBorrador}>Editarlos a mano</Chip></div>
        </div>
      )}
    </Seccion>
  );
}
