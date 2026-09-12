"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, Loader2, Phone, Pin, TriangleAlert, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AVISO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import { diaCorrible, planearCorrimiento, type ModoCorrimiento } from "@/lib/tablero/corrimiento";
import type { Corrimiento } from "@/lib/tablero/corrimiento";
import type { AsignacionTablero, CuadrillaTablero, OtTablero } from "@/lib/tablero/tipos";

// Suspender un día y correr lo que había.
//
// EL PREVIEW ES LA TRABA. Un "¿estás seguro?" se clickea sin leer a la tercera vez; lo
// que frena de verdad es que el botón diga el tamaño —"Correr 34 jornadas de 12 obras"—
// y que arriba esté la lista de lo que se rompe. No se puede apretar sin haber visto el
// número.
//
// SE RECALCULA EN VIVO: destildar una cuadrilla o cambiar de modo vuelve a correr
// planearCorrimiento, que es LA MISMA función que después ejecuta. El preview y lo que
// pasa no pueden discrepar porque son el mismo cálculo.
//
// EL MOTIVO ES OBLIGATORIO y va al historial. No es burocracia: dentro de un mes, la
// pregunta que alguien va a hacerle a este tablero es por qué la semana del 17 se corrió
// entera, y "lluvia" contesta eso en una palabra.

const dia = (f: string) => format(parseISO(f), "EEE d MMM", { locale: es });
const diaLargo = (f: string) => format(parseISO(f), "EEEE d 'de' MMMM", { locale: es });

export function DialogoCorrerDia({
  abierto,
  hoy,
  hastaCargado,
  asignaciones,
  ots,
  cuadrillas,
  guardando,
  onCerrar,
  onCorrer,
}: {
  abierto: boolean;
  /** Día por defecto: el de hoy, que es cuando se decide esto. */
  hoy: string;
  /** Último día que el tablero tiene cargado. Ver `alBorde` en corrimiento.ts. */
  hastaCargado: string;
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  cuadrillas: CuadrillaTablero[];
  guardando: boolean;
  onCerrar: () => void;
  onCorrer: (plan: Corrimiento, datos: { dia: string; motivo: string }) => void;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("Lluvia");
  const [modo, setModo] = useState<ModoCorrimiento>("cascada");
  // Arrancan todas tildadas: llueve sobre la ciudad entera. Se destilda la que sí salió.
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());

  const noSePuede = diaCorrible(fecha);

  const plan = useMemo(() => {
    if (noSePuede) return null;
    return planearCorrimiento({
      asignaciones,
      ots,
      cuadrillas,
      dia: fecha,
      cuadrillaIds: cuadrillas.map((c) => c.id).filter((id) => !excluidas.has(id)),
      modo,
      hastaCargado,
    });
  }, [asignaciones, ots, cuadrillas, fecha, excluidas, modo, noSePuede, hastaCargado]);

  // Cuánto pide cada modo, para poder elegir con el número a la vista y no a ciegas.
  const soloElDia = useMemo(() => {
    if (noSePuede) return null;
    return planearCorrimiento({
      asignaciones,
      ots,
      cuadrillas,
      dia: fecha,
      cuadrillaIds: cuadrillas.map((c) => c.id).filter((id) => !excluidas.has(id)),
      modo: "dia",
      hastaCargado,
    });
  }, [asignaciones, ots, cuadrillas, fecha, excluidas, noSePuede, hastaCargado]);

  function cerrar() {
    // Vuelve a hoy: si quedara el día de la vez anterior, abrirlo mañana mostraría el plan
    // de ayer y el botón diría un número que no es el que se está por hacer.
    setFecha(hoy);
    setExcluidas(new Set());
    setModo("cascada");
    setMotivo("Lluvia");
    onCerrar();
  }

  if (!abierto) return null;

  const hayAlgo = (plan?.jornadas ?? 0) > 0;

  return (
    <Dialog open onOpenChange={(a) => !a && cerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suspender un día y correr lo que había</DialogTitle>
          <DialogDescription>
            Las jornadas pasan al día siguiente. El domingo se saltea; el sábado y los
            feriados se trabajan, así que cuentan como días hábiles.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="corrimiento-dia" className="text-[12px]">Día que se suspende</Label>
            <Input
              id="corrimiento-dia"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corrimiento-motivo" className="text-[12px]">Motivo</Label>
            <Input
              id="corrimiento-motivo"
              value={motivo}
              maxLength={120}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Lluvia"
            />
          </div>
        </div>

        {noSePuede ? (
          <p className="rounded-md border px-3 py-2 text-[13px]"
             style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }}>
            {noSePuede}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Cuadrillas</Label>
              <p className="text-[11px] text-muted-foreground">
                Destildá la que sí salió: a veces aclara al mediodía, y el depósito se hace
                igual.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5">
                {cuadrillas.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-[13px]">
                    <Checkbox
                      checked={!excluidas.has(c.id)}
                      onCheckedChange={(v) =>
                        setExcluidas((prev) => {
                          const s = new Set(prev);
                          if (v) s.delete(c.id);
                          else s.add(c.id);
                          return s;
                        })
                      }
                    />
                    {c.nombre}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Qué se corre</Label>
              <div className="space-y-1.5">
                <OpcionModo
                  elegida={modo === "dia"}
                  onElegir={() => setModo("dia")}
                  titulo={`Sólo el ${dia(fecha)}`}
                  detalle={
                    soloElDia
                      ? `${soloElDia.jornadas} jornada${soloElDia.jornadas === 1 ? "" : "s"} al día siguiente` +
                        (soloElDia.sobrecargas.length > 0
                          ? ` · ${soloElDia.sobrecargas.length} día${soloElDia.sobrecargas.length === 1 ? "" : "s"} queda${soloElDia.sobrecargas.length === 1 ? "" : "n"} sobreasignado${soloElDia.sobrecargas.length === 1 ? "" : "s"}`
                          : "")
                      : ""
                  }
                />
                <OpcionModo
                  elegida={modo === "cascada"}
                  onElegir={() => setModo("cascada")}
                  titulo="Ese día y lo que sigue"
                  detalle={
                    plan && modo === "cascada"
                      ? `${plan.jornadas} jornada${plan.jornadas === 1 ? "" : "s"}` +
                        (plan.ultimoDia ? `, hasta el ${dia(plan.ultimoDia)}` : "") +
                        " · se frena en el primer día libre de cada cuadrilla"
                      : "Se frena en el primer día libre de cada cuadrilla"
                  }
                />
              </div>
            </div>

            {plan && <Consecuencias plan={plan} dia={fecha} hastaCargado={hastaCargado} />}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          {/* EL BOTÓN DICE EL TAMAÑO. Es el mismo clic que "Confirmar", pero no se puede
              apretar sin haber leído cuántas obras se mueven. */}
          <Button
            disabled={!hayAlgo || guardando || !motivo.trim() || !!noSePuede}
            onClick={() => plan && onCorrer(plan, { dia: fecha, motivo: motivo.trim() })}
          >
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hayAlgo
              ? `Correr ${plan!.jornadas} jornada${plan!.jornadas === 1 ? "" : "s"} de ${plan!.obras} obra${plan!.obras === 1 ? "" : "s"}`
              : "No hay nada para correr"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpcionModo({
  elegida,
  onElegir,
  titulo,
  detalle,
}: {
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-[13px] ${
        elegida ? "border-foreground/40 bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <span
        aria-hidden
        className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border ${elegida ? "border-[5px] border-foreground" : "border-foreground/40"}`}
      />
      <span>
        <span className="font-medium">{titulo}</span>
        {detalle && <span className="block text-[11px] text-muted-foreground">{detalle}</span>}
      </span>
    </button>
  );
}

/**
 * Lo que el corrimiento deja atrás. Es la parte que de verdad se lee.
 *
 * CADA LISTA CONTESTA UNA PREGUNTA DISTINTA y por eso van separadas y no en un solo
 * bloque de avisos: las fijas son "¿qué hago con ésta?", las confirmadas son "¿a quién
 * llamo?", el techo es "¿a quién le estoy incumpliendo?" y la sobrecarga es "¿dónde voy a
 * tener que acomodar a mano?".
 */
function Consecuencias({
  plan,
  dia: diaSuspendido,
  hastaCargado,
}: {
  plan: Corrimiento;
  dia: string;
  hastaCargado: string;
}) {
  const nada =
    plan.fijas.length === 0 &&
    plan.confirmadas.length === 0 &&
    plan.rompenTecho.length === 0 &&
    plan.sobrecargas.length === 0 &&
    plan.solas.length === 0;

  if (plan.jornadas === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No hay jornadas para correr el {diaLargo(diaSuspendido)} en las cuadrillas tildadas.
      </p>
    );
  }

  if (nada) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No queda nada pendiente: ninguna obra está fija, ninguna confirmada se mueve y
        ningún día queda sobreasignado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {plan.alBorde && (
        <Bloque
          icono={<TriangleAlert className="h-3.5 w-3.5" />}
          titulo="El tablero no tiene cargado tan adelante"
          peligro
        >
          La cascada llegó hasta el {dia(hastaCargado)}, que es lo último que hay cargado, y
          se frenó ahí porque más allá no ve nada — no porque haya lugar. Si alguna cuadrilla
          sigue tomada después, lo que se corra le va a caer encima. Cerrá esto, scrolleá el
          tablero hacia adelante y volvé a abrirlo.
        </Bloque>
      )}

      {plan.truncado && (
        <Bloque
          icono={<TriangleAlert className="h-3.5 w-3.5" />}
          titulo="La cascada es muy larga"
          peligro
        >
          Alguna cuadrilla no tiene un solo día libre en los próximos meses, así que el
          corrimiento se cortó donde llegó. Mirá si no conviene correr sólo el día.
        </Bloque>
      )}

      {plan.fijas.length > 0 && (
        <Bloque icono={<Pin className="h-3.5 w-3.5" />} titulo={`Quedan en su día (${plan.fijas.length})`}>
          <ul className="space-y-0.5">
            {plan.fijas.map((f, i) => (
              <li key={`${f.otId}-${i}`}>
                <strong>{f.titulo}</strong> — {f.motivo}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {plan.solas.length > 0 && (
        <Bloque icono={<UserMinus className="h-3.5 w-3.5" />} titulo="Se quedan casi sin trabajo">
          <ul className="space-y-0.5">
            {plan.solas.map((s) => (
              <li key={s.cuadrillaId}>
                <strong>{s.cuadrillaNombre}</strong> queda con {fraccionLabel(s.carga)} de
                jornada el {dia(diaSuspendido)}. ¿Sale igual o se reprograma?
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {plan.confirmadas.length > 0 && (
        <Bloque icono={<Phone className="h-3.5 w-3.5" />} titulo={`Hay que avisarle al cliente (${plan.confirmadas.length})`}>
          <p className="pb-1 text-[11px] opacity-80">
            Estaban confirmadas: la fecha ya se había prometido.
          </p>
          <ul className="space-y-0.5">
            {plan.confirmadas.map((c) => (
              <li key={c.otId}>
                <strong>{c.titulo}</strong> — del {dia(c.de)} al {dia(c.a)}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {plan.rompenTecho.length > 0 && (
        <Bloque icono={<CalendarClock className="h-3.5 w-3.5" />} titulo="Se pasan de la fecha límite" peligro>
          <ul className="space-y-0.5">
            {plan.rompenTecho.map((t) => (
              <li key={t.otId}>
                <strong>{t.titulo}</strong> — el cliente la pidió terminada antes del{" "}
                {dia(t.techo)} y ahora termina el {dia(t.termina)}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {plan.sobrecargas.length > 0 && (
        <Bloque icono={<TriangleAlert className="h-3.5 w-3.5" />} titulo={`Días que quedan sobreasignados (${plan.sobrecargas.length})`}>
          <p className="pb-1 text-[11px] opacity-80">
            No se acomodan solos: quedan en rojo en el tablero para que los repartas.
          </p>
          <ul className="space-y-0.5">
            {plan.sobrecargas.slice(0, 8).map((s, i) => (
              <li key={`${s.cuadrillaId}-${s.fecha}-${i}`}>
                <strong>{s.cuadrillaNombre}</strong>, {dia(s.fecha)} —{" "}
                {Math.round(s.carga * 100)}%
              </li>
            ))}
            {plan.sobrecargas.length > 8 && <li>y {plan.sobrecargas.length - 8} más</li>}
          </ul>
        </Bloque>
      )}
    </div>
  );
}

function Bloque({
  icono,
  titulo,
  peligro = false,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={
        peligro
          ? { backgroundColor: PELIGRO_SUAVE, borderColor: PELIGRO_TEXTO, color: PELIGRO_TEXTO }
          : { backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }
      }
    >
      <p className="flex items-center gap-1.5 pb-1 font-medium">
        {icono}
        {titulo}
      </p>
      {children}
    </div>
  );
}
