"use client";

// "Cerrar jornada" desde la tarjeta (a partir de las 16 en el día de hoy): abre el MISMO
// formulario del tablero (FormularioCierre), que ya viene precargado desde la hoja
// (usePrecargaCierre). Una cuadrilla con varias obras se cierra por obra: si hay más de una,
// se elige primero cuál.

import { useState } from "react";
import type { DiaHoja, ObraDia } from "@/lib/hoja-dia/tipos";
import type { Bloque } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";
import { cNombre, obrasDe } from "@/lib/hoja-dia/estado";
import { FormularioCierre } from "@/components/tablero/formulario-cierre";
import { ItemMenu } from "@/components/hoja-dia/comunes/menu-flotante";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** El bloque mínimo que el formulario necesita (la cuadrilla y el día). */
function bloqueDe(o: ObraDia, fecha: string): Bloque {
  return {
    key: `hoja-${o.asignacionId}`, ids: [o.asignacionId], origen: "ot", otId: o.otId, cuadrillaId: o.cuadrillaOdooId,
    fechas: [fecha], partes: [null], fraccion: o.fraccion, fraccionesPorDia: [o.fraccion], estado: o.estadoAsignacion,
    ordenDia: o.ordenDia, notas: null, motivoFija: null, multiDia: false,
  };
}
/** La OT con lo que el formulario usa (tipo y personal por jornada). */
function otDe(o: ObraDia): OtTablero {
  return {
    id: o.otId, titulo: o.titulo, direccionObra: o.direccion, referenciaObra: null, detalleTecnico: o.detalleTecnico, tipo: o.tipo,
    estado: "", urgencia: "", motivoUrgencia: null, jornadas: o.totalDias ?? 1, sinEstimar: false, personalPorJornada: o.personalPorJornada,
    cuadrillaPrevistaId: o.cuadrillaOdooId, habSemaforo: "", habAlerta: null, habVencimiento: null, tecnico: null, contactoObra: o.contactoObra,
    telObra: o.telObra, observaciones: o.observaciones, diasObra: o.totalDias ?? 1, horasHombre: 0, cantDocs: o.cantArchivos, docIds: [],
    cantInstrucciones: 0, ordenVenta: null, fechaProgramada: null, fechaComprometida: null, fechaDesde: null, fechaAntesDe: null, url: "",
  };
}

export function CerrarJornada({ dia, c, onCerrar }: { dia: DiaHoja; c: number | null; onCerrar: () => void }) {
  const obras = c != null ? obrasDe(dia, c) : [];
  const [elegida, setElegida] = useState<number | null>(null);
  const o = obras.length === 1 ? obras[0] : obras.find((x) => x.otId === elegida) ?? null;
  return (
    <>
      <Dialog open={c != null && obras.length > 1 && !o} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
          <DialogTitle className="text-[17px] font-semibold">Cerrar jornada · {cNombre(dia, c)}</DialogTitle>
          <DialogDescription className="text-[13px]">Se cierra por obra. ¿Cuál?</DialogDescription>
          <div role="menu" className="grid gap-px">
            {obras.map((x) => (
              <ItemMenu key={x.otId} onClick={() => setElegida(x.otId)}>{x.corto}</ItemMenu>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <FormularioCierre
        abierto={c != null && !!o}
        bloque={o ? bloqueDe(o, dia.fecha) : null}
        ot={o ? otDe(o) : undefined}
        fecha={dia.fecha}
        asignacionId={o?.asignacionId ?? null}
        parteId={null}
        esUltimaJornada={!!o && o.dia != null && o.totalDias != null && o.dia === o.totalDias}
        onOpenChange={(v) => {
          if (!v) {
            setElegida(null);
            onCerrar();
          }
        }}
      />
    </>
  );
}
