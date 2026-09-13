"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Check } from "lucide-react";
import type { FichaHabilitacion, JornadaHab } from "@/lib/habilitaciones/tipos";

// Cuándo va la obra: lo que se acordó con el cliente y lo que Operaciones ya puso en el
// tablero.
//
// POR QUÉ EN HABILITACIONES. La urgencia de un trámite no la da la fecha de la OT sola:
// una obra "programada" que sigue en la bandeja sin asignar puede esperar; una con
// jornadas CONFIRMADAS la semana que viene no. Hasta ahora eso sólo se sabía preguntándole
// a Operaciones o abriendo el tablero.
//
// LAS FECHAS DEL ACUERDO SE MUESTRAN SÓLO SI ESTÁN CARGADAS: casi nunca lo están, y tres
// etiquetas con guion sólo generan la duda de si había que llenarlas. La planificación sí
// se muestra siempre, porque "en la bandeja, sin planificar" también es una respuesta.

const MAX_JORNADAS = 6;

function fecha(f: string, patron = "d MMM yyyy") {
  return format(parseISO(f), patron, { locale: es });
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[13px] font-medium">{children}</p>
    </div>
  );
}

function resumen(jornadas: JornadaHab[]): { texto: string; color: string; fondo: string } {
  if (jornadas.length === 0) {
    return { texto: "En la bandeja · sin planificar", color: "var(--muted-foreground)", fondo: "var(--muted)" };
  }
  const confirmadas = jornadas.filter((j) => j.estado === "confirmada").length;
  if (confirmadas === jornadas.length) {
    return { texto: "Planificada · confirmada", color: "#27500A", fondo: "#EAF3DE" };
  }
  if (confirmadas === 0) {
    return { texto: "Planificada · tentativa", color: "#854F0B", fondo: "#FEF6E7" };
  }
  return {
    texto: `Planificada · ${confirmadas} de ${jornadas.length} confirmadas`,
    color: "#854F0B",
    fondo: "#FEF6E7",
  };
}

export function FechasObra({ ficha }: { ficha: FichaHabilitacion }) {
  const { desde, antesDe, comprometida, firmeza } = ficha.fechas;
  const jornadas = ficha.jornadas;
  const estado = resumen(jornadas);
  const hayAcuerdo = !!(desde || antesDe || comprometida);

  return (
    <section className="space-y-3 rounded-md border p-3">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Fechas y planificación</h3>
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: estado.fondo, color: estado.color }}
        >
          {estado.texto}
        </span>
        <Link
          href="/planificacion"
          className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Ver en el tablero
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Lo cargado en la OT de Odoo. */}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">En la OT</p>
          <div className="grid grid-cols-2 gap-3">
            <Dato label="Programada">
              {ficha.fechaProgramada ? fecha(ficha.fechaProgramada) : "Sin fecha"}
            </Dato>
            {comprometida && (
              <Dato label="Comprometida al cliente">
                {fecha(comprometida)}
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {firmeza === "confirmada" ? "Fecha firme" : "Tentativa · puede moverse"}
                </span>
              </Dato>
            )}
            {/* El piso y el techo de la misma ventana, juntos y en este orden. */}
            {desde && <Dato label="No entra antes de">{fecha(desde)}</Dato>}
            {antesDe && <Dato label="Terminada antes de">{fecha(antesDe)}</Dato>}
          </div>
          {!hayAcuerdo && (
            <p className="text-[11px] text-muted-foreground">
              Sin fechas acordadas con el cliente cargadas en la OT.
            </p>
          )}
        </div>

        {/* Lo que Operaciones ya puso en el tablero. */}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">En el tablero</p>
          {jornadas.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Todavía no tiene jornadas: está en la bandeja de sin asignar.
            </p>
          ) : (
            <>
              <p className="text-[13px] font-medium">
                {jornadas.length === 1
                  ? fecha(jornadas[0].fecha, "EEE d MMM")
                  : `${fecha(jornadas[0].fecha, "d MMM")} – ${fecha(jornadas[jornadas.length - 1].fecha, "d MMM")} · ${jornadas.length} jornadas`}
              </p>
              <ul className="space-y-0.5">
                {jornadas.slice(0, MAX_JORNADAS).map((j, i) => (
                  <li key={`${j.fecha}-${i}`} className="flex items-center gap-2 text-[12px]">
                    <span className="w-20 shrink-0 tabular-nums">{fecha(j.fecha, "EEE d MMM")}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {j.cuadrilla ?? "sin cuadrilla"}
                    </span>
                    {j.conParte ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                        <Check className="h-3 w-3" style={{ color: "#639922" }} />
                        con parte
                      </span>
                    ) : (
                      <span
                        className="shrink-0"
                        style={{ color: j.estado === "confirmada" ? "#27500A" : "#854F0B" }}
                      >
                        {j.estado}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {jornadas.length > MAX_JORNADAS && (
                <p className="text-[11px] text-muted-foreground">
                  y {jornadas.length - MAX_JORNADAS} jornadas más
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
