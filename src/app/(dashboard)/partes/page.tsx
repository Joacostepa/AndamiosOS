"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDays, format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronDer, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJornadas, useReprogramar, useJornadaNoPlanificada } from "@/hooks/use-jornadas";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRACCIONES } from "@/lib/tablero/fracciones";
import { useCerrarJornada } from "@/hooks/use-parte";
import { CORAL } from "@/lib/tablero/colores";
import { parseHora } from "@/lib/tablero/horas";
import {
  FilaJornada,
  borradorDe,
  erroresDe,
  horasHombreDe,
  type Borrador,
} from "@/components/partes/fila-jornada";
import type { JornadaListado } from "@/lib/tablero/tipos-jornada";
import type { DatosCierre } from "@/lib/tablero/tipos-parte";

// Carga de partes diarios. Es el ÚNICO lugar donde se crea un parte.
//
// Un día entero son cinco filas, así que no hay buscador ni paginado ni filtros: no hay
// que encontrar nada, hay que confirmar cinco cosas. Toda la presión del diseño está en
// la fricción — si cargar es lento, en tres meses se vuelve a la planilla.

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Traduce el borrador de una fila a lo que espera la API del parte. */
function aDatosCierre(b: Borrador, j: JornadaListado): DatosCierre {
  const ejecutado = b.estado === "ejecutado";
  const desde = parseHora(b.desde) ?? 8;
  const hasta = parseHora(b.hasta) ?? 17;
  const personas = Number(b.personas) || 0;
  return {
    fecha: j.fecha,
    // La cuadrilla ya no se pregunta: viaja la planificada, que es la que usa el informe
    // de obra. Lo que se carga a mano es el capataz.
    cuadrillaId: b.cuadrillaId ? Number(b.cuadrillaId) : null,
    punteroId: b.capatazId ? Number(b.capatazId) : null,
    camionEnObra: b.camionEnObra,
    estado: b.estado,
    motivoNoEjec: ejecutado ? null : (b.motivo as DatosCierre["motivoNoEjec"]),
    sector: b.sector.trim() || null,
    clima: null,
    objetivo: null,
    // El proceso nunca separó objetivo de tareas: los 1276 partes tienen los dos vacíos y
    // todo el relato en notas. Un solo campo de texto.
    tareas: null,
    observaciones: b.observaciones.trim() || null,
    manoObra: ejecutado && personas > 0
      ? [{ tarea: j.tipo === "desarme" ? "desarme" : "armado", personas, horaDesde: desde, horaHasta: hasta }]
      : [],
    flete: ejecutado && Number(b.fletes) > 0
      ? {
          cantidad: Number(b.fletes),
          tercerizado: b.tercerizado,
          costoManual: b.tercerizado ? Number(b.costoFlete) || 0 : undefined,
        }
      : null,
    incidencias: ejecutado && b.incidenciaTipo && b.incidenciaDesc.trim()
      ? [{ tipo: b.incidenciaTipo as never, descripcion: b.incidenciaDesc.trim() }]
      : [],
    // Sólo si la jornada se ejecutó: un "no se ejecutó" no tiene día que documentar, y
    // el backend las descarta igual (ver subirFotos en lib/odoo/partes.ts).
    fotos: ejecutado
      ? b.fotos.map((f) => ({ nombre: f.nombre, base64: f.base64, momento: f.momento }))
      : [],
  } as DatosCierre;
}

function Contenido() {
  const params = useSearchParams();
  // La fecha por defecto es AYER: se carga a primera hora lo del día anterior. Si abriera
  // en hoy, la primera acción de cada mañana sería corregir la fecha.
  const [fecha, setFecha] = useState(
    () => params.get("fecha") ?? iso(subDays(new Date(), 1)),
  );
  const resaltar = params.get("fecha") ? Number(params.get("ot")) : 0;

  const { data, isLoading, isFetching } = useJornadas(fecha);
  const cerrar = useCerrarJornada();
  const reprogramar = useReprogramar();
  const noPlanificada = useJornadaNoPlanificada();

  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>({});
  const [vencidasAbierto, setVencidasAbierto] = useState(false);
  const [guardando, setGuardando] = useState<{ hechas: number; total: number } | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [nueva, setNueva] = useState({ otId: "", cuadrillaId: "", fraccion: "1" });

  // Memorizadas porque el pie las usa en un useMemo: sin esto, `?? []` crea un array
  // nuevo en cada render y el total se recalcularía siempre.
  const jornadas = useMemo(() => data?.jornadas ?? [], [data]);
  const sinConfirmar = useMemo(() => data?.sinConfirmar ?? [], [data]);
  const cuadrillas = useMemo(() => data?.cuadrillas ?? [], [data]);
  const otsDisponibles = useMemo(() => data?.otsDisponibles ?? [], [data]);

  const pendientes = jornadas.filter((j) => !j.parte);
  const cargadas = jornadas.filter((j) => j.parte);

  // El pie suma SÓLO lo cargado y sube a medida que se carga. Sirve de control: si al
  // terminar la mañana el total no se parece al de un día normal, algo se cargó mal.
  const totales = useMemo(() => {
    const hhGuardadas = cargadas.reduce((s, j) => s + (j.parte?.horasHombre ?? 0), 0);
    const hhBorrador = Object.entries(borradores).reduce((s, [id, b]) => {
      const j = jornadas.find((x) => x.asignacionId === Number(id));
      return j && !j.parte && b.estado === "ejecutado" ? s + horasHombreDe(b) : s;
    }, 0);
    const fletes =
      cargadas.reduce((s, j) => s + (j.parte?.flete?.cantidad ?? 0), 0) +
      Object.entries(borradores).reduce((s, [id, b]) => {
        const j = jornadas.find((x) => x.asignacionId === Number(id));
        return j && !j.parte ? s + (Number(b.fletes) || 0) : s;
      }, 0);
    return { hh: hhGuardadas + hhBorrador, fletes };
  }, [cargadas, borradores, jornadas]);

  function abrir(j: JornadaListado) {
    setAbiertas((prev) => ({ ...prev, [j.asignacionId]: !prev[j.asignacionId] }));
    if (!j.parte && !borradores[j.asignacionId]) {
      setBorradores((prev) => ({ ...prev, [j.asignacionId]: borradorDe(j) }));
    }
  }

  /** Atajo para el día sin novedades: llena SÓLO las filas pendientes con el plan. */
  function confirmarComoPlanificado() {
    const nuevos: Record<number, Borrador> = { ...borradores };
    let sinDotacion = 0;
    for (const j of pendientes) {
      if (nuevos[j.asignacionId]) continue;
      nuevos[j.asignacionId] = borradorDe(j);
      if (j.personalPrevisto <= 0) sinDotacion++;
    }
    setBorradores(nuevos);
    if (sinDotacion > 0) {
      toast.warning(`${sinDotacion} obra(s) sin dotación cargada`, {
        description: "Hay que completar la cantidad de personas a mano: sin eso el parte va con 0 horas-hombre.",
      });
    }
  }

  async function guardarTodo() {
    const aGuardar = pendientes
      .map((j) => ({ j, b: borradores[j.asignacionId] }))
      .filter((x): x is { j: JornadaListado; b: Borrador } => !!x.b);

    if (aGuardar.length === 0) {
      toast.info("No hay nada para guardar");
      return;
    }
    const conError = aGuardar.filter((x) => erroresDe(x.b, x.j).length > 0);
    if (conError.length > 0) {
      for (const x of conError) setAbiertas((prev) => ({ ...prev, [x.j.asignacionId]: true }));
      toast.error(`${conError.length} fila(s) incompletas`, {
        description: erroresDe(conError[0].b, conError[0].j).join(" · "),
      });
      return;
    }

    // Se guardan de a una y no en paralelo: cada parte son varias escrituras a Odoo, y
    // cinco a la vez multiplicadas por la cola del servidor terminan en 429.
    setGuardando({ hechas: 0, total: aGuardar.length });
    let ok = 0;
    // Las fotos se suben de a una y pueden fallar sin voltear el parte. Si eso no se
    // avisa, la pantalla dice "guardado" y las fotos no están: quien las sacó se entera
    // meses después, cuando el cliente reclama y no hay con qué contestarle.
    const fotosFallidas: string[] = [];
    for (const { j, b } of aGuardar) {
      try {
        const r = await cerrar.mutateAsync({
          asignacionId: j.asignacionId,
          datos: aDatosCierre(b, j),
          finalizarOt: b.finalizarOt === true,
        });
        fotosFallidas.push(...(r?.fotosFallidas ?? []));
        if (b.estado === "no_ejecutado" && b.reprogramarA) {
          await reprogramar.mutateAsync({ asignacionId: j.asignacionId, reprogramarA: b.reprogramarA });
        }
        ok++;
        setGuardando({ hechas: ok, total: aGuardar.length });
      } catch (e) {
        toast.error(`No se pudo guardar ${j.titulo.slice(0, 40)}`, {
          description: e instanceof Error ? e.message : String(e),
        });
        break;
      }
    }
    setGuardando(null);
    if (ok > 0) {
      setBorradores({});
      setAbiertas({});
      toast.success(`${ok} parte(s) guardado(s)`);
      if (fotosFallidas.length > 0) {
        toast.warning(
          `${fotosFallidas.length} foto(s) no se subieron`,
          { description: fotosFallidas.join(", ") },
        );
      }
    }
  }

  const fechaLabel = format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es });

  return (
    // max-w-6xl y no ancho completo: la fila plegada gana lugar para el nombre de la obra
    // —que es lo que se lee de un vistazo— pero el bloque desplegado sigue teniendo un
    // límite. Sin tope, en un monitor ancho el textarea de notas queda de 1600px y leer
    // un renglón obliga a barrer la cabeza de lado a lado.
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-[15px] font-medium capitalize">Partes del {fechaLabel}</h1>
          <p className="text-[12px] text-muted-foreground">
            {jornadas.length} jornada{jornadas.length === 1 ? "" : "s"} · {pendientes.length} sin cargar
            {isFetching && " · actualizando…"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-7" onClick={() => setFecha(iso(subDays(parseISO(fecha), 1)))} aria-label="Día anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFecha(iso(subDays(new Date(), 1)))}>
            Ayer
          </Button>
          <Button variant="outline" size="icon" className="size-7" onClick={() => setFecha(iso(addDays(parseISO(fecha), 1)))} aria-label="Día siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border">
          {jornadas.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              {fecha > iso(new Date())
                ? "Es una fecha futura: todavía no hay jornadas para cargar."
                : "No hay jornadas confirmadas para este día."}
            </p>
          ) : (
            jornadas.map((j) => (
              <FilaJornada
                key={j.asignacionId}
                jornada={j}
                cuadrillas={cuadrillas}
                borrador={borradores[j.asignacionId] ?? null}
                abierta={!!abiertas[j.asignacionId]}
                resaltada={resaltar === j.otId}
                onToggle={() => abrir(j)}
                onCambio={(b) => setBorradores((prev) => ({ ...prev, [j.asignacionId]: b }))}
              />
            ))
          )}

          {/* Escape para el trabajo de urgencia: se fue a una obra que no estaba en el
              tablero. Crea la jornada y la fila queda pendiente para cargarle el parte. */}
          <div className="border-t px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => setAgregando(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Agregar jornada no planificada
            </Button>
          </div>

          {/* Tentativas que ya pasaron. Confirmar es un gesto que se olvida; si no
              aparecieran, una jornada trabajada no tendría dónde cargarse y su costo de
              mano de obra nunca entraría al sistema. */}
          {sinConfirmar.length > 0 && (
            <div className="border-t">
              <button
                type="button"
                onClick={() => setVencidasAbierto((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground hover:bg-muted/40"
              >
                {vencidasAbierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronDer className="h-3.5 w-3.5" />}
                Sin confirmar que ya pasaron
                <span className="rounded-full bg-muted px-1.5 text-[10px]">{sinConfirmar.length}</span>
              </button>
              {vencidasAbierto &&
                sinConfirmar.map((j) => (
                  <FilaJornada
                    key={j.asignacionId}
                    jornada={j}
                    cuadrillas={cuadrillas}
                    borrador={borradores[j.asignacionId] ?? null}
                    abierta={!!abiertas[j.asignacionId]}
                    resaltada={false}
                    onToggle={() => abrir(j)}
                    onCambio={(b) => setBorradores((prev) => ({ ...prev, [j.asignacionId]: b }))}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={agregando} onOpenChange={setAgregando}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">Jornada no planificada</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Se fue a una obra que no estaba en el tablero. Se agrega la jornada del{" "}
              {format(parseISO(fecha), "d 'de' MMMM", { locale: es })} y después le cargás el parte.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium">Obra</span>
              <Select
                items={Object.fromEntries(otsDisponibles.map((o) => [String(o.id), o.titulo]))}
                value={nueva.otId}
                onValueChange={(v) => v && setNueva((n) => ({ ...n, otId: v }))}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Elegí la obra" /></SelectTrigger>
                <SelectContent>
                  {otsDisponibles.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium">Cuadrilla</span>
                <Select
                  items={Object.fromEntries(cuadrillas.map((c) => [String(c.id), c.nombre]))}
                  value={nueva.cuadrillaId}
                  onValueChange={(v) => v && setNueva((n) => ({ ...n, cuadrillaId: v }))}
                >
                  <SelectTrigger className="h-8"><SelectValue placeholder="Elegí" /></SelectTrigger>
                  <SelectContent>
                    {cuadrillas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium">Cuánto ocupó</span>
                <Select
                  items={Object.fromEntries(FRACCIONES.map((f) => [f.value, f.detalle]))}
                  value={nueva.fraccion}
                  onValueChange={(v) => v && setNueva((n) => ({ ...n, fraccion: v }))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FRACCIONES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.detalle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAgregando(false)}>Cancelar</Button>
            <Button
              className="ml-auto"
              style={{ backgroundColor: CORAL, color: "#fff" }}
              disabled={!nueva.otId || noPlanificada.isPending}
              onClick={() => {
                noPlanificada.mutate(
                  {
                    otId: Number(nueva.otId),
                    fecha,
                    cuadrillaId: nueva.cuadrillaId ? Number(nueva.cuadrillaId) : null,
                    fraccion: nueva.fraccion,
                  },
                  {
                    onSuccess: () => {
                      setAgregando(false);
                      setNueva({ otId: "", cuadrillaId: "", fraccion: "1" });
                      toast.success("Jornada agregada: cargale el parte");
                    },
                    onError: (e) => toast.error("No se pudo agregar", { description: e.message }),
                  },
                );
              }}
            >
              {noPlanificada.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
        <p className="text-[12px]">
          <span className="font-medium">{cargadas.length} cargadas</span>
          <span className="text-muted-foreground"> · {totales.hh} horas-hombre · {totales.fletes} fletes</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          {/* Atajo, nunca la acción principal: usado sin mirar mete horas-hombre
              inventadas, que van derecho al costo de la obra. */}
          <Button variant="outline" size="sm" onClick={confirmarComoPlanificado} disabled={pendientes.length === 0}>
            Confirmar como planificado
          </Button>
          <Button
            size="sm"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            onClick={guardarTodo}
            disabled={!!guardando}
          >
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {guardando ? `Guardando ${guardando.hechas + 1} de ${guardando.total}…` : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PartesPage() {
  // useSearchParams necesita un límite de Suspense para no volver dinámica toda la ruta.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Contenido />
    </Suspense>
  );
}
