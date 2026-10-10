"use client";

// El menú ⋯ de una tarjeta: Copiar como hoy, Ver como…, Cerrar jornada, Instrucciones,
// Ver el camión, Historial.

import { cNombre, esHoy, fechaLarga, hojaDeCuadrilla, nombreDe, recibeDe } from "@/lib/hoja-dia/estado";
import { useAccionHoja } from "@/hooks/use-hoja-dia";
import { ItemMenu, MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";
import type { Control } from "./control";

export function MenuTarjeta({
  ctl,
  c,
  anchor,
  onCerrar,
  onHistorial,
}: {
  ctl: Control;
  c: number;
  anchor: HTMLElement | null;
  onCerrar: () => void;
  onHistorial: (c: number) => void;
}) {
  const { dia, ahora } = ctl;
  const hoja = useAccionHoja(dia.fecha);
  const h = hojaDeCuadrilla(dia, c);
  const r = recibeDe(dia, c);
  if (!h) return null;
  const y = (f: () => void) => () => {
    onCerrar();
    f();
  };
  return (
    <MenuFlotante
      abierto
      anchor={anchor}
      onCerrar={onCerrar}
      label={cNombre(dia, c)}
      encabezado={
        <>
          <b className="font-semibold">{cNombre(dia, c)}</b>
          <div className="text-xs text-muted-foreground">{fechaLarga(dia.fecha)}</div>
        </>
      }
    >
      <ItemMenu detalle="del día anterior" onClick={y(() => hoja.mutate({ accion: "copiar_como_hoy", fecha: dia.fecha, cuadrilla: c }))}>
        Copiar como hoy
      </ItemMenu>
      {r && <ItemMenu onClick={y(() => ctl.verComo(c, r))}>Ver como {nombreDe(dia, r)}</ItemMenu>}
      {esHoy(ahora) && <ItemMenu onClick={y(() => ctl.cerrarJornada(c))}>Cerrar jornada</ItemMenu>}
      <ItemMenu onClick={y(() => ctl.abrirInstrucciones(c))}>Instrucciones</ItemMenu>
      {h.modo !== "sin" && (
        <ItemMenu detalle="en Camiones" onClick={y(() => ctl.boton({ l: "Ver el camión", a: "verCamion", veh: h.vehiculoId ?? undefined }))}>
          Ver el camión
        </ItemMenu>
      )}
      <ItemMenu detalle="lo que se cambió" onClick={y(() => onHistorial(c))}>Historial</ItemMenu>
    </MenuFlotante>
  );
}
