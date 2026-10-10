"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Check, CircleDashed, Clock, Loader2, Paperclip, Plus, Trash2, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdjuntosDeOt, useAgregarRequisito, useBorrarAdjunto, useBorrarRequisito,
  useCambiarRequisito, useMarcarTodos, usePaquetes, useSubirAdjunto, urlFirmada,
} from "@/hooks/use-habilitaciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { diasEntre, hoyISO } from "@/lib/habilitaciones/derivacion";
import { AVISO, OK, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import type { AdjuntoRequisito, EstadoRequisito, Requisito } from "@/lib/habilitaciones/tipos";

// Listado de requisitos. Es lo que hace usable una obra exigente.
//
// LA APROBACIÓN NO ES GLOBAL: en una obra exigente el cliente aprueba 7 documentos y
// observa 2. Con un solo tilde eso no se puede representar — y ese rebote es justamente
// lo que hace que una habilitación tarde semanas. Por eso cada requisito tiene estado
// propio, y `observado` lleva el motivo escrito al lado.

const ICONO: Record<EstadoRequisito, typeof Check> = {
  aprobado: Check,
  observado: TriangleAlert,
  enviado: Clock,
  pendiente: CircleDashed,
};

const COLOR: Record<EstadoRequisito, string> = {
  aprobado: OK,
  observado: PELIGRO_TEXTO,
  enviado: AVISO.icono,
  pendiente: "var(--muted-foreground)",
};

// Sin botón para el aprobado: antes era "Volver a pendiente", en el mismo lugar donde un
// segundo antes estaba "Aprobar", y deshacía la aprobación de un clic y sin rastro. Ahora
// deshacer es un botón aparte, discreto, que pide confirmación y queda en el historial.
const SIGUIENTE: Partial<Record<EstadoRequisito, string>> = {
  pendiente: "Marcar enviado",
  enviado: "Aprobar",
  observado: "Corregir y reenviar",
};

/** Lo que se pide confirmar antes de deshacer o borrar algo. */
type Confirmacion = { titulo: string; descripcion: string; boton: string; accion: () => void };

export function ListadoRequisitos({ otId, requisitos }: { otId: number; requisitos: Requisito[] }) {
  const cambiar = useCambiarRequisito(otId);
  const marcarTodos = useMarcarTodos(otId);
  const agregar = useAgregarRequisito(otId);
  const borrar = useBorrarRequisito(otId);
  const { data: paquetes } = usePaquetes();
  // UNA consulta para los archivos de toda la obra, no una por requisito: ver
  // useAdjuntosDeOt. Cada fila recibe los suyos ya resueltos.
  const { data: adjuntosPorRequisito } = useAdjuntosDeOt(otId);

  const [nuevo, setNuevo] = useState("");
  const [observando, setObservando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);

  const aprobados = requisitos.filter((r) => r.estado === "aprobado").length;
  const observados = requisitos.filter((r) => r.estado === "observado").length;
  // Un botón masivo sólo mueve lo que corresponde: "enviar todo" no toca lo ya aprobado,
  // y "aprobar todo" no resucita una observación sin que alguien la mire.
  const porMover = {
    enviado: requisitos.filter((r) => r.estado === "pendiente").length,
    aprobado: requisitos.filter((r) => r.estado === "enviado").length,
  };

  function enMasa(todos: "enviado" | "aprobado") {
    marcarTodos.mutate(todos, {
      onSuccess: (r) => toast.success(`${r.movidos} requisito${r.movidos === 1 ? "" : "s"} actualizado${r.movidos === 1 ? "" : "s"}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
    });
  }

  function mover(r: Requisito, destino: EstadoRequisito) {
    cambiar.mutate(
      { requisitoId: r.id, estado: destino },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar") },
    );
  }

  function avanzar(r: Requisito) {
    mover(r, r.estado === "enviado" ? "aprobado" : "enviado");
  }

  function observar(requisitoId: string) {
    if (!motivo.trim()) {
      toast.error("Escribí por qué lo rebotaron");
      return;
    }
    cambiar.mutate(
      { requisitoId, estado: "observado", motivo },
      {
        onSuccess: () => { setObservando(null); setMotivo(""); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
      },
    );
  }

  return (
    <div className="rounded-md border">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">
          {requisitos.length} {requisitos.length === 1 ? "requisito" : "requisitos"} ·{" "}
          {aprobados} {aprobados === 1 ? "aprobado" : "aprobados"}
        </h3>

        {/* El paquete es un punto de partida, no una jaula: una vez aplicado, los
            requisitos se agregan y se quitan uno por uno. Cambiar de paquete no borra
            los que ya se enviaron ni los agregados a mano. */}
        {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
        <div className="ml-auto w-52" data-tour="paquetes">
          {/* Controlado y siempre vacío: el desplegable es un gesto ("aplicar"), no un
              estado. Sin esto, después de aplicar mostraba el id interno del paquete. Lo que
              cambió se ve en la lista y en el historial. */}
          <Select
            value={null}
            onValueChange={(paqueteId: string | null) => {
              if (!paqueteId) return;
              const nombre = paquetes?.find((p) => p.id === paqueteId)?.nombre ?? "";
              agregar.mutate(
                { paqueteId },
                {
                  onSuccess: () => toast.success(`Paquete ${nombre} aplicado`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo aplicar"),
                },
              );
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Aplicar un paquete…" />
            </SelectTrigger>
            <SelectContent>
              {(paquetes ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre} · {p.requisitos.length}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* MASIVO Y DE A UNO CONVIVEN: la oficina manda un mail con todos los papeles y el
          cliente contesta "está todo bien" —gestos únicos que registrar de a uno son
          dieciséis clics— pero también se manda y se aprueba de a uno. Cada botón dice
          cuántos va a mover y desaparece cuando no hay ninguno: así nunca se aprieta a
          ciegas ni atropella lo ya resuelto ni lo observado, que necesita mirarse. */}
      {(porMover.enviado > 0 || porMover.aprobado > 0) && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {porMover.enviado > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={marcarTodos.isPending}
              onClick={() => enMasa("enviado")}
            >
              Marcar {porMover.enviado} como enviado{porMover.enviado === 1 ? "" : "s"}
            </Button>
          )}
          {porMover.aprobado > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={marcarTodos.isPending}
              onClick={() => enMasa("aprobado")}
            >
              Aprobar {porMover.aprobado} enviado{porMover.aprobado === 1 ? "" : "s"}
            </Button>
          )}
          {observados > 0 && (
            <span className="text-xs text-muted-foreground">
              {observados === 1
                ? "1 observado queda afuera: hay que corregirlo."
                : `${observados} observados quedan afuera: hay que corregirlos.`}
            </span>
          )}
        </div>
      )}

      <ul>
        {requisitos.map((r) => {
          const Icono = ICONO[r.estado];
          const sinRespuesta =
            r.estado === "enviado" && r.fecha_envio ? diasEntre(r.fecha_envio, hoyISO()) : null;

          return (
            <li
              key={r.id}
              className="border-b px-3 py-2 text-[13px] last:border-b-0"
              style={r.estado === "observado" ? { backgroundColor: PELIGRO_SUAVE } : undefined}
            >
              <div className="flex items-center gap-2">
                <Icono className="h-4 w-4 shrink-0" style={{ color: COLOR[r.estado] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.nombre}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {r.estado === "aprobado" && r.fecha_resolucion
                      ? `Aprobado el ${format(parseISO(r.fecha_resolucion), "d MMM", { locale: es })}`
                      : r.estado === "enviado" && r.fecha_envio
                        ? `Enviado el ${format(parseISO(r.fecha_envio), "d MMM", { locale: es })}${
                            sinRespuesta !== null ? ` · ${sinRespuesta} d sin respuesta` : ""
                          }`
                        : r.estado === "observado"
                          ? "Observado por el cliente"
                          : r.origen === "manual"
                            ? "Agregado a mano"
                            : "Por preparar"}
                  </span>
                </span>

                <Adjuntos
                  otId={otId}
                  requisito={r}
                  adjuntos={adjuntosPorRequisito?.[r.id] ?? []}
                  onConfirmar={setConfirmando}
                />

                {SIGUIENTE[r.estado] ? (
                  <Button size="sm" variant="outline" onClick={() => avanzar(r)} disabled={cambiar.isPending}>
                    {SIGUIENTE[r.estado]}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={cambiar.isPending}
                    onClick={() =>
                      setConfirmando({
                        titulo: `¿Deshacer la aprobación de ${r.nombre}?`,
                        descripcion:
                          "Vuelve a pendiente, como si no se hubiera mandado. Queda registrado en el historial.",
                        boton: "Deshacer",
                        accion: () => mover(r, "pendiente"),
                      })
                    }
                  >
                    Deshacer
                  </Button>
                )}

                {r.estado === "enviado" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setObservando(r.id); setMotivo(""); }}
                    title="El cliente lo rebotó"
                  >
                    Observar
                  </Button>
                )}

                {/* SÓLO LOS PENDIENTES SE QUITAN: uno mandado o aprobado es trabajo hecho ante
                    el cliente, y antes se borraba con un clic, aprobados incluidos. Para
                    sacar uno de esos, primero se deshace (y eso también queda registrado). */}
                {r.estado === "pendiente" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() =>
                      setConfirmando({
                        titulo: `¿Quitar ${r.nombre}?`,
                        descripcion:
                          "Es para los papeles que este cliente no pide. Se borra con sus archivos y queda registrado en el historial.",
                        boton: "Quitar",
                        accion: () =>
                          borrar.mutate(r.id, {
                            onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo quitar"),
                          }),
                      })
                    }
                    title="El cliente no lo pide"
                    aria-label={`Quitar ${r.nombre}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* EL MOTIVO SE VE SIN ABRIR NADA: es lo que evita volver a leer el mail. */}
              {r.estado === "observado" && r.motivo_obs && (
                <p className="mt-1 pl-6 text-[12px]" style={{ color: PELIGRO_TEXTO }}>
                  {r.motivo_obs}
                </p>
              )}

              {observando === r.id && (
                <div className="mt-2 flex items-start gap-2 pl-6">
                  <Textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Por qué lo rebotaron — ej: falta la foto carnet de dos operarios"
                    className="min-h-16 text-[13px]"
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => observar(r.id)} disabled={cambiar.isPending}>
                      {cambiar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setObservando(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
      <div data-tour="agregar-requisito" className="flex items-center gap-2 border-t px-3 py-2">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Agregar requisito — nombre libre"
          className="h-8 text-[13px]"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !nuevo.trim()) return;
            agregar.mutate({ nombre: nuevo.trim() }, { onSuccess: () => setNuevo("") });
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!nuevo.trim() || agregar.isPending}
          onClick={() => agregar.mutate({ nombre: nuevo.trim() }, { onSuccess: () => setNuevo("") })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>

      <Dialog open={!!confirmando} onOpenChange={(abrir) => !abrir && setConfirmando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmando?.titulo}</DialogTitle>
            <DialogDescription>{confirmando?.descripcion}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirmando?.accion();
                setConfirmando(null);
              }}
            >
              {confirmando?.boton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * LOS ARCHIVOS CUELGAN DEL REQUISITO, NO DE LA OBRA. Si el cliente observa las
 * capacitaciones, se sabe exactamente qué reemplazar; con todo colgado de la obra hay
 * que adivinar cuál de los nueve PDFs es.
 */
function Adjuntos({
  otId,
  requisito,
  adjuntos,
  onConfirmar,
}: {
  otId: number;
  requisito: Requisito;
  /** Ya resueltos por la consulta única de la obra: acá no se pide nada a la red. */
  adjuntos: AdjuntoRequisito[];
  /** Borrar un archivo se confirma con el diálogo del listado. */
  onConfirmar: (c: Confirmacion) => void;
}) {
  const subir = useSubirAdjunto(otId, requisito.id, requisito.nombre);
  const borrar = useBorrarAdjunto(otId);
  const [abierto, setAbierto] = useState(false);

  const n = adjuntos.length;

  return (
    <div className="relative shrink-0">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[12px]"
        onClick={() => setAbierto((v) => !v)}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {n > 0 ? n : ""}
      </Button>

      {abierto && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-md border bg-popover p-2 shadow-md">
          <ul className="mb-2 space-y-1">
            {adjuntos.map((a) => (
              <li key={a.path} className="flex items-center gap-1 text-[12px]">
                <button
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={async () => {
                    const url = await urlFirmada(a.path);
                    if (url) window.open(url, "_blank");
                    else toast.error("No se pudo abrir el archivo");
                  }}
                >
                  {a.nombre}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label={`Borrar ${a.nombre}`}
                  onClick={() =>
                    onConfirmar({
                      titulo: `¿Borrar ${a.nombre}?`,
                      descripcion: `Se borra el archivo de ${requisito.nombre}. No se puede recuperar; queda registrado en el historial.`,
                      boton: "Borrar",
                      accion: () =>
                        borrar.mutate(
                          { path: a.path, nombreRequisito: requisito.nombre },
                          { onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo borrar") },
                        ),
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
            {n === 0 && <li className="text-[12px] text-muted-foreground">Sin archivos</li>}
          </ul>

          <Input
            type="file"
            className="h-8 text-[12px]"
            disabled={subir.isPending}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              subir.mutate(archivo, {
                // Ya había uno con ese nombre: no se pisa, se guarda al lado con la fecha.
                onSuccess: (r) =>
                  r.renombrado && toast.info(`Ya había un archivo con ese nombre: se guardó como ${r.nombre}`),
                onError: (err) =>
                  toast.error(err instanceof Error ? err.message : "No se pudo subir"),
              });
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
