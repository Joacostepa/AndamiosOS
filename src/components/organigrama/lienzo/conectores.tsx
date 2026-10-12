"use client";

// Los conectores del lienzo: SVG en coordenadas del mundo, debajo de las tarjetas. Cada
// conector interpola su `d` con el mismo spring que las cajas, así se redibuja acompañando el
// movimiento. Los nuevos nacen desde el padre; la cadena de mando del foco se resalta con un
// trazo que se dibuja de abajo hacia arriba. La clave de cada conector es su hijo + su familia
// (curva o codo): al pasar de Lista a Árbol el codo no se vuelve a montar, se transforma (lista y
// árbol tienen la misma forma de `d`).

import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { familiaGeo, geometriaNaciente, rutaSvg, type Arista } from "@/lib/organigrama/layout";
import { RESORTE } from "./comun";

function rutaNaciente(a: Arista): string {
  return rutaSvg(geometriaNaciente(a.geo));
}

function ConectoresBase({
  aristas,
  cadena,
  atenuar,
  fantasma,
}: {
  aristas: Arista[];
  /** Claves de los hijos cuya arista hacia el padre es parte de la cadena de mando resaltada. */
  cadena: ReadonlySet<string>;
  atenuar: boolean;
  fantasma?: string;
}) {
  return (
    <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
      <AnimatePresence initial={false}>
        {aristas.map((a) => {
          const d = rutaSvg(a.geo);
          const enCadena = cadena.has(a.a);
          const esFantasma = a.a === fantasma;
          return (
            <motion.path
              key={`${a.a}:${familiaGeo(a.geo)}${esFantasma ? ":f" : ""}`}
              fill="none"
              className={esFantasma ? "stroke-foreground/60" : "stroke-muted-foreground/45"}
              strokeWidth={esFantasma ? 2 : 1.5}
              strokeDasharray={esFantasma ? "5 5" : undefined}
              strokeLinecap="round"
              initial={{ d: rutaNaciente(a), opacity: 0 }}
              animate={{ d, opacity: atenuar && !enCadena ? 0.25 : 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ d: RESORTE, opacity: { duration: 0.25 } }}
            />
          );
        })}
      </AnimatePresence>
      {/* La cadena de mando: un trazo encima que se dibuja. */}
      <AnimatePresence>
        {aristas
          .filter((a) => cadena.has(a.a))
          .map((a, i) => (
            <motion.path
              key={`cadena:${a.a}`}
              fill="none"
              className="stroke-foreground"
              strokeWidth={2.75}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0, d: rutaSvg(a.geo) }}
              animate={{ pathLength: 1, opacity: 1, d: rutaSvg(a.geo) }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ pathLength: { duration: 0.45, delay: 0.25 + i * 0.12, ease: "easeInOut" }, opacity: { duration: 0.2, delay: 0.25 + i * 0.12 }, d: RESORTE }}
            />
          ))}
      </AnimatePresence>
    </svg>
  );
}

export const Conectores = memo(ConectoresBase);
