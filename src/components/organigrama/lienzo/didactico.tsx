"use client";

// Los dos modos didácticos del lienzo, pensados para la inducción de alguien que entra:
//
// - «Conocé ABA» (Recorrido): la cámara vuela área por área y una tarjeta cuenta qué hace, quién
//   la lidera y cuántos son. Siguiente / Anterior / Salir, y ← → Esc.
// - «Seguí el papel»: un documento viaja de puesto en puesto POR LOS CONECTORES y en cada
//   parada se lee qué hace ese puesto con él. Se reproduce solo o paso a paso.

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, FileText, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { areaDe, hijos, nombreCompleto, ocupantesVigentes, personaDe, quienResponde } from "@/lib/organigrama/arbol";
import { NOMBRE_PAPEL, VERBO_ROL, type Circuito, type Parada } from "@/lib/organigrama/circuitos";
import type { Resumen } from "@/lib/organigrama/lienzo";
import type { ColorArea, DatosOrg, Nodo, Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { varsArea } from "./comun";

const MARCO =
  "pointer-events-auto w-[min(380px,calc(100vw-2rem))] rounded-xl border bg-card/97 p-4 shadow-2xl backdrop-blur max-sm:w-full";

function Puntos({ total, actual, onIr }: { total: number; actual: number; onIr: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Pasos">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === actual}
          aria-label={`Paso ${i + 1}`}
          onClick={() => onIr(i)}
          className="flex h-6 items-center justify-center focus-visible:outline-2 focus-visible:outline-ring"
        >
          <motion.span
            className={cn("block h-1.5 rounded-full", i === actual ? "bg-foreground" : i < actual ? "bg-foreground/45" : "bg-muted-foreground/30")}
            animate={{ width: i === actual ? 18 : 6 }}
          />
        </button>
      ))}
    </div>
  );
}

function Controles({
  paso,
  total,
  onAnterior,
  onSiguiente,
  onSalir,
  extra,
}: {
  paso: number;
  total: number;
  onAnterior: () => void;
  onSiguiente: () => void;
  onSalir: () => void;
  extra?: React.ReactNode;
}) {
  const ultimo = paso >= total - 1;
  return (
    <div className="mt-3 flex items-center gap-1.5">
      <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={onAnterior} disabled={paso === 0} aria-label="Anterior">
        <ArrowLeft aria-hidden />
      </Button>
      {extra}
      <Button variant="outline" className="ml-auto h-9 max-sm:h-10" onClick={ultimo ? onSalir : onSiguiente}>
        {ultimo ? "Terminar" : "Siguiente"} {!ultimo && <ArrowRight aria-hidden />}
      </Button>
    </div>
  );
}

function Encabezado({ titulo, color, etiqueta, onSalir }: { titulo: string; color: ColorArea; etiqueta: string; onSalir: () => void }) {
  return (
    <div className="flex items-start gap-2" style={varsArea(color)}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span aria-hidden className="size-2 rounded-full bg-[var(--area)]" />
          {etiqueta}
        </p>
        <h2 className="text-[17px] leading-snug font-bold text-balance">{titulo}</h2>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onSalir} aria-label="Salir" className="-mt-1 -mr-1.5">
        <X aria-hidden />
      </Button>
    </div>
  );
}

function personasDeNodo(datos: DatosOrg, clave: string): Persona[] {
  return ocupantesVigentes(datos, clave)
    .map((o) => personaDe(datos.personas, o.persona))
    .filter((p): p is Persona => !!p);
}

export type PasoRecorrido = { tipo: "intro" } | { tipo: "area"; nodo: Nodo; rama: { puestos: number; personas: number; vacantes: number } } | { tipo: "fin" };

export function TarjetaRecorrido({
  pasos,
  paso,
  datos,
  resumen,
  onIr,
  onSalir,
}: {
  pasos: PasoRecorrido[];
  paso: number;
  datos: DatosOrg;
  resumen: Resumen;
  onIr: (i: number) => void;
  onSalir: () => void;
}) {
  const p = pasos[paso];
  const ctrl = { paso, total: pasos.length, onAnterior: () => onIr(paso - 1), onSiguiente: () => onIr(paso + 1), onSalir };
  return (
    <motion.section
      data-sin-pan
      aria-label="Recorrido por ABA"
      aria-live="polite"
      className={MARCO}
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={paso} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
          {p.tipo === "intro" && (
            <>
              <Encabezado titulo="Así se organiza ABA" color="gris" etiqueta="Conocé ABA" onSalir={onSalir} />
              <p className="mt-2 text-[13.5px] leading-relaxed">
                La Dirección General coordina <b>{resumen.areas} áreas</b>. Entre todas hay <b>{resumen.puestos} puestos</b> y{" "}
                <b>{resumen.conPuesto} personas</b> trabajando. Te muestro qué hace cada una, quién la lidera y cuántos son.
              </p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">Usá ← → o los botones. Tocá cualquier puesto cuando termines.</p>
            </>
          )}
          {p.tipo === "area" && <PasoArea nodo={p.nodo} rama={p.rama} datos={datos} onSalir={onSalir} />}
          {p.tipo === "fin" && (
            <>
              <Encabezado titulo="Listo, ya conocés ABA" color="gris" etiqueta="Conocé ABA" onSalir={onSalir} />
              <p className="mt-2 text-[13.5px] leading-relaxed">
                Tocá cualquier puesto para ver su ficha: qué hace, qué NO hace y cómo se mide. Si querés ver cómo viajan los papeles entre áreas, probá
                «Seguí el papel».
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="mt-3 flex justify-center">
        <Puntos total={pasos.length} actual={paso} onIr={onIr} />
      </div>
      <Controles {...ctrl} />
    </motion.section>
  );
}

function PasoArea({ nodo, rama, datos, onSalir }: { nodo: Nodo; rama: { puestos: number; personas: number; vacantes: number }; datos: DatosOrg; onSalir: () => void }) {
  const lideres = personasDeNodo(datos, nodo.clave);
  const puestos = hijos(datos.nodos, nodo.clave);
  return (
    <>
      <Encabezado titulo={nodo.titulo} color={nodo.color ?? "gris"} etiqueta="Área" onSalir={onSalir} />
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {lideres.length ? `La lidera ${lideres.map(nombreCompleto).join(" y ")}` : "Sin responsable asignado"}
        {nodo.rol ? ` · ${nodo.rol}` : ""}
      </p>
      <dl className="mt-2 flex gap-2 text-center">
        {[
          [rama.puestos, rama.puestos === 1 ? "puesto" : "puestos"],
          [rama.personas, rama.personas === 1 ? "persona" : "personas"],
          [rama.vacantes, rama.vacantes === 1 ? "vacante" : "vacantes"],
        ].map(([n, t]) => (
          <div key={t} className={cn("flex-1 rounded-md bg-muted/60 py-1", t.toString().startsWith("vacante") && Number(n) > 0 && "bg-amber-500/10")}>
            <dt className="sr-only">{t}</dt>
            <dd className="text-[17px] leading-tight font-bold">{n}</dd>
            <dd className="text-[11px] text-muted-foreground">{t}</dd>
          </div>
        ))}
      </dl>
      {nodo.mision && <p className="mt-2 text-[13.5px] leading-relaxed">{nodo.mision}</p>}
      {nodo.notaDiseno && (
        <p className="mt-2 rounded-md border-l-2 border-[var(--area,currentColor)] bg-muted/50 px-2 py-1 text-[12.5px]" style={varsArea(nodo.color ?? "gris")}>
          <b>Por qué está así:</b> {nodo.notaDiseno}
        </p>
      )}
      {puestos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {puestos.map((h, i) => (
            <motion.li
              key={h.clave}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="rounded-full border px-2 py-0.5 text-[11.5px]"
            >
              {h.titulo}
            </motion.li>
          ))}
        </ul>
      )}
    </>
  );
}

/** El papelito que viaja por los conectores (en coordenadas del mundo). */
export function Papelito({ papel }: { papel: Parada["papel"] }) {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={papel}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: -90, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="relative flex h-12 w-10 flex-col items-center justify-center rounded-[5px] border-2 border-foreground bg-background shadow-xl"
        >
          <span aria-hidden className="absolute top-0 right-0 size-2.5 rounded-bl-[3px] border-b-2 border-l-2 border-foreground bg-muted" />
          <FileText aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-[10.5px] leading-none font-bold">{papel}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function TarjetaPapel({
  circuito,
  paso,
  datos,
  reproduciendo,
  onIr,
  onReproducir,
  onSalir,
}: {
  circuito: Circuito;
  paso: number;
  datos: DatosOrg;
  reproduciendo: boolean;
  onIr: (i: number) => void;
  onReproducir: () => void;
  onSalir: () => void;
}) {
  const parada = circuito.paradas[paso];
  const nodo = datos.nodos.find((n) => n.clave === parada.nodo);
  const resp = nodo ? quienResponde(datos, nodo.clave) : null;
  const color = (nodo && areaDe(datos.nodos, nodo.clave)?.color) ?? "gris";
  return (
    <motion.section
      data-sin-pan
      aria-label={`Seguí el papel: ${circuito.titulo}`}
      aria-live="polite"
      className={MARCO}
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <Encabezado titulo={circuito.titulo} color="gris" etiqueta={`Seguí el papel · ${paso + 1} de ${circuito.paradas.length}`} onSalir={onSalir} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="mt-2 rounded-lg border p-3"
          style={varsArea(color)}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border-2 border-foreground px-1.5 py-0.5 text-[11.5px] font-bold">
              {parada.papel}
            </span>
            <span className="truncate text-[12px] text-muted-foreground">
              {NOMBRE_PAPEL[parada.papel]}
              {parada.rol ? ` · ${VERBO_ROL[parada.rol]}` : ""}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--area)]" />
            {nodo?.titulo ?? "Puesto que ya no está en el borrador"}
          </p>
          {resp && (
            <p className="text-[12.5px] text-muted-foreground">
              {resp.subio
                ? `${resp.motivo === "baja" ? "Su ocupante está de baja" : "Vacante"}: hoy responde ${resp.personas.map(nombreCompleto).join(", ") || "nadie"} (${resp.nodo.titulo})`
                : resp.personas.map(nombreCompleto).join(", ")}
            </p>
          )}
          <p className="mt-2 text-[13.5px] leading-relaxed">{parada.texto}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-3 flex justify-center">
        <Puntos total={circuito.paradas.length} actual={paso} onIr={onIr} />
      </div>
      <Controles
        paso={paso}
        total={circuito.paradas.length}
        onAnterior={() => onIr(paso - 1)}
        onSiguiente={() => onIr(paso + 1)}
        onSalir={onSalir}
        extra={
          <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={onReproducir} aria-label={reproduciendo ? "Pausar" : "Reproducir"}>
            {reproduciendo ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
        }
      />
    </motion.section>
  );
}
