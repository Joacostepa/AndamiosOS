"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Loader2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useOrdenesOdoo } from "@/hooks/use-ordenes-odoo";
import { useCreateAdicional, useRetryPushOT, useOrdenesTrabajo } from "@/hooks/use-ordenes-trabajo";
import { useObras } from "@/hooks/use-obras";
import { ChipsFiltro } from "@/components/ordenes/chips-filtro";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { colorTipo, semaforo, CORAL } from "@/lib/tablero/colores";
import { partesTitulo, normalizar } from "@/lib/tablero/titulo";
import type { FiltroOrdenes, OrdenListado } from "@/lib/tablero/tipos-orden";

// Listado de Órdenes de Trabajo, leído de Odoo.
//
// Antes leía la tabla `ordenes_trabajo` de Supabase mientras el tablero leía
// x_aba_orden_trabajo: dos listas de OT que no se veían entre sí, con el mismo
// desdoblamiento que ya habíamos resuelto entre /planificacion y /tablero.
//
// El alta de OT adicional sigue escribiendo en Supabase y empujando a Odoo: ese camino ya
// está armado y probado, y tocarlo ahora sería riesgo sin beneficio.

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

const TIPO_OT_LABELS: Record<string, string> = {
  armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación",
  desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro",
};

function Fila({ ot }: { ot: OrdenListado }) {
  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const partes = partesTitulo(ot.titulo);
  const critica = ot.habAlerta === "critica";
  const sinFecha = ot.grupoProg === "b_sin";

  return (
    <Link
      href={`/ordenes-trabajo/${ot.id}`}
      className="flex items-center gap-2 border-b px-3 py-2 text-[13px] hover:bg-muted/40"
      style={{
        backgroundColor: critica
          ? "#FDECEA"
          : sinFecha
            ? "color-mix(in oklch, var(--foreground) 2.5%, transparent)"
            : undefined,
      }}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: sem.color }}
        title={sem.label}
      />
      <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{partes.principal}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[partes.numero, partes.cliente].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span className="w-28 shrink-0 text-right text-[12px]">
        {ot.fechaProgramada ? (
          <>
            {format(parseISO(ot.fechaProgramada), "d MMM", { locale: es })}
            {ot.fechaFirmeza && (
              <span
                className="ml-1 rounded px-1 text-[10px] font-semibold"
                style={
                  ot.fechaFirmeza === "confirmada"
                    ? { backgroundColor: "#EAF3DE", color: "#27500A" }
                    : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
                }
                title={ot.fechaFirmeza === "confirmada" ? "Fecha firme" : "Fecha tentativa"}
              >
                {ot.fechaFirmeza === "confirmada" ? "F" : "t"}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">sin fecha</span>
        )}
      </span>

      <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
        {ot.cuadrillaPrevista ?? "—"}
      </span>
      <span className="w-12 shrink-0 text-right text-[12px] tabular-nums">{ot.jornadas || "—"}</span>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
        {ot.cantDocs || "—"}
      </span>
    </Link>
  );
}

export default function OrdenesTrabajoPage() {
  const [filtro, setFiltro] = useState<FiltroOrdenes>("abiertas");
  const [busqueda, setBusqueda] = useState("");
  const { data, isLoading, isFetching } = useOrdenesOdoo(filtro);

  // Las adicionales recién creadas viven en Supabase hasta que el push las lleva a Odoo.
  // Entre esos dos momentos no existirían en un listado que lee de Odoo, así que se
  // muestran aparte, arriba, hasta que sincronizan.
  const { data: locales } = useOrdenesTrabajo();
  const enVuelo = (locales ?? []).filter(
    (o) => o.es_adicional && o.odoo_sync_estado !== "sincronizado",
  );

  const { data: obras } = useObras();
  const createAdicional = useCreateAdicional();
  const retry = useRetryPushOT();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm<{
    obra_id: string; tipo: string; motivo_adicional: string; descripcion?: string; fecha_programada?: string;
  }>({ defaultValues: { tipo: "ampliacion" } });

  const ordenes = useMemo(() => {
    const lista = data?.ordenes ?? [];
    const q = normalizar(busqueda.trim());
    if (!q) return lista;
    return lista.filter((o) => normalizar(o.titulo).includes(q));
  }, [data, busqueda]);

  function onSubmit(d: { obra_id: string; tipo: string; motivo_adicional: string; descripcion?: string; fecha_programada?: string }) {
    if (!d.obra_id) return toast.error("Seleccioná la obra");
    if (!d.motivo_adicional) return toast.error("Indicá el motivo del adicional");
    createAdicional.mutate(d, {
      onSuccess: () => {
        toast.success("OT adicional creada — sincronizando con Odoo");
        setOpen(false);
        reset();
      },
      onError: () => toast.error("Error al crear la OT adicional"),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Órdenes de Trabajo"
        description={
          data
            ? `${data.conteos.abiertas} abiertas · ${data.conteos.cerradas} cerradas${isFetching ? " · actualizando…" : ""}`
            : "Cargando…"
        }
      >
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva OT adicional
        </Button>
      </PageHeader>

      <ChipsFiltro activo={filtro} conteos={data?.conteos} onCambio={setFiltro} />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar obra, cliente o número…"
          className="h-8 pl-8 text-[12px]"
        />
      </div>

      {enVuelo.length > 0 && (
        <div className="space-y-1 rounded-md border p-2" style={{ borderColor: CORAL }}>
          {enVuelo.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-[12px]">
              <span className="font-medium">{o.descripcion || "OT adicional"}</span>
              {o.odoo_sync_estado === "error" ? (
                <>
                  <span style={{ color: "#B42318" }}>no sincronizó: {o.odoo_sync_error}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    disabled={retry.isPending}
                    onClick={() =>
                      retry.mutate(o.id, {
                        onSuccess: () => toast.success("Sincronizada con Odoo"),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    {retry.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Reintentar
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">creada, sincronizando…</span>
              )}
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="w-2.5 shrink-0" title="Habilitación" />
            <span className="w-3.5 shrink-0" title="Tipo" />
            <span className="min-w-0 flex-1">Obra</span>
            <span className="w-28 shrink-0 text-right">Fecha</span>
            <span className="w-24 shrink-0">Cuadrilla</span>
            <span className="w-12 shrink-0 text-right">Jorn</span>
            <span className="w-10 shrink-0 text-right">Doc</span>
          </div>
          {ordenes.length > 0 ? (
            ordenes.map((ot) => <Fila key={ot.id} ot={ot} />)
          ) : (
            <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              {busqueda ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes en este filtro."}
            </p>
          )}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>Nueva OT adicional</SheetTitle></SheetHeader>
          <p className="mt-2 text-sm text-muted-foreground">
            Trabajo extra detectado en obra. Queda pendiente hasta que Comercial lo apruebe en Odoo.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(v) => v && setValue("obra_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra…" /></SelectTrigger>
                <SelectContent>
                  {obras?.filter((o) => o.estado !== "cancelada").map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={watch("tipo")} onValueChange={(v) => v && setValue("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_OT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Motivo del adicional *</Label>
              <Textarea {...register("motivo_adicional", { required: true })} rows={2} placeholder="Por qué surge este trabajo extra…" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea {...register("descripcion")} rows={2} placeholder="Qué hay que hacer…" />
            </div>
            <div className="space-y-2">
              <Label>Fecha programada</Label>
              <Input type="date" {...register("fecha_programada")} />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={createAdicional.isPending}>
                {createAdicional.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear adicional
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
