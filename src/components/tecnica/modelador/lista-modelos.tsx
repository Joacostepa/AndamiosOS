"use client";

// Lista de modelos (/oficina-tecnica/modelador): por obra o sin obra, búsqueda, tarjetas con la
// imagen y el resumen, y "Nuevo modelo" (desde una plantilla de la galería, desde "Mis
// plantillas" o desde la obra). Con ?obra=<id> filtra y precarga la obra en el modelo nuevo.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./util/toast";
import { crearDiseno, ejemploParana631, type Diseno } from "@/lib/tecnica/modelo";
import { useNivelModelador, usePuedeModelador } from "./util/permisos";
import { useAcceso } from "@/components/providers/acceso-provider";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { useObras } from "@/hooks/use-obras";
import { useArchivarModelo, useCatalogoModelador, useCrearModelo, useModelos } from "./datos/api";
import { etiquetaCategoria, type ModeloLista, type ResumenModelo } from "./datos/tipos";
import { galeriaAgrupada, iconoDe } from "./util/galeria";
import { fmt, haceCuanto, kg } from "./util/formato";
import { Boxes, Building2, Loader2, Lock, MoreHorizontal, Plus, Search, Star } from "lucide-react";

type Filtro = "todos" | "obra" | "sin_obra" | "plantillas";

export function ListaModelos({ obraId }: { obraId: string | null }) {
  const acceso = useAcceso();
  const nivel = useNivelModelador();
  if (acceso && nivel === null) {
    return <EmptyState icon={Lock} title="No tenés acceso al Modelador" description="Pedile a un administrador el permiso del módulo Modelador (ver o editar)." />;
  }
  return <ListaModelosConAcceso obraId={obraId} />;
}

function ListaModelosConAcceso({ obraId }: { obraId: string | null }) {
  const router = useRouter();
  const puede = usePuedeModelador();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(obraId ? "obra" : "todos");
  const [nuevo, setNuevo] = useState(false);
  const modelos = useModelos({ obra: filtro === "obra" ? obraId : null, plantillas: filtro === "plantillas", q: q.trim() || undefined });
  const obras = useObras();
  const obra = useMemo(() => obras.data?.find((o) => o.id === obraId) ?? null, [obras.data, obraId]);
  const archivar = useArchivarModelo();
  const lista = (modelos.data ?? []).filter((m) => (filtro === "sin_obra" ? !m.obra_id && !m.es_plantilla : filtro === "plantillas" ? m.es_plantilla : !m.es_plantilla));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modelador</h1>
          <p className="text-sm text-muted-foreground">
            Andamios en 3D con lista de piezas y cómputo. Todo cálculo es <b className="font-mono text-[var(--tb-aviso-text)]">PREDIMENSIONADO</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/oficina-tecnica/modelador/demo" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Ver la obra de ejemplo
          </Link>
          {puede && (
            <Button onClick={() => setNuevo(true)}>
              <Plus /> Nuevo modelo
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre u obra" className="pl-8" />
        </div>
        {(
          [
            ["todos", "Todos"], ...(obraId ? [["obra", obra ? `${obra.codigo}` : "Esta obra"]] : []), ["sin_obra", "Sin obra"], ["plantillas", "Mis plantillas"],
          ] as [Filtro, string][]
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={filtro === v}
            onClick={() => setFiltro(v)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground"
          >
            {t}
          </button>
        ))}
      </div>

      {modelos.isLoading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      )}
      {modelos.isError && (
        <EmptyState icon={Boxes} title="No pude leer los modelos" description={modelos.error instanceof Error ? modelos.error.message : "La API del modelador no respondió."}>
          <Link href="/oficina-tecnica/modelador/demo" className={buttonVariants({ variant: "outline" })}>
            Abrir la obra de ejemplo (sin guardar)
          </Link>
        </EmptyState>
      )}
      {modelos.isSuccess && !lista.length && (
        <EmptyState
          icon={filtro === "plantillas" ? Star : Boxes}
          title={filtro === "plantillas" ? "Todavía no hay plantillas propias" : "Todavía no hay modelos"}
          description={filtro === "plantillas" ? "Abrí un modelo y tocá «Guardar como plantilla»." : "Armá el primero desde una plantilla de la galería."}
        >
          {puede && filtro !== "plantillas" && (
            <Button onClick={() => setNuevo(true)}>
              <Plus /> Nuevo modelo
            </Button>
          )}
        </EmptyState>
      )}
      {lista.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {lista.map((m) => (
            <Tarjeta key={m.id} m={m} puede={puede} onArchivar={() => archivar.mutate(m.id, { onSuccess: () => toast.success(`Archivé ${m.nombre}`), onError: (e) => toast.error(e.message) })} />
          ))}
        </div>
      )}

      <NuevoModelo
        abierto={nuevo}
        onCambiar={setNuevo}
        obraInicial={obra ? { id: obra.id, codigo: obra.codigo, nombre: obra.nombre } : null}
        onCreado={(id) => router.push(`/oficina-tecnica/modelador/${id}`)}
      />
    </div>
  );
}

function Tarjeta({ m, puede, onArchivar }: { m: ModeloLista; puede: boolean; onArchivar: () => void }) {
  // El resumen es jsonb: puede venir de una versión anterior con menos campos.
  const r: Partial<ResumenModelo> = m.resumen ?? {};
  const sinCodigo = Array.isArray(r.sinCodigo) ? r.sinCodigo.reduce((t, x) => t + (x.cantidad ?? 0), 0) : 0;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
      <Link href={`/oficina-tecnica/modelador/${m.id}`} className="block">
        <div className="grid aspect-[16/9] place-items-center bg-muted/50">
          {m.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage que vence
            <img src={m.imagen_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Boxes className="size-10 text-muted-foreground/40" />
          )}
        </div>
        <div className="space-y-1 p-3">
          <div className="flex items-center gap-1.5">
            {m.es_plantilla && <Star className="size-3.5 text-primary" />}
            <span className="truncate font-medium">{m.nombre}</span>
          </div>
          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="size-3" />
            {m.obra ? <><span className="font-mono">{m.obra.codigo}</span> · {m.obra.nombre}</> : m.es_plantilla ? (etiquetaCategoria(m.plantilla_categoria) || "plantilla") : m.cotizacion_ref ?? "Sin obra"}
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>
              {r.m2 !== undefined ? `${fmt(r.m2, 0)} m²` : "—"} · {r.pesoKg !== undefined ? `${kg(r.pesoKg)}${r.pesoParcial ? "*" : ""} kg` : "—"}
              {sinCodigo ? ` · ${sinCodigo} sin código` : ""}
            </span>
            <span>{haceCuanto(m.updated_at)}</span>
          </div>
        </div>
      </Link>
      {puede && (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="secondary" aria-label="Más acciones" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onArchivar}>Archivar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

const GRUPOS = galeriaAgrupada();

function NuevoModelo({ abierto, onCambiar, obraInicial, onCreado }: {
  abierto: boolean; onCambiar: (v: boolean) => void; obraInicial: Diseno["obra"]; onCreado: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [obraSel, setObraSel] = useState<string | null>(null);
  const [desde, setDesde] = useState<string>("estructura_pantalla");
  const obras = useObras();
  const plantillas = useModelos({ plantillas: true });
  const catalogo = useCatalogoModelador();
  const crear = useCrearModelo();
  const obraId = obraSel ?? obraInicial?.id ?? "";
  const obra = obraId ? (obras.data?.find((o) => o.id === obraId) ?? (obraInicial?.id === obraId ? obraInicial : null)) : null;
  const obraDiseno: Diseno["obra"] = obra ? { id: obra.id, codigo: obra.codigo, nombre: obra.nombre } : null;

  const confirmar = async () => {
    const n = nombre.trim() || (obra ? `Andamio ${obra.nombre}` : "Modelo sin nombre");
    try {
      let creado;
      if (desde.startsWith("plantilla:")) {
        creado = await crear.mutateAsync({ desdePlantilla: desde.slice(10), obra_id: obraDiseno?.id ?? null, nombre: n });
      } else {
        let d: Diseno;
        if (desde === "ejemplo") d = ejemploParana631();
        else if (desde === "vacio") {
          d = crearDiseno("libre", { catalogo: catalogo.data?.catalogo });
          d.estructuras = [];
        } else d = crearDiseno(desde, { catalogo: catalogo.data?.catalogo });
        d.nombre = n;
        d.obra = obraDiseno;
        creado = await crear.mutateAsync({ nombre: n, obra_id: obraDiseno?.id ?? null, diseno: d });
      }
      onCambiar(false);
      onCreado(creado.id);
    } catch (e) {
      toast.error("No se creó el modelo", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo modelo</DialogTitle>
          <DialogDescription>Elegí con qué arrancar. Después se suman más estructuras, volúmenes del edificio y uniones en el editor.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Nombre</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={obra ? `Andamio ${obra.nombre}` : "Fachada Paraná 631"} maxLength={120} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Obra (opcional)</span>
            <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={obraId} onChange={(e) => setObraSel(e.target.value)}>
              <option value="">Sin obra (para cotizar)</option>
              {obraInicial && !obras.data?.some((o) => o.id === obraInicial.id) && <option value={obraInicial.id}>{obraInicial.codigo} · {obraInicial.nombre}</option>}
              {(obras.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
            </select>
          </label>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-1.5">
            <Opcion activa={desde === "vacio"} onClick={() => setDesde("vacio")} titulo="Vacío" sub="Solo volúmenes: dibujá el edificio y modelá arriba" />
            <Opcion activa={desde === "ejemplo"} onClick={() => setDesde("ejemplo")} titulo="Obra de ejemplo" sub="Fachada en L 14 + 8 × 18" />
          </div>
          {GRUPOS.map((g) => (
            <section key={g.id}>
              <h4 className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.etiqueta}</h4>
              <div className="grid grid-cols-3 gap-1.5">
                {g.presets.map((p) => {
                  const Ic = iconoDe(p.icono, p.tipologia);
                  return <Opcion key={p.id} activa={desde === p.id} onClick={() => setDesde(p.id)} titulo={p.nombre} sub={p.descripcion} icono={<Ic className="size-4 text-muted-foreground" />} />;
                })}
              </div>
            </section>
          ))}
          <section>
            <h4 className="flex items-center gap-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Star className="size-3" /> Mis plantillas
            </h4>
            {plantillas.data?.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {plantillas.data.map((m) => <Opcion key={m.id} activa={desde === `plantilla:${m.id}`} onClick={() => setDesde(`plantilla:${m.id}`)} titulo={m.nombre} sub={m.descripcion ?? m.plantilla_categoria ?? ""} />)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{plantillas.isError ? "No pude leer las plantillas." : "Todavía no hay plantillas propias."}</p>
            )}
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiar(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={crear.isPending}>
            {crear.isPending && <Loader2 className="animate-spin" />} Crear y abrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opcion({ activa, onClick, titulo, sub, icono }: { activa: boolean; onClick: () => void; titulo: string; sub: string; icono?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn("flex flex-col items-start gap-0.5 rounded-lg border border-border p-2 text-left text-xs transition-colors hover:bg-muted", activa && "border-primary bg-primary/10")}
    >
      <span className="flex items-center gap-1.5 font-medium">{icono}{titulo}</span>
      <span className="line-clamp-2 text-[11px] text-muted-foreground">{sub}</span>
    </button>
  );
}
