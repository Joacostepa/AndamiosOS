"use client";

// "¿Qué hay afuera?" (docs §6.9): lo que no está en el pañol, por quién lo tiene. La misma
// vista sirve en la tablet del depósito (/kiosco/afuera) y en la oficina
// (/deposito/panol/afuera); cambia quién firma lo que se hace desde acá:
//   - kiosco: el token del encargado que se identificó (sin encargado, sólo se mira);
//   - oficina: el usuario, a nombre de su legajo (o de quien elija, si no tiene legajo).
//
// "PASAR A…" es una transferencia: lo que está con una persona, cuadrilla u obra pasa a
// otra, sin volver al pañol. Para una herramienta numerada alcanza la unidad (la base sabe
// dónde está); para lo a granel va artículo, cantidad, desde y hacia.

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MessageCircle, Minus, PackageOpen, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  deshacerVale, idDispositivo, nombreCompleto, registrarVale, useInvalidarPanol, type PersonaPanol,
} from "@/hooks/use-panol";
import { useAfueraPanol } from "@/hooks/use-panol-tablet";
import {
  contarAfuera, filtrarAfuera, nombreDeLugar, senalItem, type FiltroAfuera, type GrupoAfuera, type ItemAfuera,
} from "@/lib/panol/afuera";
import { numero } from "@/lib/panol/conteo";
import { leerRechazo, lugarDeCuadrilla, lugarDeObra, lugarDePersona } from "@/lib/panol/estado";
import type { ItemVale, PersonaTipo, Vale } from "@/lib/panol/tipos";
import { fechaCorta, linkWhatsapp, mensajePrestamoVencido } from "@/lib/panol/whatsapp";
import { cn } from "@/lib/utils";
import { BOTON_SECUNDARIO, ChipGrande } from "./comun";

export type FirmaAfuera =
  | { kiosco: true; token: string | null }
  | { kiosco: false; quien: { tipo: PersonaTipo; id: string } | null };

const FILTROS: { id: FiltroAfuera; texto: string }[] = [
  { id: "todo", texto: "Todo" },
  { id: "cuadrillas", texto: "Cuadrillas" },
  { id: "personas", texto: "Personas" },
  { id: "vencidas", texto: "Vencidas" },
  { id: "faltantes", texto: "Faltantes" },
];

const TIPO_GRUPO: Record<GrupoAfuera["clase"], string> = {
  cuadrilla: "Cuadrilla",
  persona: "Persona",
  obra: "Obra",
  faltante: "Sin titular",
};

export function VistaAfuera({ firma, puedeActuar, sinPermiso, titular, hrefTodo, tablet = false }: {
  firma: FirmaAfuera;
  /** ¿Se puede "Pasar a…"? Kiosco: encargado identificado. Oficina: Pañol en editar. */
  puedeActuar: boolean;
  /** Qué decir cuando no se puede (una línea). */
  sinPermiso?: string;
  /** `?titular=<lugar>`: sólo lo de ese titular. */
  titular?: string | null;
  hrefTodo: string;
  tablet?: boolean;
}) {
  const { grupos, personas, perdidaDias, hoy, cargando, error } = useAfueraPanol();
  const [filtro, setFiltro] = useState<FiltroAfuera>("todo");
  const [pasando, setPasando] = useState<{ item: ItemAfuera; grupo: GrupoAfuera } | null>(null);

  const base = useMemo(() => (grupos ? filtrarAfuera(grupos, "todo", titular) : []), [grupos, titular]);
  const visibles = useMemo(() => filtrarAfuera(base, filtro), [base, filtro]);
  const cuentas = contarAfuera(base);
  const tituloTitular = titular ? base[0]?.titulo ?? (personas ? nombreDeLugar(titular, personas.personas, personas.cuadrillas) : titular) : null;
  const Titulo = tablet ? "h1" : "h2";
  const boton = tablet ? BOTON_SECUNDARIO : "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted";

  return (
    <div className={cn("flex flex-col", tablet ? "gap-5 px-7 py-6" : "gap-4")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo className={cn("font-bold", tablet ? "text-3xl" : "text-xl tracking-tight")}>
            {tituloTitular ? `Lo que tiene ${tituloTitular}` : "¿Qué hay afuera?"}
          </Titulo>
          <p className={cn("mt-1 text-muted-foreground", tablet && "text-[17px]")}>
            Por titular, con la obra donde está. Lo de las cuadrillas no tiene fecha: queda con ellas.
            {titular && (
              <>
                {" "}
                <Link href={hrefTodo} className="font-medium text-foreground underline underline-offset-4">Ver todo</Link>
              </>
            )}
          </p>
        </div>
        <div role="group" aria-label="Filtrar" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const n = f.id === "vencidas" ? cuentas.vencidas : f.id === "faltantes" ? cuentas.faltantes : null;
            const sel = filtro === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={sel}
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "rounded-full font-semibold",
                  tablet ? "h-14 px-4 text-base" : "h-9 px-3.5 text-sm",
                  sel ? "bg-foreground text-background" : "border-2 border-border bg-card text-foreground",
                )}
              >
                {f.texto}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {!puedeActuar && sinPermiso && <p className="text-sm text-muted-foreground">{sinPermiso}</p>}

      {error ? (
        <p role="alert" className="text-red-700 dark:text-red-300">{error instanceof Error ? error.message : "No se pudo leer el pañol."}</p>
      ) : cargando || !grupos ? (
        <div className="flex items-center gap-3 py-12 text-muted-foreground"><Loader2 aria-hidden className="size-5 animate-spin" /> Cargando…</div>
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={filtro === "todo" ? "No hay nada afuera" : filtro === "vencidas" ? "No hay préstamos vencidos" : filtro === "faltantes" ? "No hay faltantes" : "No hay nada con este filtro"}
          description={filtro === "todo" ? "Todo lo que se presta o queda con una cuadrilla aparece acá." : undefined}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {visibles.map((g) => (
            <Grupo
              key={g.lugar}
              grupo={g}
              hoy={hoy}
              perdidaDias={perdidaDias}
              tablet={tablet}
              boton={boton}
              puedeActuar={puedeActuar}
              onPasar={(item) => setPasando({ item, grupo: g })}
            />
          ))}
        </div>
      )}

      {pasando && personas && (
        <HojaPasar
          key={pasando.item.clave}
          item={pasando.item}
          grupo={pasando.grupo}
          grupos={grupos ?? []}
          personas={personas.personas}
          cuadrillas={personas.cuadrillas}
          firma={firma}
          tablet={tablet}
          onCerrar={() => setPasando(null)}
        />
      )}
    </div>
  );
}

function subtitulo(g: GrupoAfuera): string {
  const obras = g.obras.length ? g.obras.map((o) => `OT ${o}`).join(", ") : "";
  switch (g.clase) {
    case "cuadrilla":
      return [g.capataz ? `Capataz: ${g.capataz.nombre}` : "Sin capataz", obras && `en ${obras}`].filter(Boolean).join(" · ");
    case "persona":
      return obras || "Sin obra";
    case "obra":
      return "Queda fija en la obra";
    case "faltante":
      return "No se sabe quién lo tiene";
  }
}

function Grupo({ grupo: g, hoy, perdidaDias, tablet, boton, puedeActuar, onPasar }: {
  grupo: GrupoAfuera;
  hoy: string;
  perdidaDias: number;
  tablet: boolean;
  boton: string;
  puedeActuar: boolean;
  onPasar: (item: ItemAfuera) => void;
}) {
  const n = g.maquinas.length + g.granel.length;
  const fila = (i: ItemAfuera) => {
    const s = senalItem(i, hoy, perdidaDias);
    const wa = i.vencida && g.clase === "persona" && i.venceEl
      ? linkWhatsapp(g.telefono, mensajePrestamoVencido({ nombre: g.titulo, herramienta: i.nombre, numero: i.numero ?? "", venceEl: i.venceEl, obra: i.odooOtId ? `OT ${i.odooOtId}` : null }))
      : null;
    return (
      <li key={i.clave} className={cn("flex items-center gap-3 border-t first:border-t-0", tablet ? "min-h-[72px] px-4 py-2" : "min-h-14 px-3 py-1.5")}>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate font-semibold", tablet ? "text-[17px]" : "text-sm")}>
            {i.nombre}{" "}
            {i.numero ? <span className="font-mono text-muted-foreground">{i.numero}</span> : <span className="text-muted-foreground">× {numero(i.cantidad)} {i.unidad}</span>}
          </div>
          <div className={cn("text-muted-foreground", tablet ? "text-sm" : "text-xs")}>
            {[i.familia, i.desdeAt && `desde ${fechaCorta(i.desdeAt)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        {s.texto && (s.tono === "neutro"
          ? <span className={cn("shrink-0 text-muted-foreground", tablet ? "text-[15px]" : "text-sm")}>{s.texto}</span>
          : tablet ? <ChipGrande tono={s.tono}>{s.texto}</ChipGrande> : <ChipChico tono={s.tono}>{s.texto}</ChipChico>)}
        {!s.texto && g.clase === "cuadrilla" && (
          <span className={cn("shrink-0 text-muted-foreground", tablet ? "text-[15px]" : "text-sm")}>Con la cuadrilla</span>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(boton, tablet && "w-14 px-0")} aria-label={`Avisarle a ${g.titulo} por WhatsApp`}>
            <MessageCircle aria-hidden className="size-4" />
          </a>
        )}
        {puedeActuar && !i.faltante && (
          <button type="button" className={boton} onClick={() => onPasar(i)} aria-label={`Pasar ${i.nombre} ${i.numero ?? ""} a otro titular`}>
            Pasar a…
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className={cn("flex items-start justify-between gap-3 border-b bg-muted/40", tablet ? "px-4 py-3" : "px-3 py-2.5")}>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TIPO_GRUPO[g.clase]}</div>
          <h2 className={cn("truncate font-bold", tablet ? "text-xl" : "text-base")}>{g.titulo}</h2>
          <div className={cn("text-muted-foreground", tablet ? "text-sm" : "text-xs")}>{subtitulo(g)}</div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums">{n}</span>
      </header>
      {g.maquinas.length > 0 && <ul>{g.maquinas.map(fila)}</ul>}
      {g.granel.length > 0 && (
        <>
          {g.maquinas.length > 0 && <div className="border-t px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">A granel</div>}
          <ul>{g.granel.map(fila)}</ul>
        </>
      )}
    </section>
  );
}

function ChipChico({ tono, children }: { tono: "bloqueo" | "aviso"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium",
      tono === "bloqueo" ? "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    )}>
      {children}
    </span>
  );
}

// ─── "Pasar a…" ─────────────────────────────────────────────────────────────

type Destino = "persona" | "cuadrilla" | "obra";

function HojaPasar({ item, grupo, grupos, personas, cuadrillas, firma, tablet, onCerrar }: {
  item: ItemAfuera;
  grupo: GrupoAfuera;
  grupos: readonly GrupoAfuera[];
  personas: readonly PersonaPanol[];
  cuadrillas: readonly { id: string; nombre: string; activo: boolean; responsableId: string | null }[];
  firma: FirmaAfuera;
  tablet: boolean;
  onCerrar: () => void;
}) {
  const invalidar = useInvalidarPanol();
  const [destino, setDestino] = useState<Destino | null>(null);
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [q, setQ] = useState("");
  const [ot, setOt] = useState("");
  const [firmante, setFirmante] = useState<string>("");
  const [enviando, setEnviando] = useState(false);

  // Oficina sin legajo vinculado: a nombre de quién queda el vale.
  const pideFirmante = !firma.kiosco && !firma.quien;
  const legajos = useMemo(() => personas.filter((p) => p.tipo === "persona" && p.activo), [personas]);
  const nombre = `${item.nombre}${item.numero ? ` ${item.numero}` : ""}`;
  const nombreDe = (l: string) => nombreDeLugar(l, personas, cuadrillas);

  const opcionesPersona = useMemo(() => {
    const t = q.trim().toLowerCase();
    return personas
      .filter((p) => p.activo && lugarDePersona(p.tipo, p.id) !== item.lugar)
      .filter((p) => !t || nombreCompleto(p).toLowerCase().includes(t) || (p.detalle ?? "").toLowerCase().includes(t))
      .slice(0, 40);
  }, [personas, q, item.lugar]);
  const opcionesCuadrilla = cuadrillas.filter((c) => c.activo && lugarDeCuadrilla(c.id) !== item.lugar);
  // Las obras que ya aparecen afuera: lo más probable es pasar algo a una de ésas.
  const obrasConocidas = useMemo(() => {
    const s = new Set<number>();
    for (const g of grupos) {
      for (const o of g.obras) s.add(o);
      if (g.clase === "obra") s.add(Number(g.lugar.slice(2)));
    }
    return [...s].filter((o) => lugarDeObra(o) !== item.lugar).sort((a, b) => b - a);
  }, [grupos, item.lugar]);

  async function pasar(hacia: string, texto: string, otDestino?: number) {
    if (pideFirmante && !firmante) {
      toast.error("Elegí a nombre de quién queda.");
      return;
    }
    setEnviando(true);
    const it: ItemVale = item.unidadId
      ? { articuloId: item.articuloId, unidadId: item.unidadId, hacia }
      : { articuloId: item.articuloId, varianteId: item.varianteId, cantidad, desde: item.lugar, hacia };
    // A otra persona o cuadrilla sigue en la obra donde estaba; a una obra, en ésa.
    it.odooOtId = otDestino ?? item.odooOtId;
    const quien = firma.kiosco
      ? undefined
      : firma.quien ?? (firmante ? { tipo: "persona" as const, id: firmante } : undefined);
    const vale: Vale = {
      clientUuid: crypto.randomUUID(),
      tipo: "transferencia",
      token: firma.kiosco ? firma.token ?? undefined : undefined,
      quien,
      dispositivo: idDispositivo(),
      items: [it],
    };
    try {
      const r = await registrarVale(vale);
      invalidar();
      onCerrar();
      const que = item.unidadId ? nombre : `${numero(cantidad)} ${item.unidad} de ${item.nombre}`;
      toast.success(`${que} pasó a ${texto}.`, {
        duration: 10_000,
        action: {
          label: "Deshacer",
          onClick: () => {
            deshacerVale(r.valeId)
              .then(() => {
                invalidar();
                toast.success("Se deshizo.");
              })
              .catch((e) => toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto));
          },
        },
      });
    } catch (e) {
      toast.error(leerRechazo(e instanceof Error ? e.message : String(e), nombreDe).texto);
    } finally {
      setEnviando(false);
    }
  }

  const grande = tablet ? "min-h-16 text-lg" : "min-h-12 text-base";
  const opcion = cn("flex w-full flex-col items-start justify-center gap-0.5 rounded-lg border-2 border-border bg-card px-4 py-2 text-left active:bg-muted disabled:opacity-50", grande);

  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onCerrar()}>
      <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className={tablet ? "text-2xl" : "text-lg"}>Pasar {nombre}</DialogTitle>
          <DialogDescription className={tablet ? "text-base" : undefined}>
            Hoy {item.unidadId ? "la tiene" : "lo tiene"} {grupo.titulo}. Queda en el historial como transferencia.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-auto">
          {pideFirmante && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">¿A nombre de quién queda? (tu usuario no tiene legajo vinculado)</span>
              <select value={firmante} onChange={(e) => setFirmante(e.target.value)} className="h-11 rounded-lg border-2 border-input bg-card px-3 text-base">
                <option value="">Elegí una persona…</option>
                {legajos.map((p) => <option key={p.id} value={p.id}>{nombreCompleto(p)}</option>)}
              </select>
            </label>
          )}

          {!destino ? (
            <>
              {!item.unidadId && item.cantidad > 1 && (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-base">¿Cuántos? <span className="text-muted-foreground">(tiene {numero(item.cantidad)})</span></span>
                  <button type="button" aria-label="Uno menos" className={cn(BOTON_SECUNDARIO, "w-14 px-0")} onClick={() => setCantidad((c) => Math.max(1, c - 1))}><Minus aria-hidden /></button>
                  <span className="w-16 text-center font-mono text-2xl font-semibold" aria-live="polite">{numero(cantidad)}</span>
                  <button type="button" aria-label="Uno más" className={cn(BOTON_SECUNDARIO, "w-14 px-0")} onClick={() => setCantidad((c) => Math.min(item.cantidad, c + 1))}><Plus aria-hidden /></button>
                </div>
              )}
              {(["persona", "cuadrilla", "obra"] as const).map((d) => (
                <button key={d} type="button" className={cn(opcion, "font-semibold")} onClick={() => setDestino(d)}>
                  {d === "persona" ? "Otra persona" : d === "cuadrilla" ? "Otra cuadrilla" : "Otra obra"}
                </button>
              ))}
            </>
          ) : (
            <>
              <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground" onClick={() => setDestino(null)}>
                <ArrowLeft aria-hidden className="size-4" /> Otro destino
              </button>
              {destino === "persona" && (
                <>
                  <label className="relative">
                    <span className="sr-only">Buscar persona</span>
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por nombre"
                      className={cn("w-full rounded-lg border-2 border-input bg-card pr-4 pl-11 outline-none focus-visible:border-ring", tablet ? "h-14 text-lg" : "h-11 text-base")}
                    />
                  </label>
                  {opcionesPersona.map((p) => (
                    <button key={`${p.tipo}:${p.id}`} type="button" disabled={enviando} className={opcion} onClick={() => pasar(lugarDePersona(p.tipo, p.id), nombreCompleto(p))}>
                      <span className="font-semibold">{nombreCompleto(p)}</span>
                      {p.detalle && <span className="text-sm text-muted-foreground">{p.tipo === "externa" ? `Externa · ${p.detalle}` : p.detalle}</span>}
                    </button>
                  ))}
                  {opcionesPersona.length === 0 && <p className="text-muted-foreground">No hay nadie con ese nombre.</p>}
                </>
              )}
              {destino === "cuadrilla" && opcionesCuadrilla.map((c) => {
                const capataz = personas.find((p) => p.tipo === "persona" && p.id === c.responsableId);
                return (
                  <button key={c.id} type="button" disabled={enviando} className={opcion} onClick={() => pasar(lugarDeCuadrilla(c.id), c.nombre)}>
                    <span className="font-semibold">{c.nombre}{capataz ? ` · ${nombreCompleto(capataz)}` : ""}</span>
                    <span className="text-sm text-muted-foreground">{capataz ? "Queda a cargo del capataz" : "Sin capataz cargado"}</span>
                  </button>
                );
              })}
              {destino === "obra" && (
                <>
                  {obrasConocidas.map((o) => (
                    <button key={o} type="button" disabled={enviando} className={opcion} onClick={() => pasar(lugarDeObra(o), `la OT ${o}`, o)}>
                      <span className="font-semibold">OT {o}</span>
                      <span className="text-sm text-muted-foreground">Queda fija en la obra</span>
                    </button>
                  ))}
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Number(ot);
                      if (Number.isInteger(n) && n > 0) void pasar(lugarDeObra(n), `la OT ${n}`, n);
                    }}
                  >
                    <input
                      inputMode="numeric"
                      value={ot}
                      onChange={(e) => setOt(e.target.value.replace(/\D/g, ""))}
                      placeholder="Otra OT (número)"
                      aria-label="Número de OT"
                      className={cn("min-w-0 flex-1 rounded-lg border-2 border-input bg-card px-4 font-mono outline-none focus-visible:border-ring", tablet ? "h-14 text-xl" : "h-11 text-base")}
                    />
                    <button type="submit" disabled={!ot || enviando} className={tablet ? BOTON_SECUNDARIO : "h-11 rounded-lg border-2 px-4 font-medium"}>Pasar</button>
                  </form>
                </>
              )}
            </>
          )}
        </div>

        <button type="button" disabled={enviando} onClick={onCerrar} className={cn(tablet ? BOTON_SECUNDARIO : "h-10 rounded-lg border-2 font-medium", "w-full")}>
          {enviando ? <Loader2 aria-hidden className="size-5 animate-spin" /> : "Cancelar"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
