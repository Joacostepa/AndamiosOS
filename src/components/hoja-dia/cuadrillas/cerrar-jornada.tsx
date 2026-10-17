"use client";

// "Cerrar jornada" desde la tarjeta (a partir de las 16 en el día de hoy): abre el MISMO
// formulario del tablero (FormularioCierre), que ya viene precargado desde la hoja
// (usePrecargaCierre). Una cuadrilla con varias obras se cierra por obra: si hay más de una
// sin cerrar, se elige primero cuál.
//
// UNA JORNADA CON PARTE NO SE VUELVE A CERRAR (B1): la tarjeta muestra "Jornada cerrada
// 17:20 · puntero Ortega, 5 personas" y "Ver parte", que abre ese parte (sólo lectura,
// con "Editar", que es el PATCH con su id). El servidor además rechaza (409) un cierre
// nuevo sobre una asignación que ya tiene parte.
//
// LA CUADRILLA DE APOYO NO CIERRA (apoyo.md, etapa 3): el parte es uno por obra y día y lo
// carga la principal, que le cierra también la jornada al apoyo. Por eso las obras de
// apoyo no son candidatas, y si a la cuadrilla sólo le quedan apoyos el pedido muestra
// "Hoy apoyás Thames 1820, el parte lo hace la Cuadrilla 2" en lugar del formulario.

import { useState } from "react";
import { useParte } from "@/hooks/use-parte";
import { Button } from "@/components/ui/button";
import type { DiaHoja, ObraDia } from "@/lib/hoja-dia/tipos";
import type { Bloque } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";
import { cNombre, obrasDe, textoApoyo } from "@/lib/hoja-dia/estado";
import { FormularioCierre, type ApoyoDelFormulario } from "@/components/tablero/formulario-cierre";
import { ItemMenu } from "@/components/hoja-dia/comunes/menu-flotante";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** El bloque mínimo que el formulario necesita (la cuadrilla y el día). */
function bloqueDe(o: ObraDia, fecha: string): Bloque {
  return {
    key: `hoja-${o.asignacionId}`, ids: [o.asignacionId], origen: "ot", otId: o.otId, cuadrillaId: o.cuadrillaOdooId,
    fechas: [fecha], partes: [o.parteId], fraccion: o.fraccion, fraccionesPorDia: [o.fraccion], estado: o.estadoAsignacion,
    ordenDia: o.ordenDia, notas: null, motivoFija: null, multiDia: false,
    // Un apoyo nunca llega acá a cerrar (no es candidata); sí a "Ver parte", que es el de
    // la principal. Si igual se intentara, el POST lo rechaza con 409.
    apoyo: o.apoyo === true,
  };
}
/** La OT con lo que el formulario usa (tipo y personal por jornada). */
function otDe(o: ObraDia): OtTablero {
  return {
    id: o.otId, titulo: o.titulo, direccionObra: o.direccion, referenciaObra: null, detalleTecnico: o.detalleTecnico, tipo: o.tipo,
    estado: "", urgencia: "", motivoUrgencia: null, jornadas: o.totalDias ?? 1, sinEstimar: false, personalPorJornada: o.personalPorJornada,
    cuadrillaPrevistaId: o.cuadrillaOdooId, habSemaforo: "", habAlerta: null, habVencimiento: null, tecnico: null, contactoObra: o.contactoObra,
    telObra: o.telObra, observaciones: o.observaciones, diasObra: o.totalDias ?? 1, horasHombre: 0, cantDocs: o.cantArchivos, docIds: [],
    cantInstrucciones: 0, ordenVenta: null, fechaProgramada: null, fechaComprometida: null, fechaDesde: null, fechaAntesDe: null, syh: false, url: "",
  };
}

/** Lo que se pidió: cerrar la jornada de una cuadrilla (elige la obra) o abrir la de una obra. */
export type PedidoCierre = { c: number; otId?: number | null };

export function CerrarJornada({ dia, pedido, onCerrar }: { dia: DiaHoja; pedido: PedidoCierre | null; onCerrar: () => void }) {
  const c = pedido?.c ?? null;
  const obras = c != null ? obrasDe(dia, c) : [];
  // Con obra pedida ("Ver parte"), ésa. Si no, sólo las que todavía no tienen parte y que
  // esta cuadrilla hace como principal: las de apoyo las cierra la otra.
  const candidatas = pedido?.otId != null
    ? obras.filter((x) => x.otId === pedido.otId)
    : obras.filter((x) => x.parteId == null && !x.apoyo);
  const apoyos = pedido?.otId == null ? obras.filter((x) => x.apoyo && x.parteId == null) : [];
  const [elegida, setElegida] = useState<number | null>(null);
  const o = candidatas.length === 1 ? candidatas[0] : candidatas.find((x) => x.otId === elegida) ?? null;
  return (
    <>
      <Dialog open={c != null && candidatas.length === 0 && apoyos.length > 0} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogTitle className="text-[17px] font-semibold">No hay jornada para cerrar · {cNombre(dia, c)}</DialogTitle>
          <DialogDescription className="text-[13px]">
            {apoyos.map((x) => textoApoyo(dia, x)).join(" ")} No tenés que cargar nada.
          </DialogDescription>
        </DialogContent>
      </Dialog>
      <Dialog open={c != null && candidatas.length > 1 && !o} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
          <DialogTitle className="text-[17px] font-semibold">Cerrar jornada · {cNombre(dia, c)}</DialogTitle>
          <DialogDescription className="text-[13px]">Se cierra por obra. ¿Cuál?</DialogDescription>
          <div role="menu" className="grid gap-px">
            {candidatas.map((x) => (
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
        parteId={o?.parteId ?? null}
        esUltimaJornada={!!o && o.dia != null && o.totalDias != null && o.dia === o.totalDias}
        // Los apoyos de la obra hoy, salgan de la hoja de quien sea: el formulario los
        // necesita aunque ninguna de las dos cuadrillas haya armado su Hoja.
        apoyos={o ? apoyosDeLaObra(dia, o) : []}
        nombreCuadrilla={(id) => cNombre(dia, id)}
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

/** Los apoyos de la obra de `o` ese día (sin parte, o vinculados a su parte). */
function apoyosDeLaObra(dia: DiaHoja, o: ObraDia): ApoyoDelFormulario[] {
  return dia.obras
    .filter((x) => x.apoyo === true && x.otId === o.otId && (x.parteId == null || x.parteId === o.parteId))
    .map((x) => ({
      asignacionId: x.asignacionId,
      cuadrillaId: x.cuadrillaOdooId,
      nombre: cNombre(dia, x.cuadrillaOdooId),
      fraccion: x.fraccion,
      parteId: x.parteId,
    }));
}

// La frase vive en lib/hoja-dia/estado.ts: la usan también la Hoja del celular y el mensaje.
export { textoApoyo };

/** "17:20" (o "12/10 17:20" si se cargó otro día), en Buenos Aires. */
function cuandoSeCargo(iso: string | null | undefined, fecha: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = "America/Argentina/Buenos_Aires";
  const dia = d.toLocaleDateString("en-CA", { timeZone: tz });
  const hora = d.toLocaleTimeString("es-AR", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: false });
  return dia === fecha ? hora : `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

/** "Jornada cerrada 17:20 · puntero Ortega, 5 personas  [Ver parte]" de una obra con parte. */
export function JornadaCerrada({ o, fecha, conObra, onVer }: { o: ObraDia; fecha: string; conObra: boolean; onVer: () => void }) {
  const { data: parte } = useParte(o.parteId);
  const hora = cuandoSeCargo(parte?.creadoAt, fecha);
  const personas = parte ? Math.max(0, ...parte.manoObra.map((l) => l.personas)) : 0;
  const detalle = parte
    ? [
        parte.estado === "no_ejecutado" ? "no se ejecutó" : null,
        parte.punteroNombre ? `puntero ${parte.punteroNombre.split(/\s+/).slice(-1)[0]}` : null,
        personas ? `${personas} ${personas === 1 ? "persona" : "personas"}` : null,
      ].filter(Boolean).join(", ")
    : "";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="min-w-0 flex-1 text-muted-foreground">
        <b className="font-semibold text-hd-verde">Jornada cerrada{hora ? ` ${hora}` : ""}</b>
        {conObra ? ` · ${o.corto}` : ""}
        {detalle ? ` · ${detalle}` : ""}
      </span>
      <Button size="sm" variant="outline" onClick={onVer}>Ver parte</Button>
    </div>
  );
}
