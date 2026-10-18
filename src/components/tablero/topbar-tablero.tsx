"use client";

import Link from "next/link";
import {
  CalendarX2, ChevronLeft, ChevronRight, HardHat, History, KeyRound, Loader2, MoreHorizontal, RefreshCw, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectorCuadrillas } from "./selector-cuadrillas";
import { IndicadorProtegido } from "./indicador-protegido";
import { AVISO } from "@/lib/tablero/colores";
import type { LugarProtegido } from "@/lib/tablero/guardias-tipos";
import { PestanasPlanificacion } from "@/components/hoja-dia/comunes/pestanas-planificacion";
import type { CuadrillaTablero } from "@/lib/tablero/tipos";

// La barra de arriba del tablero.
//
// EN CELULAR SE COMPACTA SÓLO CON CSS (`md:`), sin preguntar el ancho desde JavaScript: así
// no hay un primer pintado con la barra de la computadora que después salta. Con todo a la
// vista ocupaba tres o cuatro renglones en un teléfono, y cada renglón se lo quitaba al alto
// de la grilla.

export function TopbarTablero({
  rangoLabel,
  cuadrillas,
  visibles,
  conAsignaciones,
  guardando,
  refrescando,
  onCuadrillas,
  onPrev,
  onNext,
  onHoy,
  onRefrescar,
  onActividad,
  onCorrerDia,
  queEjecutar,
  onQueEjecutar,
  protegido = null,
  autorizaciones = null,
}: {
  rangoLabel: string;
  cuadrillas: CuadrillaTablero[];
  visibles: number[];
  conAsignaciones: Set<number>;
  guardando: boolean;
  refrescando: boolean;
  onCuadrillas: (ids: number[]) => void;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onRefrescar: () => void;
  /** Abre el panel de actividad. Un ícono, en un lugar que ya estaba vacío. */
  onActividad: () => void;
  /** Abre el diálogo de suspender un día y correr lo que había. */
  onCorrerDia: () => void;
  /** Las tarjetas muestran qué hay que ejecutar en vez del cliente y el técnico. */
  queEjecutar: boolean;
  onQueEjecutar: (v: boolean) => void;
  /** "Lugar protegido próximos 5 días hábiles" (guardias-contrato.md §1.6). */
  protegido?: LugarProtegido | null;
  /**
   * Pedidos sobre guardias esperando respuesta. SÓLO PARA QUIEN AUTORIZA (JS): null esconde
   * el acceso. A los demás no les sirve un botón que lleva a una página que no pueden abrir.
   */
  autorizaciones?: number | null;
}) {
  const hayPedidos = (autorizaciones ?? 0) > 0;
  const etiquetaModo = queEjecutar ? "Qué ejecutar" : "Cliente y técnico";

  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 md:gap-3 md:pb-3">
      {/* En celular el título sobra: el menú lateral ya dice dónde estás, y el renglón que
          ocupa es alto que no tiene la grilla. */}
      <h1 className="hidden text-[15px] font-medium md:block">Planificación</h1>
      <PestanasPlanificacion />

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-7" onClick={onPrev} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-0 text-center text-xs font-medium md:min-w-[170px] md:text-sm">
          {rangoLabel}
        </span>
        <Button variant="outline" size="icon" className="size-7" onClick={onNext} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="ml-1" onClick={onHoy}>
          Hoy
        </Button>
      </div>

      <SelectorCuadrillas
        cuadrillas={cuadrillas}
        visibles={visibles}
        conAsignaciones={conAsignaciones}
        onChange={onCuadrillas}
      />

      {/* QUÉ MUESTRA LA TARJETA. Va junto al selector de cuadrillas y no del lado
          derecho: los dos deciden QUÉ SE VE en la grilla, mientras que lo de la derecha
          —correr un día, actividad, refrescar— son acciones sobre el tablero.
          NO DICE "ON/OFF": dice cuál de los dos modos está puesto, porque un interruptor
          sin etiqueta obliga a apretarlo para averiguar qué hace. En celular queda sólo el
          ícono —el casco o las personas—, que cambia con el modo y lo sigue diciendo. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onQueEjecutar(!queEjecutar)}
        title={
          queEjecutar
            ? "Las tarjetas muestran qué hay que ejecutar. Tocá para volver al cliente y el técnico."
            : "Las tarjetas muestran el cliente y el técnico. Tocá para ver qué hay que ejecutar."
        }
        aria-pressed={queEjecutar}
        aria-label={etiquetaModo}
      >
        {queEjecutar ? (
          <HardHat className="h-4 w-4 md:mr-1.5" />
        ) : (
          <Users className="h-4 w-4 md:mr-1.5" />
        )}
        <span className="hidden md:inline">{etiquetaModo}</span>
      </Button>

      {/* EL LUGAR PROTEGIDO va con lo que dice cómo está el tablero, no con las acciones. */}
      <IndicadorProtegido lugar={protegido} />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {/* Las escrituras van a Odoo de a una; este es el único indicador de que algo viaja.
            En celular queda el spinner solo. */}
        {guardando && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Guardando en Odoo…">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden md:inline">Guardando en Odoo…</span>
          </span>
        )}

        <div className="hidden items-center gap-3 md:flex">
          {/* CON TEXTO Y NO CON ÍCONO, a diferencia de la actividad: es la acción más
              grande del tablero —un clic mueve treinta jornadas— y un ícono suelto se
              aprieta por accidente. Que haya que leer qué dice es parte del freno.
              NO VA EN EL ENCABEZADO DEL DÍA, que sería el lugar natural: ese ya es agarre
              para desplazar la grilla, botón para abrir el domingo y disparador del popover
              de notas. Un cuarto gesto ahí adentro no entra. */}
          {/* LA BANDEJA DE JS, con el contador de lo que espera respuesta. En ámbar cuando hay
              algo: es "mirá esto", igual que el indicador. Sin pedidos queda gris y sigue
              ahí, porque también sirve para ver lo que ya se resolvió. */}
          {autorizaciones != null && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/planificacion/autorizaciones" />}
              title={hayPedidos ? `${autorizaciones} pedido${autorizaciones === 1 ? "" : "s"} sobre guardias esperando tu respuesta` : "Pedidos sobre guardias"}
              style={hayPedidos ? { backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto } : undefined}
            >
              <KeyRound className="mr-1.5 h-4 w-4" />
              Autorizaciones
              {hayPedidos && (
                <span className="ml-1 rounded-full px-1.5 text-xs font-semibold tabular-nums" style={{ backgroundColor: AVISO.texto, color: AVISO.fondo }}>
                  {autorizaciones}
                </span>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCorrerDia}>
            <CalendarX2 className="mr-1.5 h-4 w-4" />
            Correr un día
          </Button>
          {/* La actividad entra por un ícono y no por un panel fijo: en el tablero no
              sobra un píxel, y esto se consulta de vez en cuando. Al lado de Refrescar
              porque las dos son acciones sobre el tablero entero, no sobre una obra. */}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={onActividad}
            aria-label="Actividad del tablero"
            title="Quién movió qué, y cuándo"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onRefrescar} disabled={refrescando}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        </div>

        {/* Celular: las tres acciones sobre el tablero entero van a un menú. "Correr un día"
            conserva su nombre escrito adentro —la razón para que no sea un ícono suelto
            sigue valiendo— y va primero porque es la que se busca un día de lluvia. */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" className="size-8" aria-label="Más acciones" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onCorrerDia}>
                <CalendarX2 className="mr-2 h-4 w-4" />
                Correr un día
              </DropdownMenuItem>
              {autorizaciones != null && (
                <DropdownMenuItem render={<Link href="/planificacion/autorizaciones" />}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Autorizaciones{hayPedidos ? ` (${autorizaciones})` : ""}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onActividad}>
                <History className="mr-2 h-4 w-4" />
                Actividad
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRefrescar} disabled={refrescando}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
                Refrescar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
