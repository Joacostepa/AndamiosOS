"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BandejaAutorizaciones } from "@/components/tablero/bandeja-autorizaciones";
import { GUARDIA } from "@/lib/tablero/colores";

// /planificacion/autorizaciones — la bandeja de JS con los pedidos sobre las guardias
// (guardias-contrato.md §1.3). Sólo con «Planificación · Autorizar guardias» en editar: el
// proxy cierra la página (módulo explícito en acceso.ts) y las rutas de /guardias/autorizar
// y /guardias/sacar repiten la llave. Desde el tablero se llega con el botón del contador.
//
// "C3" sale del nombre de la cuadrilla que trae cada pedido (SolicitudGuardia.guardia): antes
// esta página leía el tablero de hoy entero sólo para eso.

export default function AutorizacionesPage() {

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-1 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/planificacion" />}>
          <ArrowLeft />
          Tablero
        </Button>
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          <ShieldCheck className="h-5 w-5" style={{ color: GUARDIA.sello }} aria-hidden />
          Autorizaciones de guardias
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Lo que Planificación no puede hacer sola con una guardia: sacarla, poner una obra común
        encima, un comodín antes de las 13 h del día anterior o una urgencia que no cumple la
        regla. Aprobar lo hace en el momento; rechazar deja la guardia como está.
      </p>
      <BandejaAutorizaciones />
    </div>
  );
}
