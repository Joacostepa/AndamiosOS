"use client";

// "Ver como Ortega": la vista previa del link del capataz (o del chofer) en un marco de
// teléfono, armada en el navegador con la misma función que usa el link (armarVista) y el
// componente del celular. No cuenta como "Abierta" (no pide nada al servidor).

import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import { envioDe, fechaLarga, nombreDe, rolDe } from "@/lib/hoja-dia/estado";
import { armarVista } from "@/lib/hoja-dia/vista";
import { MarcoTelefono, VistaCelular } from "@/components/hoja-dia/celular";
import { HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";

export function VerComo({ abierta, onCerrar, dia, ahora, pid }: { abierta: boolean; onCerrar: () => void; dia: DiaHoja; ahora: number; pid: string }) {
  const N = nombreDe(dia, pid);
  const r = rolDe(dia, pid);
  const e = envioDe(dia, pid);
  const vista = r
    ? armarVista(dia, { rol: r.rol === "chofer" ? "chofer" : "a_cargo", personaId: pid, cuadrillaOdooId: r.c ?? null, anulado: false, anuladoPorRol: false, version: e?.version ?? 0 }, ahora)
    : null;
  return (
    <HojaLateral abierta={abierta} onCerrar={onCerrar} titulo={`Así lo ve ${N}`} sub={`Vista previa del link de ${N} para el ${fechaLarga(dia.fecha)}. No cuenta como «Abierta».`}>
      <div className="grid justify-items-center py-2">
        {vista ? (
          <MarcoTelefono etiqueta={`Vista previa de ${N}`}>
            <VistaCelular vista={vista} preview />
          </MarcoTelefono>
        ) : (
          <p className="text-[13px] text-muted-foreground">{N} no recibe nada ese día.</p>
        )}
      </div>
    </HojaLateral>
  );
}
