"use client";

// El día sin hojas (emptyHTML) y el aviso plegable de lo que hizo la precarga.

import { useState } from "react";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import { cNombre, cuadrillasConObras, fechaLarga, obrasDe, type ModoPrecarga } from "@/lib/hoja-dia/estado";
import { Button } from "@/components/ui/button";
import { BotonCoral } from "@/components/hoja-dia/comunes/boton-coral";

export function EstadoVacio({ dia, pasado, onPrecarga, cargando }: { dia: DiaHoja; pasado: boolean; onPrecarga: (m: ModoPrecarga) => void; cargando: ModoPrecarga | null }) {
  const con = cuadrillasConObras(dia);
  const nObras = con.reduce((n, c) => n + obrasDe(dia, c).length, 0);
  const sinPlantel = con.filter((c) => !dia.cuadrillas.find((x) => x.odooId === c)?.plantel?.personaIds.length);
  const largo = fechaLarga(dia.fecha);
  if (pasado) {
    return (
      <div className="col-span-full grid gap-3.5 rounded-xl border border-dashed border-foreground/20 bg-hd-card2 px-7 py-10">
        <h2 className="text-xl font-semibold text-balance">El {largo} no tuvo hojas.</h2>
        <p className="max-w-[62ch] text-muted-foreground">Lo que pasó lo dicen los partes y la asistencia.</p>
      </div>
    );
  }
  if (!con.length) {
    return (
      <div className="col-span-full grid gap-3.5 rounded-xl border border-dashed border-foreground/20 bg-hd-card2 px-7 py-10">
        <h2 className="text-xl font-semibold text-balance">El tablero no tiene obras el {largo}.</h2>
        <p className="max-w-[62ch] text-muted-foreground">Cuando haya obras en el tablero para ese día, acá se arman las hojas.</p>
      </div>
    );
  }
  return (
    <div className="col-span-full grid justify-items-start gap-3.5 rounded-xl border border-dashed border-foreground/20 bg-hd-card2 px-7 py-10 max-md:px-4 max-md:py-6">
      <h2 className="text-xl font-semibold text-balance">El {largo} todavía no tiene hojas.</h2>
      <p className="max-w-[62ch] text-muted-foreground">
        El tablero tiene {con.length} {con.length === 1 ? "cuadrilla" : "cuadrillas"} con obras ese día ({nObras} {nObras === 1 ? "obra" : "obras"}).{" "}
        {dia.anterior &&
          `«Empezar como hoy» copia del ${fechaLarga(dia.anterior.fecha)} la gente, quién estuvo a cargo, el chofer, el vehículo y el encuentro, arma los lleva y trae en los camiones y saca a los que no vienen.`}
      </p>
      <div className="flex flex-wrap gap-2 max-md:w-full max-md:flex-col">
        {dia.anterior && (
          <BotonCoral disabled={!!cargando} onClick={() => onPrecarga("hoy")}>
            Empezar como hoy
          </BotonCoral>
        )}
        <Button size="lg" variant="outline" className="h-9 px-4 text-sm max-md:h-11" disabled={!!cargando} onClick={() => onPrecarga("plantel")}>
          Empezar con el plantel base
        </Button>
        <Button size="lg" variant="ghost" className="h-9 px-4 text-sm text-muted-foreground max-md:h-11" disabled={!!cargando} onClick={() => onPrecarga("vacio")}>
          Empezar vacío
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {sinPlantel.length
          ? `El plantel base está desactualizado (falta ${sinPlantel.map((c) => `la ${cNombre(dia, c)}`).join(" y ")}): sirve después de vacaciones, no como punto de partida de todos los días.`
          : "El plantel base sirve después de vacaciones, no como punto de partida de todos los días."}
      </p>
    </div>
  );
}

const TITULO: Record<ModoPrecarga, string> = {
  hoy: "Lo que hizo «Empezar como hoy»",
  plantel: "Lo que hizo «Empezar con el plantel base»",
  vacio: "Lo que hizo «Empezar vacío»",
};

export function AvisoPrecarga({ modo, avisos, onEntendido }: { modo: ModoPrecarga; avisos: string[]; onEntendido: () => void }) {
  const [abierto, setAbierto] = useState(true);
  if (!avisos.length) return null;
  return (
    <section aria-label={TITULO[modo]} className="grid gap-1 rounded-[10px] border bg-hd-card2 py-1.5 pr-2.5 pl-3.5 text-[13px]">
      <div className="flex min-w-0 items-center justify-between gap-2.5">
        <span className="min-w-0 truncate text-muted-foreground">
          <b className="font-semibold text-foreground">{TITULO[modo]}:</b> {abierto ? "" : avisos[0]}
        </span>
        <span className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Plegar" : `Ver los ${avisos.length}`}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onEntendido}>
            Entendido
          </Button>
        </span>
      </div>
      {abierto && (
        <ul className="mb-1 grid list-disc gap-0.5 pl-[18px] text-muted-foreground">
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
