"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpDown, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APOYO, OK_TEXTO, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { FRACCIONES, fraccionLabel, redondearFraccion, type FraccionStr } from "@/lib/tablero/fracciones";
import { diasParaApoyo, type DiaDeObra } from "@/lib/tablero/apoyo";
import { nombrePropio } from "@/lib/tablero/titulo";
import { cn } from "@/lib/utils";

// La cuadrilla de APOYO desde la ficha de la obra (docs/tablero-planificacion/apoyo.md).
//
// Vive en la ficha y no en el menú de la tarjeta porque sumar un apoyo pide tres datos
// —qué cuadrilla, qué días, cuánto— y un menú no tiene dónde mostrar si la cuadrilla
// elegida queda sobrecargada. Es el mismo criterio que "Planificar…" desde la bandeja: la
// ficha es donde se decide, la tarjeta es donde se ve.
//
// LO QUE NO HACE, a propósito (decisiones de Joaquín, 17/10):
//   - No achica la obra sola cuando el apoyo va todos los días: lo ofrece el tablero al
//     sumar, con un aviso, y la duración la decide Operaciones.
//   - No mueve el apoyo de día: el apoyo va con la obra. Pasarlo a otra cuadrilla se hace
//     arrastrando su tarjeta en el mismo día.

/** Un apoyo de la obra, juntado por cuadrilla, como lo muestra la ficha. */
export type ApoyoDeLaObra = {
  cuadrillaId: number | null;
  nombre: string;
  dias: { id: number; fecha: string; fraccion: number; parteId: number | null }[];
};

export type DatosApoyoOt = {
  /** Los días de la obra con cuadrilla PRINCIPAL, en el rango cargado, en orden. */
  dias: DiaDeObra[];
  /** Los apoyos que ya tiene, en el rango cargado. */
  apoyos: ApoyoDeLaObra[];
  cuadrillas: { id: number; nombre: string }[];
  /** El día con el que arranca elegido: el de la tarjeta que se abrió. */
  diaInicial: string | null;
  /** Cuánto tiene ocupado HOY esa cuadrilla ese día (suma de fracciones). */
  ocupacion: (cuadrillaId: number, fecha: string) => number;
};

const DIA = (f: string) => format(parseISO(f), "EEE d", { locale: es });
const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function ApoyoOt({
  datos,
  onSumar,
  onQuitar,
  onHacerPrincipal,
}: {
  datos: DatosApoyoOt;
  onSumar: (cuadrillaId: number, fechas: string[], fraccion: FraccionStr) => void;
  onQuitar: (apoyo: ApoyoDeLaObra, ids: number[]) => void;
  /** Intercambia los roles ese día (apoyo.md: "se rompe el camión de la principal"). */
  onHacerPrincipal?: (apoyoId: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // Un día con parte cargado también admite apoyo (queda vinculado a ese parte); el que
  // salió "no ejecutado", no: ese día no se trabajó.
  const puedeSumar = datos.dias.some((d) => !d.parteNoEjecutado);

  if (datos.apoyos.length === 0 && !puedeSumar) return null;

  return (
    <div className="space-y-1.5">
      {datos.apoyos.map((a) => (
        <div key={a.cuadrillaId ?? "sin"} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: APOYO.fondo, color: APOYO.texto, borderColor: APOYO.borde }}
          >
            <Users className="h-3 w-3" />
            Apoyo
          </span>
          <span className="font-medium">{nombrePropio(a.nombre)}</span>
          {a.dias.map((d) => (
            <span
              key={d.id}
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {DIA(d.fecha)}
              {d.fraccion < 1 ? ` · ${fraccionLabel(d.fraccion)}` : ""}
              {/* Con parte ya trabajó: sacarlo borraría el rastro de que fue. Ver "no fue"
                  en el parte, que es donde se dice. */}
              {/* HACER PRINCIPAL, de a un día: el apoyo pasa a llevar la obra y la principal
                  queda de apoyo. Sólo sin parte (con parte los roles ya quedaron escritos)
                  y si ese día hay principal con quien intercambiar. */}
              {/* En pantallas táctiles los dos botones crecen a ~32px y se separan: están
                  pegados, y "quitar" borra la jornada. */}
              {onHacerPrincipal && d.parteId == null && d.id > 0 && datos.dias.some((x) => x.fecha === d.fecha && !x.conParte) && (
                <button
                  type="button"
                  className="ml-0.5 rounded p-0.5 hover:bg-foreground/10 hover:text-foreground pointer-coarse:ml-1.5 pointer-coarse:p-2.5"
                  onClick={() => onHacerPrincipal(d.id)}
                  title={`Hacer principal a ${nombrePropio(a.nombre)} el ${DIA(d.fecha)}`}
                  aria-label={`Hacer principal a ${nombrePropio(a.nombre)} el ${DIA(d.fecha)}`}
                >
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              )}
              {d.parteId == null && d.id > 0 && (
                <button
                  type="button"
                  className="ml-0.5 rounded p-0.5 hover:bg-foreground/10 hover:text-foreground pointer-coarse:ml-1.5 pointer-coarse:p-2.5"
                  onClick={() => onQuitar(a, [d.id])}
                  title={`Quitar el apoyo de ${nombrePropio(a.nombre)} el ${DIA(d.fecha)}`}
                  aria-label={`Quitar el apoyo de ${nombrePropio(a.nombre)} el ${DIA(d.fecha)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ))}

      {puedeSumar && !abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Sumar apoyo
        </button>
      )}

      {abierto && (
        <FormApoyo
          datos={datos}
          onCancelar={() => setAbierto(false)}
          onSumar={(c, f, fr) => {
            setAbierto(false);
            onSumar(c, f, fr);
          }}
        />
      )}
    </div>
  );
}

function FormApoyo({
  datos,
  onSumar,
  onCancelar,
}: {
  datos: DatosApoyoOt;
  onSumar: (cuadrillaId: number, fechas: string[], fraccion: FraccionStr) => void;
  onCancelar: () => void;
}) {
  const libres = datos.dias.filter((d) => !d.parteNoEjecutado);
  // POR DEFECTO EL DÍA ABIERTO, y uno solo: el apoyo casi siempre es de un día ("el martes
  // necesitás más gente"). Si la tarjeta abierta no es un día disponible, el primero que sí.
  const inicial =
    libres.find((d) => d.fecha === datos.diaInicial)?.fecha ?? libres[0]?.fecha ?? null;
  const principalInicial = datos.dias.find((d) => d.fecha === inicial)?.cuadrillaId ?? null;
  // Las que son principal TODOS los días no se ofrecen: no hay día donde puedan ser apoyo.
  const opciones = datos.cuadrillas.filter((c) => !datos.dias.every((d) => d.cuadrillaId === c.id));

  const [cuadrillaId, setCuadrillaId] = useState<number | null>(
    opciones.find((c) => c.id !== principalInicial)?.id ?? null,
  );
  const [fechas, setFechas] = useState<string[]>(inicial ? [inicial] : []);
  const [fraccion, setFraccion] = useState<FraccionStr>("1");

  const apoyosExistentes = datos.apoyos.flatMap((a) => a.dias.map((d) => ({ fecha: d.fecha, cuadrillaId: a.cuadrillaId })));
  const plan = cuadrillaId != null ? diasParaApoyo(fechas, datos.dias, cuadrillaId, apoyosExistentes) : null;
  const nombre = nombrePropio(datos.cuadrillas.find((c) => c.id === cuadrillaId)?.nombre ?? "");
  // Lo que le queda a la cuadrilla del apoyo cada día que se suma. El apoyo OCUPA
  // CAPACIDAD DE VERDAD (apoyo.md): si la C3 ya tiene media jornada a la mañana, sumarle
  // un apoyo de día entero la pasa, y eso se dice ANTES de crearlo.
  const carga = (plan?.sumar ?? []).map((d) => {
    const total = redondearFraccion(datos.ocupacion(cuadrillaId!, d.fecha) + Number(fraccion));
    return { fecha: d.fecha, total };
  });
  const pasados = carga.filter((c) => c.total > 1);

  const alternar = (f: string) =>
    setFechas((previas) => (previas.includes(f) ? previas.filter((x) => x !== f) : [...previas, f]));

  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (cuadrillaId != null && plan && plan.sumar.length > 0) {
          onSumar(cuadrillaId, plan.sumar.map((d) => d.fecha), fraccion);
        }
      }}
    >
      <div>
        <p className="text-sm font-medium">Sumar una cuadrilla de apoyo</p>
        <p className="text-xs text-muted-foreground">
          Va a ayudar a la principal. El parte lo carga la principal, con la gente de las dos.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Cuadrilla</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={cuadrillaId ?? ""}
            onChange={(e) => setCuadrillaId(Number(e.target.value))}
          >
            {cuadrillaId == null && <option value="">Elegí una</option>}
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {nombrePropio(c.nombre)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Cuánto va</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={fraccion}
            onChange={(e) => setFraccion(e.target.value as FraccionStr)}
          >
            {FRACCIONES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.detalle}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">Días</legend>
        <div className="flex flex-wrap gap-1">
          {datos.dias.map((d) => {
            const elegido = fechas.includes(d.fecha);
            return (
              <button
                key={d.fecha}
                type="button"
                disabled={d.parteNoEjecutado}
                aria-pressed={elegido}
                onClick={() => alternar(d.fecha)}
                title={
                  d.parteNoEjecutado
                    ? "El parte de ese día salió no ejecutado"
                    : d.conParte
                      ? "Ese día ya tiene parte: el apoyo queda vinculado a él"
                      : undefined
                }
                className={cn(
                  "h-8 rounded-md border px-2 text-xs",
                  elegido ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-foreground/5",
                  d.parteNoEjecutado && "cursor-not-allowed opacity-50",
                )}
              >
                {DIA(d.fecha)}
                {d.conParte && !d.parteNoEjecutado ? " · con parte" : ""}
              </button>
            );
          })}
        </div>
      </fieldset>

      {plan && (plan.sumar.length > 0 || plan.saltados.length > 0) && (
        <div className="space-y-0.5 text-sm">
          {plan.saltados.map((s) => (
            <p key={s.fecha} className="text-muted-foreground">
              El {DIA(s.fecha)} no: {s.motivo}.
            </p>
          ))}
          {/* SUMAR EL APOYO DESPUÉS DE CARGAR EL PARTE (apoyo.md, sección 4): el apoyo
              nace vinculado al parte y el parte no se toca solo. */}
          {plan.sumar.some((d) => d.conParte) && (
            <p className="text-muted-foreground">
              {plan.sumar.filter((d) => d.conParte).map((d) => `El ${DIA(d.fecha)}`).join(", ")} ya tiene parte: el
              apoyo queda vinculado a ese parte. Después sumá su gente en Partes.
            </p>
          )}
          {plan.sumar.length > 0 && (
            <p style={{ color: pasados.length > 0 ? PELIGRO_TEXTO : OK_TEXTO }}>
              {pasados.length > 0
                ? `${nombre} se pasa: ${pasados.map((c) => `${DECIMAL.format(c.total)} j el ${DIA(c.fecha)}`).join(", ")}.`
                : `${nombre} queda con ${carga.map((c) => `libre ${DECIMAL.format(redondearFraccion(1 - c.total))} j el ${DIA(c.fecha)}`).join(", ")}.`}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!plan || plan.sumar.length === 0}>
          {plan && plan.sumar.length > 1 ? `Sumar apoyo (${plan.sumar.length} días)` : "Sumar apoyo"}
        </Button>
      </div>
    </form>
  );
}
