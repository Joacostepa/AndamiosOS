"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeCheck, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDeclararHabilitacion, useRegistrarConsulta } from "@/hooks/use-habilitaciones";
import { estadoDeHabilitacion } from "@/lib/habilitaciones/derivacion";
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

  if (ficha.triage === "no_aplica") return null;

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

  // Ya habilitada: se muestra quién y cuándo, con la vuelta atrás a mano pero sin
  // protagonismo. Revertir tiene que ser posible y no tiene que ser lo primero que se ve.
  if (habilitada) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5"
        style={{ backgroundColor: "#EAF3DE", borderColor: "#B7D48E" }}
      >
        <BadgeCheck className="h-5 w-5 shrink-0" style={{ color: "#27500A" }} />
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
          disabled={declarar.isPending}
          onClick={() =>
            declarar.mutate(
              { habilitar: false, faltan: 0 },
              { onSuccess: () => toast.success("Se revirtió la habilitación") },
            )
          }
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Revertir
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        {/* data-tour: el recorrido guiado se cuelga de este nodo (ver lib/habilitaciones/tour.ts) */}
        <Button
          size="lg"
          data-tour="boton-habilitar"
          disabled={!est.listo || declarar.isPending}
          onClick={() => habilitar(null)}
          style={est.listo ? { backgroundColor: "#27500A" } : undefined}
        >
          <BadgeCheck className="mr-2 h-4 w-4" />
          Habilitar obra
        </Button>

        <div className="text-[13px]">
          {est.listo ? (
            <p className="text-muted-foreground">
              Los {est.total} requisitos están aprobados.
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

        {/* La consulta al cliente es lo único que mueve la pelota de nuestro lado al suyo,
            y ahora es un gesto propio en vez de un efecto del triage. */}
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
        <div className="space-y-2 rounded-md border px-3 py-2.5" style={{ backgroundColor: "#FEF6E7" }}>
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
