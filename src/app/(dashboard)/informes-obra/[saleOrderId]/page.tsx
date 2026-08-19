"use client";

import { use, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, ArrowDown, ArrowUp, FileBarChart, Loader2, MoreHorizontal, RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useInformeObra, useRegenerarInforme } from "@/hooks/use-informes-obra";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { colorTipo } from "@/lib/tablero/colores";
import { COSTEO_CORTO, type DatosInforme, type InformeObra } from "@/lib/informes-obra/tipos";

// El informe de una obra.
//
// Arranca por lo que salió distinto de lo previsto y por los huecos de registro, y
// termina en qué usar para cotizar. Todo lo demás es contexto: un informe que sólo lista
// lo que pasó no lo lee nadie dos veces.

const money = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: 0,
});
const dec = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

export default function InformeObraPage({
  params,
}: {
  params: Promise<{ saleOrderId: string }>;
}) {
  const { saleOrderId: raw } = use(params);
  const saleOrderId = Number(raw);
  const [version, setVersion] = useState<number | undefined>(undefined);
  const { data, isLoading, error } = useInformeObra(saleOrderId, version);
  const regenerar = useRegenerarInforme(saleOrderId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Volver />
        <EmptyState
          icon={FileBarChart}
          title="Esta obra no tiene informe"
          description={
            error instanceof Error
              ? error.message
              : "Se genera solo cuando la venta pasa a Desarmado, o a mano desde acá."
          }
        />
      </div>
    );
  }

  const { informe, versiones } = data;
  const d = informe.datos;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Volver />
        <div className="ml-auto flex items-center gap-2">
          {versiones.length > 1 && (
            <Select
              value={String(version ?? versiones[0])}
              onValueChange={(v) => v && setVersion(Number(v))}
            >
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versiones.map((v) => (
                  <SelectItem key={v} value={String(v)}>Versión {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={regenerar.isPending}
            onClick={() =>
              regenerar.mutate(undefined, {
                onSuccess: (r) => {
                  setVersion(undefined);
                  toast.success(`Regenerado · versión ${r.informe.version}`);
                },
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : "No se pudo regenerar"),
              })
            }
            title="Vuelve a leer Odoo y crea una versión nueva; la actual se conserva"
          >
            {regenerar.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Regenerar
          </Button>
        </div>
      </div>

      <PageHeader
        title={d.venta.direccion ?? d.venta.nombre}
        description={[d.venta.cliente, d.venta.nombre, d.venta.tecnico]
          .filter(Boolean)
          .join(" · ")}
      />

      {informe.reabiertaEn && (
        <p className="rounded-md border px-3 py-2 text-[12px]" style={{ backgroundColor: "#FEF6E7" }}>
          Este informe fue sellado el{" "}
          {format(parseISO(informe.reabiertaEn), "d MMM yyyy", { locale: es })} porque la obra
          volvió a abrirse. Refleja lo que se sabía hasta esa fecha.
        </p>
      )}

      <Inconsistencias informe={informe} />
      <Encabezado datos={d} />
      <Estimado datos={d} />
      <Economia datos={d} />
      <ParaCotizar datos={d} />
      {d.sectores && <Sectores datos={d} />}
      <Cronologia datos={d} />
      <Registro datos={d} />
    </div>
  );
}

function Volver() {
  return (
    <Link
      href="/informes-obra"
      className="flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Informes de obra
    </Link>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border">
      <header className="border-b px-3 py-2">
        <h2 className="text-[13px] font-semibold">{titulo}</h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** Arriba de todo: el informe no bloquea por inconsistencias, las lista. */
function Inconsistencias({ informe }: { informe: InformeObra }) {
  const corto = informe.estadoCosteo !== "completo"
    ? COSTEO_CORTO[informe.estadoCosteo as keyof typeof COSTEO_CORTO]
    : null;

  if (!corto && informe.inconsistencias.length === 0) return null;

  return (
    <section
      className="space-y-2 rounded-md border px-3 py-2.5"
      style={{ backgroundColor: "#FDECEA", borderColor: "#F1B0AA" }}
    >
      {corto && <p className="text-[13px] font-medium">{corto}</p>}
      <ul className="space-y-1">
        {informe.inconsistencias.map((inc, i) => (
          <li key={i} className="flex gap-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#912018" }} />
            <span>{inc.detalle}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="text-[14px] font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function Encabezado({ datos: d }: { datos: DatosInforme }) {
  const f = (x: string | null) => (x ? format(parseISO(x), "d MMM yyyy", { locale: es }) : "—");
  return (
    <Seccion titulo="La obra">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Dato etiqueta="Desde" valor={f(d.periodo.desde)} />
        <Dato etiqueta="Hasta" valor={f(d.periodo.hasta)} />
        <Dato etiqueta="Duración" valor={d.periodo.dias !== null ? `${d.periodo.dias} d` : "—"} />
        <Dato etiqueta="OTs" valor={d.periodo.ots} />
        {/* Visitas y partes SEPARADOS: dos partes del mismo día son una sola visita, un
            traslado y una cuadrilla tomada. Mostrar sólo partes infla el esfuerzo. */}
        <Dato etiqueta="Visitas" valor={d.periodo.visitas} />
        <Dato etiqueta="Partes" valor={d.periodo.partes} />
      </dl>
    </Seccion>
  );
}

/**
 * §2 es CONDICIONAL: `estimado === null` significa que alguna OT no tiene duración
 * estimada, y entonces no se muestra ningún porcentaje. Un desvío calculado contra el
 * fallback de `x_jornadas_num` —el `1` por default de la importación— parece información
 * y es peor que ningún desvío.
 */
function Estimado({ datos: d }: { datos: DatosInforme }) {
  if (!d.estimado) {
    return (
      <Seccion titulo="Lo estimado contra lo real">
        <p className="text-[13px] text-muted-foreground">
          Sin estimación previa: las OTs de esta obra se crearon antes de que la duración
          estimada fuera obligatoria.
        </p>
      </Seccion>
    );
  }

  const e = d.estimado;
  const color = (v: number) => (Math.abs(v) > 50 ? { color: "#B42318" } : undefined);

  return (
    <Seccion titulo="Lo estimado contra lo real">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Jornadas estimadas" valor={dec.format(e.jornadasEstimadas)} />
        <Dato
          etiqueta="Visitas reales"
          valor={
            <span style={color(e.desvioVisitas)}>
              {e.visitasReales} ({e.desvioVisitas > 0 ? "+" : ""}{e.desvioVisitas}%)
            </span>
          }
        />
        <Dato etiqueta="Horas-hombre estimadas" valor={dec.format(e.horasHombreEstimadas)} />
        <Dato
          etiqueta="Horas-hombre reales"
          valor={
            <span style={color(e.desvioHoras)}>
              {dec.format(e.horasHombreReales)} ({e.desvioHoras > 0 ? "+" : ""}{e.desvioHoras}%)
            </span>
          }
        />
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Estimado en horas-hombre = jornadas × 5 personas × 8 h. La cuadrilla normal es de 5
        (54,8% del histórico) y la jornada completa son 8 h por definición de la escala.
      </p>
    </Seccion>
  );
}

function Economia({ datos: d }: { datos: DatosInforme }) {
  const e = d.economia;
  return (
    <Seccion titulo="Economía">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Dato etiqueta="Facturado neto" valor={money.format(e.facturadoNeto)} />
        <Dato etiqueta="Mano de obra" valor={money.format(e.costoManoObra)} />
        <Dato etiqueta="Fletes" valor={money.format(e.costoFletes)} />
        <Dato etiqueta="Costo operativo" valor={money.format(e.costoOperativo)} />
        <Dato etiqueta="Contribución" valor={money.format(e.margenContribucion)} />
        <Dato etiqueta="Margen" valor={`${dec.format(e.margenPct)}%`} />
      </dl>
      {/* OBLIGATORIA, no opcional. En alquiler de andamios el material ES el negocio: si
          el informe dice "91,4% de margen" sin esto, alguien cotiza la próxima con ese
          número en la cabeza. */}
      <p className="mt-3 rounded border px-2.5 py-2 text-[11px] text-muted-foreground">
        El costo incluye sólo mano de obra y fletes. No incluye el material inmovilizado
        durante la obra, amortización ni gestoría. <strong>Es contribución, no
        rentabilidad.</strong>
      </p>
    </Seccion>
  );
}

/** La sección que justifica el informe: lo que hay que mirar antes de cotizar la próxima. */
function ParaCotizar({ datos: d }: { datos: DatosInforme }) {
  const c = d.paraCotizar;
  return (
    <Seccion titulo="Para la próxima cotización">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Dato
          etiqueta="Costo por visita"
          valor={c.costoPorVisita !== null ? money.format(c.costoPorVisita) : "—"}
        />
        <Dato
          etiqueta="Costo por hora-hombre"
          valor={c.costoPorHoraHombre !== null ? money.format(c.costoPorHoraHombre) : "—"}
        />
        <Dato
          etiqueta="Ritmo entre visitas"
          valor={c.ritmoDias !== null ? `${dec.format(c.ritmoDias)} d` : "—"}
        />
        <Dato
          etiqueta="Hueco máximo"
          valor={c.huecoMaximoDias !== null ? `${c.huecoMaximoDias} d` : "—"}
        />
        <Dato
          etiqueta="Fletes"
          valor={`${c.fletesTotales} (${c.fletesEnArmado} armado / ${c.fletesEnDesarme} desarme)`}
        />
      </dl>
      {c.tiposEstructura.length > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Estructura: {c.tiposEstructura.join(" · ")}
        </p>
      )}
      {c.ritmoDias !== null && c.huecoMaximoDias !== null && c.huecoMaximoDias > 30 && (
        <p className="mt-2 text-[12px]">
          La obra no se ejecutó seguida: hubo un hueco de {c.huecoMaximoDias} días entre
          visitas. Se acompasó al avance del cliente, y cada visita extra es un traslado y
          una cuadrilla tomada un día.
        </p>
      )}
    </Seccion>
  );
}

function Sectores({ datos: d }: { datos: DatosInforme }) {
  return (
    <Seccion titulo="Por tipo de estructura">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase text-muted-foreground">
            <th className="pb-1 font-medium">Estructura</th>
            <th className="pb-1 text-right font-medium">Partes</th>
            <th className="pb-1 text-right font-medium">Horas-hombre</th>
          </tr>
        </thead>
        <tbody>
          {d.sectores!.map((s) => (
            <tr key={s.nombre} className="border-t">
              <td className="py-1">{s.nombre}</td>
              <td className="py-1 text-right tabular-nums">{s.partes}</td>
              <td className="py-1 text-right tabular-nums">{dec.format(s.horasHombre)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Seccion>
  );
}

function Cronologia({ datos: d }: { datos: DatosInforme }) {
  return (
    <Seccion titulo={`Cronología · ${d.jornadas.length} parte(s) en ${d.periodo.visitas} visita(s)`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-muted-foreground">
              <th className="pb-1 font-medium">Fecha</th>
              <th className="pb-1 font-medium">Cuadrilla</th>
              <th className="pb-1 font-medium">Tipo</th>
              <th className="pb-1 text-right font-medium">hh</th>
              <th className="pb-1 text-right font-medium">Fletes</th>
              <th className="pb-1 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {d.jornadas.map((j) => {
              const tipo = colorTipo(j.tipo);
              const Icono = ICONO_TIPO[tipo.icono];
              return (
                <tr key={j.parteId} className="border-t align-top">
                  <td className="py-1 whitespace-nowrap">
                    {format(parseISO(j.fecha), "d MMM yy", { locale: es })}
                  </td>
                  <td className="py-1">{j.cuadrilla ?? "—"}</td>
                  <td className="py-1">
                    <span className="flex items-center gap-1" style={{ color: tipo.text }}>
                      <Icono className="h-3 w-3" aria-hidden />
                      {j.tipo}
                    </span>
                  </td>
                  <td className="py-1 text-right tabular-nums">{dec.format(j.horasHombre)}</td>
                  <td className="py-1 text-right tabular-nums">{j.fletes || "—"}</td>
                  <td className="py-1 text-muted-foreground">{j.nota ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

function Registro({ datos: d }: { datos: DatosInforme }) {
  return (
    <Seccion titulo="Incidencias y registro">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Incidencias" valor={d.registro.incidencias.length} />
        <Dato etiqueta="Fotos" valor={d.registro.fotos} />
        <Dato etiqueta="Habilitación" valor={d.registro.habilitacionEtapa ?? "—"} />
        <Dato etiqueta="Semáforo" valor={d.registro.habilitacionSemaforo ?? "—"} />
      </dl>

      {d.registro.incidencias.length > 0 && (
        <ul className="mt-3 space-y-1">
          {d.registro.incidencias.map((i, n) => (
            <li key={n} className="text-[12px]">
              <span className="font-medium">{i.tipo}</span>
              {i.fecha && ` · ${format(parseISO(i.fecha), "d MMM yy", { locale: es })}`}
              {i.descripcion && ` — ${i.descripcion}`}
            </li>
          ))}
        </ul>
      )}

      {d.registro.fotos === 0 && (
        <p className="mt-3 text-[12px]" style={{ color: "#912018" }}>
          Sin ninguna foto: no hay constancia del estado de entrega, que es lo primero que
          se pide ante un reclamo.
        </p>
      )}
    </Seccion>
  );
}
