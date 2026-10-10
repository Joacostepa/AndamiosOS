"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeCheck, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDeclararHabilitacion, useRegistrarConsulta } from "@/hooks/use-habilitaciones";
import { estadoDeHabilitacion } from "@/lib/habilitaciones/derivacion";
import { AVISO, OK_SOLIDO } from "@/lib/tablero/colores";
import type { FichaHabilitacion } from "@/lib/habilitaciones/tipos";

/**
 * El gesto de habilitar, y el de haber consultado al cliente.
 *
 * HABILITAR ES UNA DECISIÓN, NO UN EFECTO. Antes la obra pasaba sola a habilitada al
 * aprobar el último papel: el semáforo se ponía verde y la obra se destrababa en el
 * tablero sin que nadie se hiciera cargo ni quedara registrado quién fue. Acá hay un
 * momento explícito, con nombre y fecha.
 *
 * El botón está apagado mientras falten requisitos y DICE cuántos faltan: un botón
 * deshabilitado que no explica por qué es una pared. La excepción existe porque a veces
 * el cliente autoriza por teléfono y los papeles llegan después — y entonces pide motivo
 * escrito, igual que el candado del tablero cuando falta el expediente.
 */
export function BloqueHabilitacion({ ficha, otId }: { ficha: FichaHabilitacion; otId: number }) {
  const declarar = useDeclararHabilitacion(otId);
  const consulta = useRegistrarConsulta(otId);
  const [motivo, setMotivo] = useState("");
  const [abriendoExcepcion, setAbriendoExcepcion] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [motivoReversion, setMotivoReversion] = useState("");

  // Sin triar tampoco: primero se decide si aplica (la barra de triage está justo abajo).
  // Habilitar una recién llegada la dejaba verde en Odoo pero en "Recién llegadas" en la
  // bandeja, y fuera de "Habilitadas". El servicio también lo rechaza.
  if (ficha.triage !== "aplica") return null;

  const est = estadoDeHabilitacion(ficha.requisitos);
  const habilitada = !!ficha.habilitadaEl;

  function habilitar(conMotivo: string | null) {
    declarar.mutate(
      { habilitar: true, faltan: est.faltan || (est.total === 0 ? 1 : 0), motivo: conMotivo },
      {
        onSuccess: () => {
          toast.success("Obra habilitada");
          setAbriendoExcepcion(false);
          setMotivo("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo habilitar"),
      },
    );
  }

  function revertir() {
    if (!motivoReversion.trim()) return;
    declarar.mutate(
      { habilitar: false, faltan: 0, motivo: motivoReversion.trim() },
      {
        onSuccess: () => {
          toast.success("Se revirtió la habilitación · Operaciones recibió el aviso");
          setRevirtiendo(false);
          setMotivoReversion("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo revertir"),
      },
    );
  }

  // Ya habilitada: se muestra quién y cuándo, con la vuelta atrás a mano pero sin
  // protagonismo. Revertir tiene que ser posible y no tiene que ser lo primero que se ve.
  //
  // REVERTIR PIDE CONFIRMACIÓN Y MOTIVO, igual que desde la bandeja: antes acá era un clic
  // suelto, y le manda a Operaciones un aviso crítico. El motivo viaja en ese aviso.
  if (habilitada) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5"
        style={{ backgroundColor: "var(--tb-verde-bg)", borderColor: "var(--tb-verde-borde)" }}
      >
        <BadgeCheck className="h-5 w-5 shrink-0" style={{ color: "var(--tb-verde-text)" }} />
        <div className="text-[13px]">
          <p className="font-semibold">
            Habilitada el {format(parseISO(ficha.habilitadaEl!), "d 'de' MMMM", { locale: es })}
          </p>
          {ficha.habilitadaMotivo && (
            <p className="text-muted-foreground">Por excepción — {ficha.habilitadaMotivo}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          data-tour="boton-revertir"
          disabled={declarar.isPending}
          onClick={() => setRevirtiendo(true)}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Revertir
        </Button>

        <Dialog open={revirtiendo} onOpenChange={(abrir) => !abrir && setRevirtiendo(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Revertir la habilitación?</DialogTitle>
              <DialogDescription>
                La obra vuelve a la cola sin habilitar y Operaciones recibe un aviso urgente
                con este motivo. Si ya tiene jornadas planificadas, siguen en el tablero. Los
                requisitos y el historial no se tocan.
              </DialogDescription>
            </DialogHeader>
            <label className="space-y-1.5 text-[12px] font-medium">
              Motivo (lo lee Operaciones)
              <Textarea
                value={motivoReversion}
                onChange={(e) => setMotivoReversion(e.target.value)}
                placeholder="Ej: lleva permiso y todavía no salió"
                rows={2}
                autoFocus
              />
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevirtiendo(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={revertir}
                disabled={declarar.isPending || !motivoReversion.trim()}
              >
                Revertir y avisar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      {/* A QUIÉN MANDARLE LOS PAPELES. Va acá arriba, pegado a los botones de consultar y
          habilitar, porque es el dato que hace falta JUSTO en ese momento: todo este
          bloque es un ida y vuelta con alguien de la obra, y hasta ahora ese alguien no
          estaba en ninguna pantalla — había que ir a buscarlo a la venta o preguntarle a
          Comercial. El teléfono y el mail son enlaces: desde el celular, tocar y llamar.

          Se muestra sólo si hay algo cargado. No se pone un vacío que diga "sin contacto":
          las órdenes viejas no lo tienen y nunca lo van a tener, y un hueco repetido en
          cada obra vieja sería ruido permanente por un dato que ya no se puede completar. */}
      {ficha.trabajo.syhObra && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <span className="text-muted-foreground">Mandarle los papeles a</span>
          <span className="font-medium">{ficha.trabajo.syhObra.nombre ?? "—"}</span>
          {ficha.trabajo.syhObra.celular && (
            <a
              href={`tel:${ficha.trabajo.syhObra.celular.replace(/[^+\d]/g, "")}`}
              className="underline underline-offset-2"
            >
              {ficha.trabajo.syhObra.celular}
            </a>
          )}
          {ficha.trabajo.syhObra.email && (
            <a href={`mailto:${ficha.trabajo.syhObra.email}`} className="underline underline-offset-2">
              {ficha.trabajo.syhObra.email}
            </a>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
        <Button
          size="lg"
          data-tour="boton-habilitar"
          disabled={!est.listo || declarar.isPending}
          onClick={() => habilitar(null)}
          style={est.listo ? { backgroundColor: OK_SOLIDO, color: "white" } : undefined}
        >
          <BadgeCheck className="mr-2 h-4 w-4" />
          Habilitar obra
        </Button>

        <div className="text-[13px]">
          {est.listo ? (
            <p className="text-muted-foreground">
              {est.total === 1 ? "El requisito está aprobado." : `Los ${est.total} requisitos están aprobados.`}
            </p>
          ) : (
            <>
              <p className="font-medium">{est.motivo}</p>
              <button
                type="button"
                className="text-[12px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                onClick={() => setAbriendoExcepcion((v) => !v)}
              >
                Habilitar igual, por excepción
              </button>
            </>
          )}
        </div>

        {/* Para los clientes que primero hay que preguntarles qué piden: registra que se
            preguntó, y mientras no salga ningún papel la pelota queda del cliente. Si los
            papeles se mandan directo no hace falta —marcar uno enviado ya pasa la pelota—,
            y por eso casi no se usa (0 veces en los 30 días anteriores al 09/10). */}
        {!ficha.fechaConsulta && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            data-tour="boton-consulta"
            disabled={consulta.isPending}
            onClick={() =>
              consulta.mutate(undefined, {
                onSuccess: () => toast.success("Consulta registrada — la pelota pasa al cliente"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar"),
              })
            }
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            Ya le consulté al cliente
          </Button>
        )}
      </div>

      {abriendoExcepcion && !est.listo && (
        <div
          className="space-y-2 rounded-md border px-3 py-2.5"
          style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde }}
        >
          <p className="text-[12px]">
            {est.motivo} Habilitar igual queda registrado con tu nombre y este motivo.
          </p>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: el cliente autorizó por teléfono, manda la nómina el lunes"
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!motivo.trim() || declarar.isPending}
              onClick={() => habilitar(motivo.trim())}
            >
              Habilitar por excepción
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbriendoExcepcion(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
