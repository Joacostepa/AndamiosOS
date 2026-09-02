"use client";

import { use } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ExternalLink, FileBarChart, MoreHorizontal, Square } from "lucide-react";
import { useOrdenOdoo } from "@/hooks/use-ordenes-odoo";
import { MarcarUrgencia } from "@/components/ordenes/marcar-urgencia";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { colorTipo, semaforo, CORAL } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import { formatHora } from "@/lib/tablero/horas";
import { MOTIVOS_NO_EJEC } from "@/lib/tablero/tipos-parte";

// Ficha de la Orden de Trabajo.
//
// Es la pantalla que faltaba: hasta ahora el panel del tablero terminaba en "Abrir la OT
// en Odoo". Todo lo que muestra YA está calculado en Odoo, no se computa nada nuevo.

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

const PESOS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const DEC = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border p-3">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[14px] font-medium tabular-nums">{valor}</p>
    </div>
  );
}

export default function FichaOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: ot, isLoading, error } = useOrdenOdoo(Number(id));

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !ot) {
    return (
      <div className="space-y-3">
        <Link href="/ordenes-trabajo" className="text-[12px] text-muted-foreground hover:underline">
          ← Volver a Órdenes de Trabajo
        </Link>
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la orden. {error instanceof Error ? error.message : ""}
        </p>
      </div>
    );
  }

  const tipo = colorTipo(ot.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const sem = semaforo(ot.habSemaforo);
  const partes = partesTitulo(ot.titulo);
  const cerradas = ot.jornadasPlanificadas.filter((j) => j.parteId).length;

  // El desvío viene de Odoo como TEXTO ("+44%"). Ya llega parseado del servidor, porque
  // compararlo como string pintaría de rojo un desvío del 9% (lexicográficamente "+9%" es
  // mayor que "+25%").
  const colorDesvio =
    ot.desvioPct === null
      ? "var(--muted-foreground)"
      : ot.desvioPct > 25
        ? "#B42318"
        : ot.desvioPct > 0
          ? "#854F0B"
          : "#27500A";

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Link href="/ordenes-trabajo" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" />
        Órdenes de Trabajo
      </Link>

      <div className="flex items-start gap-2">
        <IconoTipo className="mt-1 h-5 w-5 shrink-0" style={{ color: tipo.text }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-medium leading-tight">{partes.principal}</h1>
          <p className="text-[12px] text-muted-foreground">
            {[partes.tipo, partes.numero, partes.cliente].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--muted)" }}
        >
          {ot.estado.replace("_", " ")}
        </span>
      </div>

      {/* La urgencia va arriba de todo y no dentro de un bloque: es lo único de esta
          pantalla que se ESCRIBE, y es lo que cambia dónde aparece la OT en el tablero. */}
      <div className="flex justify-end">
        <MarcarUrgencia otId={ot.id} urgencia={ot.urgencia} motivo={ot.motivoUrgencia} />
      </div>

      {/* ── 1. Estimado contra real ── */}
      <Bloque titulo="Estimado contra real">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato
            label="Jornadas"
            valor={
              <>
                {DEC.format(ot.jornadas)} est.
                <span className="text-[12px] font-normal text-muted-foreground">
                  {" "}· {ot.jornadasPlanificadas.length} planif. · {cerradas} cerradas
                </span>
              </>
            }
          />
          <Dato label="Horas-hombre" valor={DEC.format(ot.horasHombre)} />
          <Dato
            label="Estimadas"
            valor={ot.jornadasHombreEstimadas ? DEC.format(ot.jornadasHombreEstimadas) : "—"}
          />
          <Dato
            label="Desvío"
            valor={<span style={{ color: colorDesvio }}>{ot.desvioTexto ?? "—"}</span>}
          />
        </div>
        {ot.jornadas === 1 && ot.jornadasPlanificadas.length > 1 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            La estimación de 1 jornada es el valor por defecto de la importación, no una
            estimación real: el desvío de arriba está midiendo contra ese número.
          </p>
        )}
      </Bloque>

      {/* ── 2. Costo acumulado ── */}
      <Bloque titulo="Costo acumulado">
        <div className="grid grid-cols-3 gap-3">
          <Dato label="Mano de obra" valor={PESOS.format(ot.costoManoObra)} />
          <Dato label="Fletes" valor={PESOS.format(ot.costoFletes)} />
          <Dato label="Total" valor={PESOS.format(ot.costoTotal)} />
        </div>
        {/* No se muestra margen: el margen vive en la venta, no en la OT, y una venta
            puede tener varias OTs. Acá se leería como el margen de esta obra. */}
      </Bloque>

      {/* ── 3. Jornadas ── */}
      <Bloque titulo={`Jornadas (${ot.jornadasPlanificadas.length})`}>
        {ot.jornadasPlanificadas.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Todavía no está en el tablero. Arrastrala desde la bandeja de sin asignar.
          </p>
        ) : (
          <div className="space-y-1">
            {ot.jornadasPlanificadas.map((j) => {
              const pasada = j.fecha < new Date().toISOString().slice(0, 10);
              const noEjec = j.parteEstado === "no_ejecutado";
              return (
                <div key={j.asignacionId} className="flex items-center gap-2 text-[12px]">
                  {j.parteId ? (
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: noEjec ? "#D92D20" : "#639922" }} />
                  ) : (
                    <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeDasharray="3 2" />
                  )}
                  <span className="w-28 shrink-0 tabular-nums">
                    {format(parseISO(j.fecha), "EEE d MMM", { locale: es })}
                  </span>
                  <span className="w-24 shrink-0 truncate text-muted-foreground">
                    {j.cuadrilla ?? "sin cuadrilla"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {j.parteId ? (
                      noEjec ? (
                        <span style={{ color: "#B42318" }}>
                          no ejecutada{" "}
                          {MOTIVOS_NO_EJEC.find((m) => m.value === j.parteEstado)?.label ?? ""}
                        </span>
                      ) : (
                        `${j.personas ?? "?"}p · ${formatHora(j.horaDesde ?? 8)}–${formatHora(j.horaHasta ?? 17)} · ${DEC.format(j.horasHombre ?? 0)} hh`
                      )
                    ) : pasada ? (
                      <Link href={`/partes?fecha=${j.fecha}&ot=${ot.id}`} className="hover:underline" style={{ color: CORAL }}>
                        cargar el parte
                      </Link>
                    ) : (
                      j.estado
                    )}
                  </span>
                </div>
              );
            })}
            <div className="pt-1">
              <Link href="/planificacion">
                <Button variant="outline" size="sm">Ver en el tablero</Button>
              </Link>
            </div>
          </div>
        )}
      </Bloque>

      {/* ── 4. Habilitación ── */}
      <Bloque titulo="Habilitación">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Semáforo</p>
            <p className="flex items-center gap-1.5 text-[13px] font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sem.color }} />
              {sem.label}
            </p>
          </div>
          <Dato label="Etapa" valor={ot.habEtapa ?? "—"} />
          <Dato
            label="Vence"
            valor={ot.habVencimiento ? format(parseISO(ot.habVencimiento), "d MMM yyyy", { locale: es }) : "—"}
          />
          <Dato label="Documentos" valor={ot.cantDocs || "—"} />
        </div>
        {/* Sólo lectura acá: editarla es el módulo Habilitaciones, todavía sin diseñar. */}
      </Bloque>

      {/* ── 5. Comercial ── */}
      <Bloque titulo="Comercial">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Dato label="Contacto en obra" valor={ot.contactoObra ?? "—"} />
            <Dato label="Teléfono" valor={ot.telObra ?? "—"} />
          </div>
          {ot.fechaComprometida && (
            <Dato
              label="Comprometida al cliente"
              valor={format(parseISO(ot.fechaComprometida), "d MMM yyyy", { locale: es })}
            />
          )}
          {/* Qué estructura hay que montar o bajar. Va ANTES de las observaciones porque
              son dos cosas distintas y ésta es la que define el trabajo; observaciones es
              cómo llegar y con qué restricciones. */}
          <div>
            <p className="text-[11px] text-muted-foreground">Qué hay que ejecutar</p>
            <p className="whitespace-pre-wrap text-[13px]">
              {ot.detalleTecnico ?? <span className="text-muted-foreground">Sin detalle técnico cargado</span>}
            </p>
          </div>
          {ot.observaciones && (
            <div>
              <p className="text-[11px] text-muted-foreground">Observaciones</p>
              <p className="whitespace-pre-wrap text-[13px]">{ot.observaciones}</p>
            </div>
          )}
          {/* Acá el enlace a Odoo SÍ corresponde: la venta es de Comercial y no se
              gestiona desde esta app. */}
          {ot.urlVenta && (
            <a
              href={ot.urlVenta}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] hover:underline"
              style={{ color: CORAL }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {ot.ordenVenta ?? "Ver la venta en Odoo"}
            </a>
          )}
          {/* El informe se indexa por VENTA y no por OT: el armado y el desarme de la
              misma obra comparten informe, igual que comparten permiso. El enlace se
              ofrece siempre — si la obra todavía no cerró, la pantalla lo dice. */}
          {ot.ventaId && (
            <Link
              href={`/informes-obra/${ot.ventaId}`}
              className="inline-flex items-center gap-1 text-[12px] hover:underline"
              style={{ color: CORAL }}
            >
              <FileBarChart className="h-3.5 w-3.5" />
              Ver el informe de esta obra
            </Link>
          )}
        </div>
      </Bloque>
    </div>
  );
}
