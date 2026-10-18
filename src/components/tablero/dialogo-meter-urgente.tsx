"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, KeyRound, Loader2, ShieldCheck, Siren } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { avisarCambio } from "@/lib/tablero/avisos";
import { AVISO, GUARDIA, PELIGRO_TEXTO, RAYADO_GUARDIA } from "@/lib/tablero/colores";
import { direccionDeObra } from "@/lib/tablero/titulo";
import type { OtTablero } from "@/lib/tablero/tipos";

// "Meter urgente" (guardias-contrato.md §1.6), desde la bandeja y desde la ficha de la OT.
//
// ES LA MISMA ESCRITURA QUE "Marcar urgente" de Órdenes de trabajo: x_urgencia = alta y
// x_motivo_urgencia en Odoo, por POST /api/ordenes-trabajo/[id]/urgencia, que ya exige el
// motivo y ya avisa a Operaciones. No hay una urgencia "del tablero" aparte: hay una sola, y
// vive en la OT, donde la leen el listado y la bandeja.
//
// LO QUE SUMA ESTE DIÁLOGO es la pregunta siguiente: "¿y dónde la pongo?". Después de
// marcarla muestra la GUARDIA MÁS CERCANA que puede usar (guardiaMasCercanaPara, la misma
// regla del candado), con un "Ir" que lleva el tablero hasta ahí. Si la más cercana igual
// pide autorización (la OT es vieja: no era imprevista), lo dice antes de que alguien la
// suelte y se encuentre con el pedido.
//
// SE DESHACE ENTERO, que acá es una sola escritura: volver a la urgencia que tenía.

/** Lo que el board sabe de la guardia más cercana que la OT puede usar. */
export type GuardiaCercana = {
  guardiaId: number;
  fecha: string;
  sigla: string;
  /** true = la puede usar sin pedir nada. */
  libre: boolean;
  /** Por qué sí ("urgencia nueva") o qué falta ("hace falta la autorización de JS"). */
  texto: string;
};

type Urgencia = "baja" | "media" | "alta";

async function escribirUrgencia(otId: number, urgencia: Urgencia, motivo: string | null) {
  const res = await fetch(`/api/ordenes-trabajo/${otId}/urgencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urgencia, motivo }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
}

const diaLargo = (f: string) => format(parseISO(f), "EEE d 'de' MMMM", { locale: es });

export function DialogoMeterUrgente({
  ot,
  guardiaCercana,
  onIr,
  onCerrar,
}: {
  ot: OtTablero | null;
  /** Se pregunta DESPUÉS de marcarla, con la OT ya en alta. null = no hay guardias por delante. */
  guardiaCercana: (ot: OtTablero) => GuardiaCercana | null;
  /** Llevar el tablero hasta la guardia y destacarla. */
  onIr: (g: GuardiaCercana) => void;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  // Después de marcar, el diálogo no se cierra: pasa a mostrar dónde ponerla.
  const [hecho, setHecho] = useState<{ cercana: GuardiaCercana | null } | null>(null);

  const invalidar = (otId: number) => {
    // El tablero, la ficha y el listado leen la misma urgencia de Odoo.
    void qc.invalidateQueries({ queryKey: ["tablero"] });
    void qc.invalidateQueries({ queryKey: ["orden-odoo", otId] });
    void qc.invalidateQueries({ queryKey: ["ordenes-odoo"] });
    void qc.invalidateQueries({ queryKey: ["alertas"] });
  };

  const marcar = useMutation({
    mutationFn: (v: { otId: number; motivo: string }) => escribirUrgencia(v.otId, "alta", v.motivo),
  });
  const volver = useMutation({
    mutationFn: (v: { otId: number; urgencia: Urgencia; motivo: string | null }) =>
      escribirUrgencia(v.otId, v.urgencia, v.motivo),
  });

  if (!ot) return null;
  // Para cerrar las funciones anidadas sobre una OT que no es null.
  const obra = ot;

  function cerrar() {
    setMotivo("");
    setHecho(null);
    onCerrar();
  }

  function meter() {
    const texto = motivo.trim();
    if (!texto) {
      toast.error("Escribí el motivo: se ve en la tarjeta y viaja en el aviso");
      return;
    }
    const anterior: Urgencia = obra.urgencia === "media" ? "media" : obra.urgencia === "alta" ? "alta" : "baja";
    const motivoAnterior = obra.motivoUrgencia;
    marcar.mutate(
      { otId: obra.id, motivo: texto },
      {
        onSuccess: () => {
          invalidar(obra.id);
          avisarCambio("metió urgente", direccionDeObra(obra));
          // La regla del candado mira la OT con la urgencia NUEVA: se le pasa así, sin
          // esperar a que el tablero vuelva a leer Odoo.
          setHecho({ cercana: guardiaCercana({ ...obra, urgencia: "alta", motivoUrgencia: texto }) });
          toast.success("Marcada urgente · Operaciones ya tiene el aviso", {
            duration: 6000,
            closeButton: true,
            action: {
              label: "Deshacer",
              onClick: () =>
                volver.mutate(
                  { otId: obra.id, urgencia: anterior, motivo: anterior === "baja" ? null : motivoAnterior },
                  {
                    onSuccess: () => {
                      invalidar(obra.id);
                      toast.success("Volvió a la urgencia que tenía");
                    },
                    onError: (e) => toast.error("No se pudo deshacer", { description: e.message }),
                  },
                ),
            },
          });
        },
        onError: (e) => toast.error("No se pudo marcar urgente", { description: e.message }),
      },
    );
  }

  const cercana = hecho?.cercana ?? null;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !marcar.isPending && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren className="h-4 w-4" style={{ color: PELIGRO_TEXTO }} aria-hidden />
            {hecho ? "Marcada urgente" : "Meter urgente"}
          </DialogTitle>
          <DialogDescription>{direccionDeObra(obra)}</DialogDescription>
        </DialogHeader>

        {!hecho ? (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              Queda escrito en la OT y Operaciones recibe el aviso. Escribí por qué: se ve en la
              tarjeta y nadie tiene que preguntar.
            </p>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se cayó una bandeja, el consorcio pide que vayamos esta semana"
              className="min-h-16 text-[13px]"
              maxLength={500}
              autoFocus
              aria-label="Motivo de la urgencia"
            />
          </div>
        ) : cercana ? (
          // LA GUARDIA MÁS CERCANA, dibujada como en la grilla.
          <div className="space-y-2">
            <div
              className="space-y-1 rounded-md border px-3 py-2 text-[13px]"
              style={{
                backgroundColor: GUARDIA.fondo,
                backgroundImage: RAYADO_GUARDIA,
                borderColor: GUARDIA.borde,
                color: GUARDIA.texto,
              }}
            >
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: GUARDIA.sello }} aria-hidden />
                {cercana.libre ? "Guardia más cercana que puede usar:" : "La guardia más cercana es"}{" "}
                <strong className="font-semibold">
                  {diaLargo(cercana.fecha)} · {cercana.sigla}
                </strong>
              </p>
              <p className="flex items-start gap-1.5 pl-[22px]">
                {!cercana.libre && <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                {cercana.texto}
              </p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Arrastrá la obra hasta la guardia{cercana.libre ? "" : " y pedí la autorización ahí mismo"}.
            </p>
          </div>
        ) : (
          <p
            className="rounded-md border px-3 py-2 text-[13px]"
            style={{ backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }}
          >
            No quedan guardias activas por delante. Para hacerle lugar va a haber que mover una
            tentativa, como siempre.
          </p>
        )}

        <DialogFooter>
          {!hecho ? (
            <>
              <Button variant="ghost" onClick={cerrar} disabled={marcar.isPending}>
                Cancelar
              </Button>
              <Button onClick={meter} disabled={marcar.isPending || !motivo.trim()}>
                {marcar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Meter urgente
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={cerrar}>
                Listo
              </Button>
              {cercana && (
                <Button
                  onClick={() => {
                    onIr(cercana);
                    cerrar();
                  }}
                >
                  Ir
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
