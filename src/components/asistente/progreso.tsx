"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleX, Loader2 } from "lucide-react";

// Lo que el asistente está haciendo: mientras piensa, una caja con el paso en curso en grande,
// el tiempo y los pasos terminados con tilde; en la charla guardada, los mismos pasos en pasado.
// Las etiquetas vienen del servidor en gerundio ("Generando el PDF") porque se muestran
// mientras corren; ya hechas se leen en pasado ("Generé el PDF").

type Paso = { id: string; etiqueta: string; error?: boolean; estado?: string };

/** Los irregulares; el resto sale de la regla (-ando → -é, -iendo/-yendo → -í). */
const IRREGULARES: Record<string, string> = {
  Avisándole: "Le avisé",
  Poniendo: "Puse",
  Haciendo: "Hice",
  Trayendo: "Traje",
  Diciendo: "Dije",
  Pidiendo: "Pedí",
};

/** "Verificando el frente en el catastro" → "Verifiqué el frente en el catastro". */
export function enPasado(etiqueta: string): string {
  const [primera, ...resto] = etiqueta.split(" ");
  const cola = resto.length ? ` ${resto.join(" ")}` : "";
  if (IRREGULARES[primera]) return IRREGULARES[primera] + cola;
  let m = /^(.+)ando$/.exec(primera);
  if (m) {
    // Buscando → Busqué, Agregando → Agregué, Empezando → Empecé.
    const raiz = m[1].replace(/c$/, "qu").replace(/g$/, "gu").replace(/z$/, "c");
    return `${raiz}é${cola}`;
  }
  m = /^(.+?)[iy]endo$/.exec(primera);
  if (m) return `${m[1]}í${cola}`;
  return etiqueta;
}

function useSegundos() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const desde = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Hechos({ pasos }: { pasos: Paso[] }) {
  const fila = (p: Paso) => {
    const error = p.error || p.estado === "error";
    return (
      <li key={p.id} className={`flex items-start gap-1.5 text-[13px] leading-snug ${error ? "text-hd-rojo" : "text-muted-foreground"}`}>
        {error ? <CircleX className="mt-0.5 size-3.5 shrink-0" /> : <Check className="mt-0.5 size-3.5 shrink-0 text-hd-verde" />}
        <span>{error ? `${p.etiqueta}: no salió` : enPasado(p.etiqueta)}</span>
      </li>
    );
  };
  if (!pasos.length) return null;
  // Muchos seguidos (7 quitas en 7 vueltas) tapaban la respuesta: se agrupan y se abren al tocar.
  if (pasos.length <= 3) return <ul className="space-y-1">{pasos.map(fila)}</ul>;
  const errores = pasos.filter((p) => p.error || p.estado === "error").length;
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-muted-foreground [&::-webkit-details-marker]:hidden">
        <Check className="size-3.5 text-hd-verde" /> {pasos.length} pasos{errores ? ` (${errores} con error)` : ""}
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-1.5 space-y-1">{pasos.map(fila)}</ul>
    </details>
  );
}

/** Los pasos de una respuesta ya guardada (debajo de la burbuja, en pasado). */
export function Pasos({ pasos }: { pasos: Paso[] }) {
  if (!pasos.length) return null;
  return <div className="mb-1.5"><Hechos pasos={pasos} /></div>;
}

/**
 * La caja de mientras piensa. El paso en curso es la herramienta que está corriendo; si no hay,
 * el texto de progreso que manda el servidor; si tampoco, "Pensando" o "Escribiendo".
 */
export function Progreso({ pasos, progreso, escribiendo }: { pasos: Paso[]; progreso?: string | null; escribiendo: boolean }) {
  const s = useSegundos();
  const enCurso = [...pasos].reverse().find((p) => p.estado === "inicio");
  const hechos = pasos.filter((p) => p.estado !== "inicio");
  const actual = enCurso?.etiqueta ?? progreso ?? (escribiendo ? "Escribiendo la respuesta" : "Pensando");
  const pista = s >= 45 ? "Podés salir: queda guardado y la respuesta te espera acá." : s >= 20 ? "Suele tardar unos 30 segundos." : null;

  return (
    <div className="mb-2 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-2.5">
        <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-[16px] leading-snug font-medium">{actual.replace(/…$/, "")}…</p>
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground tabular-nums" aria-label={`${s} segundos`}>{reloj(s)}</span>
      </div>
      {hechos.length > 0 && <div className="mt-2 pl-6.5"><Hechos pasos={hechos} /></div>}
      {pista && <p aria-live="polite" className="mt-2 pl-6.5 text-[13px] text-muted-foreground">{pista}</p>}
    </div>
  );
}
