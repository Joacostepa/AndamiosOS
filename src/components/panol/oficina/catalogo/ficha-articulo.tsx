"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, Seccion } from "@/components/permisos-via-publica/ui";
import { useCatalogoPanol } from "@/hooks/use-panol";
import {
  formatoCantidad, useAgregarTalle, useDesactivarTalle, useFotoPanol, useGuardarArticulo, useNombreLugar,
  useSubirFotoArticulo, type CambiosArticulo, type MovimientoFila,
} from "@/hooks/use-panol-catalogo";
import type { Semana } from "@/lib/panol/consumo";
import { conTitular, enPanol, ESTADO_UNIDAD, existencias, hoyBA, noApta, sugeridoReponer } from "@/lib/panol/estado";
import type { Articulo, EstadoUnidad } from "@/lib/panol/tipos";
import { cn } from "@/lib/utils";
import { SelectorUbicacion } from "./selector-ubicacion";
import { cuando, numero, UNIDADES_RETIRO } from "./formato";

// Las piezas de la ficha de un artículo (stock/[id]). Arriba la tarjeta de estado con UN
// botón coral; debajo, lo editable (Stock), dónde está cada cosa, el consumo y el historial.

// ─── Tarjeta de estado ──────────────────────────────────────────────────────

export function TarjetaArticulo({
  art,
  promedio,
  ultimoIngreso,
  encargado,
  onPrincipal,
}: {
  art: Articulo;
  /** Consumo promedio por semana (insumos). */
  promedio: number;
  ultimoIngreso: MovimientoFila | null;
  encargado: boolean;
  /** Ingreso de compra, o alta de unidades si es herramienta con número. */
  onPrincipal: () => void;
}) {
  const cat = useCatalogoPanol();
  const e = existencias(cat.data?.saldos ?? [], art.id);
  const u = art.unidad;
  const min = art.minimo !== null ? Number(art.minimo) : null;
  const factor = art.unidad_compra ? Number(art.factor_compra) || 1 : 1;
  const sugerido = sugeridoReponer(e.enPanol, min, art.reponer_hasta !== null ? Number(art.reponer_hasta) : null, factor);
  const negativo = e.enPanol < 0;
  const bajo = !negativo && min !== null && min > 0 && e.enPanol < min;

  let chip: React.ReactNode = null;
  let titulo: string;
  let texto: string | null = null;

  if (art.tipo === "herramienta") {
    const unidades = (cat.data?.unidades ?? []).filter((x) => x.articulo_id === art.id && x.estado !== "baja");
    const cuenta = (est: EstadoUnidad) => unidades.filter((x) => x.estado === est).length;
    const noAptas = unidades.filter((x) => noApta(art.seguridad_critica, x.proxima_inspeccion, hoyBA())).length;
    titulo = unidades.length === 0 ? "Todavía no tiene unidades" : `${unidades.length} ${unidades.length === 1 ? "unidad" : "unidades"}: ${cuenta("disponible")} en el pañol, ${cuenta("afuera")} afuera`;
    const resto = (["en_revision", "en_mantenimiento", "fuera_de_servicio", "faltante", "perdida"] as const)
      .filter((est) => cuenta(est) > 0).map((est) => `${cuenta(est)} ${ESTADO_UNIDAD[est].toLowerCase()}`);
    texto = [resto.join(", "), noAptas ? `${noAptas} con la inspección vencida` : ""].filter(Boolean).join(" · ") || null;
    if (noAptas) chip = <Chip tono="bloqueo">No aptas: {noAptas}</Chip>;
    else if (bajo) chip = <Chip tono="aviso">Bajo mínimo</Chip>;
  } else if (negativo) {
    chip = <Chip tono="bloqueo">Stock negativo</Chip>;
    titulo = `Figura en negativo: ${formatoCantidad(e.enPanol)} ${u}`;
    texto = "Se retiró más de lo que entró. Revisá los movimientos de abajo o cargá el ingreso que falta.";
  } else if (bajo) {
    chip = <Chip tono="aviso">Bajo mínimo</Chip>;
    titulo = `Bajo mínimo: quedan ${formatoCantidad(e.enPanol)} ${u}, mínimo ${formatoCantidad(min!)}`;
    const alcanza = promedio > 0 ? Math.floor(e.enPanol / promedio) : null;
    texto = [
      promedio > 0 ? `Se usan unas ${formatoCantidad(Math.round(promedio))} por semana: ${alcanza === 0 ? "no alcanzan para una semana" : `alcanzan para ${alcanza} ${alcanza === 1 ? "semana" : "semanas"}`}.` : null,
      sugerido > 0 ? `Pedir ${formatoCantidad(sugerido)} ${u}${art.unidad_compra ? ` (${formatoCantidad(sugerido / factor)} ${art.unidad_compra} de ${formatoCantidad(factor)})` : ""}${art.reponer_hasta !== null ? ` para volver a ${formatoCantidad(Number(art.reponer_hasta))}` : ""}.` : null,
    ].filter(Boolean).join(" ");
  } else {
    titulo = `Hay ${formatoCantidad(e.enPanol)} ${u} en el pañol${min !== null ? ` · mínimo ${formatoCantidad(min)}` : ""}`;
    texto = ultimoIngreso
      ? `Último ingreso ${cuando(ultimoIngreso.created_at)}: ${formatoCantidad(ultimoIngreso.cantidad)} ${u}${ultimoIngreso.vale?.proveedor ? ` de ${ultimoIngreso.vale.proveedor}` : ""}${ultimoIngreso.vale?.comprobante ? `, remito ${ultimoIngreso.vale.comprobante}` : ""}.`
      : null;
  }

  const afuera = art.tipo !== "herramienta" && (e.afuera > 0 || e.faltante > 0)
    ? [e.afuera > 0 ? `${formatoCantidad(e.afuera)} afuera` : null, e.faltante > 0 ? `${formatoCantidad(e.faltante)} faltante` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <section aria-labelledby="estado-articulo" className="space-y-3 rounded-md border bg-card p-4">
      {chip && <div>{chip}</div>}
      <div className="space-y-1">
        <h2 id="estado-articulo" className="text-[19px] font-bold leading-snug">{titulo}</h2>
        {texto && <p className="text-[14px] text-foreground/80">{texto}</p>}
        {afuera && <p className="text-[13px] text-muted-foreground">{afuera}</p>}
      </div>
      {encargado && (
        <Button onClick={onPrincipal} className="max-sm:h-10">
          {art.tipo === "herramienta" ? "Dar de alta unidades" : "Cargar ingreso de compra"}
        </Button>
      )}
    </section>
  );
}

// ─── Stock (lo editable) ────────────────────────────────────────────────────

type Borrador = {
  nombre: string;
  unidad: string;
  unidad_compra: string;
  factor_compra: string;
  minimo: string;
  reponer_hasta: string;
  ubicacion_id: string | null;
  proveedor: string;
  codigo_barras: string;
  notas: string;
};

const deArticulo = (a: Articulo): Borrador => ({
  nombre: a.nombre,
  unidad: a.unidad,
  unidad_compra: a.unidad_compra ?? "",
  factor_compra: a.unidad_compra ? String(Number(a.factor_compra)) : "",
  minimo: a.minimo !== null ? String(Number(a.minimo)) : "",
  reponer_hasta: a.reponer_hasta !== null ? String(Number(a.reponer_hasta)) : "",
  ubicacion_id: a.ubicacion_id,
  proveedor: a.proveedor ?? "",
  codigo_barras: a.codigo_barras ?? "",
  notas: a.notas ?? "",
});

export function EditorArticulo({ art, encargado }: { art: Articulo; encargado: boolean }) {
  const cat = useCatalogoPanol();
  const guardar = useGuardarArticulo();
  const [b, setB] = useState<Borrador>(() => deArticulo(art));
  const original = deArticulo(art);
  const sucio = (Object.keys(b) as (keyof Borrador)[]).some((k) => b[k] !== original[k]);
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  const min = numero(b.minimo);
  const rep = numero(b.reponer_hasta);
  const factor = numero(b.factor_compra);
  const errores = [
    !b.nombre.trim() ? "Falta el nombre." : null,
    min !== null && min < 0 ? "El mínimo no puede ser negativo." : null,
    min !== null && rep !== null && rep < min ? "«Reponer hasta» tiene que ser mayor que el mínimo." : null,
    b.unidad_compra.trim() && (!factor || factor <= 0) ? "Decí cuántas unidades trae cada unidad de compra." : null,
  ].filter(Boolean) as string[];

  function onGuardar() {
    const cambios: CambiosArticulo = {
      nombre: b.nombre.trim(),
      unidad: b.unidad,
      unidad_compra: b.unidad_compra.trim() || null,
      factor_compra: b.unidad_compra.trim() ? factor! : 1,
      minimo: min,
      reponer_hasta: rep,
      ubicacion_id: b.ubicacion_id,
      proveedor: b.proveedor.trim() || null,
      codigo_barras: b.codigo_barras.trim() || null,
      notas: b.notas.trim() || null,
    };
    guardar.mutate({ id: art.id, cambios }, {
      onSuccess: () => toast.success("Cambios guardados."),
      onError: (e) => toast.error(e.message),
    });
  }

  const ro = !encargado;
  return (
    <Seccion titulo="Stock">
      <div className="grid gap-4 p-3 sm:grid-cols-[8rem_1fr]">
        <Foto art={art} encargado={encargado} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[13px] font-medium">Nombre</span>
            <Input value={b.nombre} onChange={(e) => set("nombre", e.target.value)} disabled={ro} />
          </label>
          {art.tipo !== "herramienta" && (
            <>
              <label className="space-y-1">
                <span className="text-[13px] font-medium">Unidad de retiro</span>
                <select value={b.unidad} onChange={(e) => set("unidad", e.target.value)} disabled={ro} className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px] disabled:opacity-50">
                  {!UNIDADES_RETIRO.some((x) => x.valor === b.unidad) && <option value={b.unidad}>{b.unidad}</option>}
                  {UNIDADES_RETIRO.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}
                </select>
              </label>
              <div className="space-y-1">
                <span className="text-[13px] font-medium">Unidad de compra</span>
                <div className="flex items-center gap-1.5">
                  <Input value={b.unidad_compra} onChange={(e) => set("unidad_compra", e.target.value)} placeholder="bolsa" aria-label="Unidad de compra" disabled={ro} />
                  <span className="shrink-0 text-[13px] text-muted-foreground">de</span>
                  <Input value={b.factor_compra} onChange={(e) => set("factor_compra", e.target.value)} inputMode="decimal" placeholder="100" aria-label="Unidades por unidad de compra" className="w-20" disabled={ro || !b.unidad_compra.trim()} />
                </div>
              </div>
            </>
          )}
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Mínimo</span>
            <Input value={b.minimo} onChange={(e) => set("minimo", e.target.value)} inputMode="decimal" disabled={ro} />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Reponer hasta</span>
            <Input value={b.reponer_hasta} onChange={(e) => set("reponer_hasta", e.target.value)} inputMode="decimal" disabled={ro} />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Ubicación</span>
            <SelectorUbicacion ubicaciones={cat.data?.ubicaciones ?? []} value={b.ubicacion_id} onChange={(id) => set("ubicacion_id", id)} vacio="Sin ubicación" disabled={ro} />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Proveedor habitual</span>
            <Input value={b.proveedor} onChange={(e) => set("proveedor", e.target.value)} disabled={ro} />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Código de barras de fábrica</span>
            <Input value={b.codigo_barras} onChange={(e) => set("codigo_barras", e.target.value)} disabled={ro} />
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-medium">Notas</span>
            <Input value={b.notas} onChange={(e) => set("notas", e.target.value)} disabled={ro} />
          </label>
        </div>
      </div>
      {art.tiene_talles && <Talles art={art} encargado={encargado} />}
      {encargado && (
        <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2.5">
          <Button variant="outline" onClick={onGuardar} disabled={!sucio || errores.length > 0 || guardar.isPending}>
            {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar cambios
          </Button>
          {sucio && <Button variant="ghost" onClick={() => setB(deArticulo(art))} disabled={guardar.isPending}>Descartar</Button>}
          {sucio && errores[0] && <span className="text-[13px] text-red-700 dark:text-red-300">{errores[0]}</span>}
        </div>
      )}
    </Seccion>
  );
}

function Foto({ art, encargado }: { art: Articulo; encargado: boolean }) {
  const url = useFotoPanol(art.foto_path);
  const subir = useSubirFotoArticulo();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <div className="grid aspect-square w-32 place-items-center overflow-hidden rounded-md border bg-muted">
        {url.data ? (
          // eslint-disable-next-line @next/next/no-img-element -- link firmado del bucket privado
          <img src={url.data} alt={`Foto de ${art.nombre}`} className="size-full object-cover" />
        ) : (
          <Camera aria-hidden className="size-6 text-muted-foreground" />
        )}
      </div>
      {encargado && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              e.target.value = "";
              if (archivo) subir.mutate({ articuloId: art.id, archivo }, { onError: (err) => toast.error(err.message) });
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => input.current?.click()} disabled={subir.isPending}>
            {subir.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {art.foto_path ? "Cambiar foto" : "Agregar foto"}
          </Button>
        </>
      )}
    </div>
  );
}

function Talles({ art, encargado }: { art: Articulo; encargado: boolean }) {
  const cat = useCatalogoPanol();
  const agregar = useAgregarTalle();
  const desactivar = useDesactivarTalle();
  const [nuevo, setNuevo] = useState("");
  const talles = (cat.data?.variantes ?? []).filter((v) => v.articulo_id === art.id);
  const saldos = cat.data?.saldos ?? [];

  function onAgregar() {
    const t = nuevo.trim();
    if (!t) return;
    agregar.mutate({ articuloId: art.id, nombre: t, orden: talles.length }, {
      onSuccess: () => setNuevo(""),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="space-y-2 border-t px-3 py-3">
      <p className="text-[13px] font-medium">Talles <span className="font-normal text-muted-foreground">· cada uno con su stock</span></p>
      <div className="flex flex-wrap items-center gap-1.5">
        {talles.map((v) => {
          const hay = existencias(saldos, art.id, v.id).enPanol;
          return (
            <span key={v.id} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted pl-2.5 pr-1 text-[13px]">
              {v.nombre}
              <span className="tabular-nums text-muted-foreground">{formatoCantidad(hay)}</span>
              {encargado && (
                <button
                  type="button"
                  aria-label={`Dejar de ofrecer el talle ${v.nombre}`}
                  title={hay !== 0 ? "Tiene stock: primero que quede en cero" : "Dejar de ofrecerlo"}
                  disabled={hay !== 0 || desactivar.isPending}
                  onClick={() => desactivar.mutate(v.id, { onError: (e) => toast.error(e.message) })}
                  className="rounded p-0.5 hover:bg-background disabled:opacity-30"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          );
        })}
        {talles.length === 0 && <span className="text-[13px] text-muted-foreground">Sin talles cargados.</span>}
        {encargado && (
          <>
            <Input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAgregar(); } }}
              placeholder="Talle"
              aria-label="Talle nuevo"
              className="h-7 w-24"
            />
            <Button size="sm" variant="outline" onClick={onAgregar} disabled={!nuevo.trim() || agregar.isPending}>+ Agregar talle</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dónde está ─────────────────────────────────────────────────────────────

/** Existencias por lugar: en el pañol (por estante), afuera (por titular), faltante, taller. */
export function ExistenciasPorLugar({ art }: { art: Articulo }) {
  const cat = useCatalogoPanol();
  const nombre = useNombreLugar();
  const talles = new Map((cat.data?.variantes ?? []).map((v) => [v.id, v.nombre]));
  const filas = (cat.data?.saldos ?? []).filter((s) => s.articulo_id === art.id && s.cantidad !== 0);
  const grupos = [
    { titulo: "En el pañol", filas: filas.filter((s) => enPanol(s.lugar)) },
    { titulo: "Afuera", filas: filas.filter((s) => conTitular(s.lugar)) },
    { titulo: "Faltante, taller y pérdidas", filas: filas.filter((s) => !enPanol(s.lugar) && !conTitular(s.lugar)) },
  ].filter((g) => g.filas.length > 0);

  return (
    <Seccion titulo="Dónde está">
      {grupos.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-muted-foreground">No hay existencias: no entró nada todavía.</p>
      ) : (
        <div className="divide-y">
          {grupos.map((g) => (
            <div key={g.titulo} className="px-3 py-2.5">
              <p className="mb-1 text-[12px] font-medium text-muted-foreground">{g.titulo}</p>
              <ul className="space-y-1">
                {g.filas.sort((a, b) => b.cantidad - a.cantidad).map((s) => (
                  <li key={`${s.lugar}:${s.variante_id}`} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0">
                      {conTitular(s.lugar) && !s.lugar.startsWith("o:") ? (
                        <Link href={`/deposito/panol/afuera?titular=${encodeURIComponent(s.lugar)}`} className="underline-offset-2 hover:underline">{nombre(s.lugar)}</Link>
                      ) : nombre(s.lugar)}
                      {s.variante_id && <span className="text-muted-foreground"> · talle {talles.get(s.variante_id) ?? "?"}</span>}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", s.cantidad < 0 && "font-semibold text-red-700 dark:text-red-300")}>
                      {formatoCantidad(s.cantidad)} {art.unidad}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  );
}

/** Las unidades de una herramienta con número, con link a su ficha. */
export function UnidadesDelArticulo({ art, accion }: { art: Articulo; accion?: React.ReactNode }) {
  const cat = useCatalogoPanol();
  const nombre = useNombreLugar();
  const hoy = hoyBA();
  const unidades = (cat.data?.unidades ?? []).filter((u) => u.articulo_id === art.id);
  return (
    <Seccion titulo={`Unidades (${unidades.filter((u) => u.estado !== "baja").length})`} accion={accion}>
      {unidades.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-muted-foreground">Sin unidades. Cada una sale con su número y su QR.</p>
      ) : (
        <ul className="divide-y">
          {unidades.map((u) => (
            <li key={u.id} className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]", u.estado === "baja" && "text-muted-foreground")}>
              <Link href={`/deposito/panol/herramientas/${u.id}`} className="font-medium tabular-nums underline-offset-2 hover:underline">#{u.numero}</Link>
              <span className="min-w-0 flex-1 text-foreground/80">{nombre(u.lugar)}</span>
              {noApta(art.seguridad_critica, u.proxima_inspeccion, hoy) ? <Chip tono="bloqueo">No apta</Chip>
                : u.estado !== "disponible" && u.estado !== "afuera" ? <Chip tono={u.estado === "baja" ? "neutro" : "aviso"}>{ESTADO_UNIDAD[u.estado]}</Chip> : null}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

// ─── Consumo ────────────────────────────────────────────────────────────────

const DIA_MES = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Barras chicas de las últimas 8 semanas (gris neutro: es un dato, no un estado). */
export function BarrasConsumo({ semanas, promedio, unidad }: { semanas: Semana[]; promedio: number; unidad: string }) {
  const max = Math.max(1, ...semanas.map((s) => s.cantidad));
  return (
    <Seccion titulo="Consumo · últimas 8 semanas" accion={<span className="text-[12px] text-muted-foreground">Promedio: {formatoCantidad(Math.round(promedio))} {unidad} por semana</span>}>
      <div className="flex h-36 items-end gap-2 px-3 pb-2 pt-4" role="img" aria-label={`Consumo por semana: ${semanas.map((s) => `${DIA_MES(s.lunes)} ${formatoCantidad(s.cantidad)}`).join(", ")}`}>
        {semanas.map((s, i) => (
          <div key={s.lunes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[11px] tabular-nums text-muted-foreground">{formatoCantidad(s.cantidad)}</span>
            <div
              className={cn("w-full max-w-10 rounded-t-sm", i === semanas.length - 1 ? "bg-muted-foreground/40" : "bg-muted-foreground/70")}
              style={{ height: `${Math.max(2, (Math.max(0, s.cantidad) / max) * 72)}px` }}
            />
            <span className="text-[11px] tabular-nums text-muted-foreground">{DIA_MES(s.lunes)}</span>
          </div>
        ))}
      </div>
      <p className="px-3 pb-2 text-[12px] text-muted-foreground">Neto: retiros menos sobrantes. La última barra es la semana en curso.</p>
    </Seccion>
  );
}
