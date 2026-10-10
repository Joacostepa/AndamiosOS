"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, HardHat, Loader2, MoreHorizontal, Pin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChipTipoOt } from "@/components/habilitaciones/chip-tipo-ot";
import { ChipUrgencia } from "@/components/habilitaciones/chip-urgencia";
import {
  useCambiarRequisito, useDeclararHabilitacion, useMarcarTodos, useRegistrarGestion,
} from "@/hooks/use-habilitaciones";
import { AVISO, OK_SOLIDO, PELIGRO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { partesTitulo, direccionDeObra } from "@/lib/tablero/titulo";
import { pasoDe, seArma, type Paso } from "@/lib/habilitaciones/presentacion";
import type { ClaveGrupo, FilaBandeja } from "@/lib/habilitaciones/tipos";

// Una fila de la bandeja (rediseño del 09/10, docs/habilitaciones/rediseno.md §4.2).
//
// CUATRO COLUMNAS: la obra, el próximo paso con hace cuánto espera, cuándo se arma, y el
// botón de ese paso. Lo que se resuelve en un clic se resuelve acá: el 75% de las obras
// tiene un solo papel, y antes cada paso obligaba a abrir la ficha (225 aprobaciones y 135
// envíos en un mes, de a una).
//
// UNA SEÑAL POR IDEA. Un chip aparece sólo si cambia el trabajo: prioridad, un tipo que no
// sea armado, SyH, observados, nota fijada. Lo normal no lleva marca. Se fueron el punto de
// semáforo (repetía el grupo, y su tooltip decía "próxima a vencer" para "en curso") y el
// chip "Pantalla", que llevaban 15 de 18 obras: pasa a texto en la segunda línea.
//
// LO QUE SE PUEDE DESHACER, SE DESHACE DESDE EL AVISO. Habilitar no: le avisa a
// Operaciones, así que pide confirmación antes (y revertir pide motivo).

const TONO: Record<Paso["tono"], string | undefined> = {
  nuestra: undefined,
  cliente: undefined,
  listo: "var(--tb-verde-text)",
  corregir: PELIGRO_TEXTO,
  permiso: AVISO.texto,
  neutro: undefined,
};

type Triar = (
  decision: "aplica" | "no_aplica" | "pendiente",
  otIds: number[],
  deshacer?: "aplica" | "no_aplica" | "pendiente",
) => void;

export function Fila({
  fila,
  grupo,
  seleccionable = false,
  seleccionada = false,
  onSeleccionar,
  onTriar,
  onPosponer,
  triando = false,
  anclaTour = false,
}: {
  fila: FilaBandeja;
  grupo: ClaveGrupo;
  seleccionable?: boolean;
  seleccionada?: boolean;
  onSeleccionar?: (otId: number, valor: boolean) => void;
  onTriar: Triar;
  onPosponer: (fila: FilaBandeja) => void;
  triando?: boolean;
  /** Marca esta fila como el ejemplo que resalta el recorrido guiado. */
  anclaTour?: boolean;
}) {
  const partes = partesTitulo(fila.titulo);
  const direccion = direccionDeObra(fila);
  const paso = pasoDe(fila, grupo);
  const arma = seArma({ ...fila, habilitada: !!fila.habilitadaEl });

  const segunda = [partes.cliente, fila.ventaNombre, fila.trabajo.tipoLabel].filter(Boolean).join(" · ");

  return (
    // data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts)
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 text-[13px] last:border-b-0 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_16rem_8rem_14rem]"
      data-tour={anclaTour ? "fila-obra" : undefined}
    >
      {/* La obra */}
      <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
        {seleccionable && (
          <Checkbox
            checked={seleccionada}
            onCheckedChange={(v) => onSeleccionar?.(fila.otId, v === true)}
            aria-label={`Seleccionar ${direccion}`}
          />
        )}
        <Link href={`/habilitaciones/${fila.otId}`} className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{direccion}</span>
            <ChipUrgencia urgencia={fila.urgencia} motivo={fila.motivoUrgencia} />
            {fila.tipo !== "armado" && <ChipTipoOt tipo={fila.tipo} />}
            {fila.trabajo.syhPresencial === true && (
              <span
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: AVISO.fondo, color: AVISO.texto }}
                title="Llevamos técnico de Seguridad e Higiene: hay un papel más que el cliente tiene que aprobar"
              >
                <HardHat className="h-3 w-3" />
                SyH
              </span>
            )}
            {fila.requisitos.observados > 0 && (
              <span
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: PELIGRO_SUAVE, color: PELIGRO_TEXTO }}
                title="Papeles que el cliente rebotó"
              >
                <TriangleAlert className="h-3 w-3" />
                {fila.requisitos.observados} observado{fila.requisitos.observados === 1 ? "" : "s"}
              </span>
            )}
            {fila.notasFijadas.length > 0 && (
              <Pin className="h-3.5 w-3.5 shrink-0" style={{ color: AVISO.icono }} aria-label="Tiene notas fijadas" />
            )}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{segunda}</span>
        </Link>
      </div>

      {/* El próximo paso */}
      <div className="min-w-0">
        <span className="block truncate font-semibold" style={{ color: TONO[paso.tono] }} title={paso.titulo}>
          {paso.titulo}
        </span>
        <span
          className="block truncate text-[11px] text-muted-foreground"
          style={paso.rojo ? { color: PELIGRO, fontWeight: 600 } : undefined}
        >
          {paso.detalle}
        </span>
      </div>

      {/* Cuándo se arma */}
      <div className="min-w-0 text-right md:text-left">
        <span className="block font-medium" style={arma.rojo ? { color: PELIGRO } : undefined}>
          {arma.fecha}
        </span>
        <span
          className="block truncate text-[11px] text-muted-foreground"
          style={arma.rojo ? { color: PELIGRO } : undefined}
        >
          {arma.detalle}
        </span>
      </div>

      {/* El botón del paso */}
      <div
        className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1"
        data-tour={anclaTour ? "accion-fila" : undefined}
      >
        <AccionDeFila fila={fila} paso={paso} direccion={direccion} onTriar={onTriar} triando={triando} />
        <MenuFila fila={fila} grupo={grupo} onTriar={onTriar} onPosponer={onPosponer} />
      </div>
    </div>
  );
}

function AccionDeFila({
  fila,
  paso,
  direccion,
  onTriar,
  triando,
}: {
  fila: FilaBandeja;
  paso: Paso;
  direccion: string;
  onTriar: Triar;
  triando: boolean;
}) {
  const marcar = useMarcarTodos(fila.otId);
  const cambiar = useCambiarRequisito(fila.otId);
  const declarar = useDeclararHabilitacion(fila.otId);
  const gestion = useRegistrarGestion(fila.otId);
  const [confirmando, setConfirmando] = useState(false);
  const ocupado = marcar.isPending || declarar.isPending || cambiar.isPending;
  const a = paso.accion;

  // Deshacer vuelve cada papel a donde estaba, de a uno. Queda en el historial como lo que
  // es: "se deshizo".
  function deshacer(ids: string[], estado: "pendiente" | "enviado") {
    Promise.all(ids.map((requisitoId) => cambiar.mutateAsync({ requisitoId, estado })))
      .then(() => toast.success(`${direccion}: se deshizo`))
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo deshacer"));
  }

  function mover(todos: "enviado" | "aprobado", ids: string[]) {
    marcar.mutate(todos, {
      onSuccess: (r) => {
        const n = r.movidos;
        const que = todos === "enviado"
          ? n === 1 ? "marcado como enviado" : `${n} marcados como enviados`
          : n === 1 ? "aprobado" : `${n} aprobados`;
        toast.success(`${direccion}: ${que}`, {
          action: { label: "Deshacer", onClick: () => deshacer(ids, todos === "enviado" ? "pendiente" : "enviado") },
        });
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
    });
  }

  function reclamar() {
    gestion.mutate(
      { tipo: "reclamo", detalle: `${fila.reclamos + 1}º reclamo al cliente` },
      {
        onSuccess: () =>
          toast.success(`${direccion}: ${fila.reclamos + 1}º reclamo registrado · no manda mail, guarda la fecha`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar"),
      },
    );
  }

  const botonReclamar = (
    <Button size="sm" variant="ghost" onClick={reclamar} disabled={gestion.isPending}>
      Reclamar
    </Button>
  );

  switch (a.tipo) {
    case "triar":
      return (
        <>
          <Button size="sm" disabled={triando} onClick={() => onTriar("aplica", [fila.otId], "pendiente")}>
            Aplica
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={triando}
            onClick={() => onTriar("no_aplica", [fila.otId], "pendiente")}
          >
            No aplica
          </Button>
        </>
      );
    case "enviar":
      return (
        <Button size="sm" disabled={ocupado} onClick={() => mover("enviado", a.ids)}>
          {marcar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {a.ids.length === 1 ? "Marcar enviado" : `Marcar ${a.ids.length} enviados`}
        </Button>
      );
    case "aprobar":
      return (
        <>
          {a.reclamar && botonReclamar}
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => mover("aprobado", a.ids)}>
            {marcar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {a.ids.length === 1 ? "Aprobó" : `Aprobar ${a.ids.length}`}
          </Button>
        </>
      );
    case "habilitar":
      return (
        <>
          <Button
            size="sm"
            disabled={ocupado}
            style={{ backgroundColor: OK_SOLIDO, color: "white" }}
            onClick={() => setConfirmando(true)}
          >
            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
            Habilitar
          </Button>
          {/* HABILITAR AVISA A OPERACIONES, así que desde una lista se confirma: el botón
              de al lado es otra obra. En la ficha, parado sobre la obra, es un clic. */}
          <Dialog open={confirmando} onOpenChange={setConfirmando}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Habilitar {direccion}?</DialogTitle>
                <DialogDescription>
                  Todos los papeles están aprobados. Operaciones recibe el aviso de que ya se
                  puede programar.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
                <Button
                  style={{ backgroundColor: OK_SOLIDO, color: "white" }}
                  disabled={declarar.isPending}
                  onClick={() =>
                    declarar.mutate(
                      { habilitar: true, faltan: 0 },
                      {
                        onSuccess: () => {
                          setConfirmando(false);
                          toast.success(`${direccion} habilitada · Operaciones recibió el aviso`);
                        },
                        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo habilitar"),
                      },
                    )
                  }
                >
                  {declarar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Habilitar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      );
    case "abrir":
      return (
        <>
          {a.reclamar && botonReclamar}
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/habilitaciones/${fila.otId}`} />}>
            Abrir
          </Button>
        </>
      );
    case "ninguna":
      return null;
  }
}

/** El resto de lo que se puede hacer con la obra, sin ocupar lugar en la fila. */
function MenuFila({
  fila,
  grupo,
  onTriar,
  onPosponer,
}: {
  fila: FilaBandeja;
  grupo: ClaveGrupo;
  onTriar: Triar;
  onPosponer: (fila: FilaBandeja) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Más acciones de ${direccionDeObra(fila)}`} />}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem render={<Link href={`/habilitaciones/${fila.otId}`} />}>Abrir la ficha</DropdownMenuItem>
        {/* Las que esperan el permiso ya vuelven solas: posponerlas sería esconderlas dos veces. */}
        {grupo !== "permiso" && !fila.habilitadaEl && (
          <DropdownMenuItem onClick={() => onPosponer(fila)}>Posponer…</DropdownMenuItem>
        )}
        {fila.triage === "aplica" && !fila.habilitadaEl && (
          <DropdownMenuItem onClick={() => onTriar("no_aplica", [fila.otId], "aplica")}>
            Marcar que no aplica
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={fila.url} target="_blank" rel="noreferrer" />} className="gap-2">
          Ver la OT en Odoo
          <ExternalLink className="ml-auto h-3.5 w-3.5" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
