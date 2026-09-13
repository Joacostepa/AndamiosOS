"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePosponer } from "@/hooks/use-habilitaciones";
import {
  DIAS_ANTES_DE_LA_OBRA, hoyISO, sumarDias, topePosponer,
} from "@/lib/habilitaciones/derivacion";
import { direccionDeObra } from "@/lib/tablero/titulo";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { FilaBandeja } from "@/lib/habilitaciones/tipos";

// Posponer una obra: hasta cuándo sale de la cola.
//
// EL CALENDARIO NO DEJA PASARSE DE LA OBRA. El tope es 10 días antes de lo primero que
// pase —la fecha programada o la primera jornada del tablero—, que es cuando la obra
// volvería sola de todos modos. Dejar elegir más allá sería prometer una fecha que el
// sistema no va a cumplir.
//
// LA SUGERENCIA ES EL TOPE: para una obra con fecha, "10 días antes" es casi siempre lo que
// se quiere, y así posponer es un clic. Los atajos de 1 y 2 semanas son para las que no
// tienen fecha, o para mirar antes.

export type ObraAPosponer = {
  otId: number;
  direccion: string;
  fechaProgramada: string | null;
  primeraJornada: string | null;
  /** Si ya estaba pospuesta: arranca con esa fecha elegida. */
  pospuestaHasta: string | null;
};

export function obraDeFila(f: FilaBandeja): ObraAPosponer {
  return {
    otId: f.otId,
    direccion: direccionDeObra(f),
    fechaProgramada: f.fechaProgramada,
    primeraJornada: f.primeraJornada,
    pospuestaHasta: f.pospuestaHasta,
  };
}

function larga(fecha: string) {
  return format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es });
}

export function DialogoPosponer({
  obra,
  onCerrar,
}: {
  obra: ObraAPosponer | null;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={!!obra} onOpenChange={(abrir) => !abrir && onCerrar()}>
      {/* La key reinicia la fecha y el motivo al cambiar de obra. */}
      {obra && <Contenido key={obra.otId} obra={obra} onCerrar={onCerrar} />}
    </Dialog>
  );
}

function Contenido({ obra, onCerrar }: { obra: ObraAPosponer; onCerrar: () => void }) {
  const posponer = usePosponer();
  const hoy = hoyISO();
  const manana = sumarDias(hoy, 1);
  const tope = topePosponer(obra.fechaProgramada, obra.primeraJornada);
  const sePuede = !tope || tope >= manana;
  const sugerida = tope && tope >= manana ? tope : null;

  const [fecha, setFecha] = useState<string | null>(obra.pospuestaHasta ?? sugerida);
  const [motivo, setMotivo] = useState("");

  const atajos = [
    ...(sugerida ? [{ label: `${DIAS_ANTES_DE_LA_OBRA} días antes de la obra`, fecha: sugerida }] : []),
    { label: "1 semana", fecha: sumarDias(hoy, 7) },
    { label: "2 semanas", fecha: sumarDias(hoy, 14) },
  ];

  // Lo primero que pasa con la obra, para decir contra qué se limita.
  const obraVa = [obra.fechaProgramada, obra.primeraJornada].filter((f): f is string => !!f).sort()[0];

  function confirmar() {
    if (!fecha) return;
    posponer.mutate(
      { otId: obra.otId, hasta: fecha, motivo: motivo.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(`Pospuesta hasta el ${format(parseISO(r.hasta ?? fecha), "d MMM", { locale: es })}`);
          onCerrar();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo posponer"),
      },
    );
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Posponer la habilitación</DialogTitle>
        <DialogDescription>
          {obra.direccion} sale de la cola y vuelve sola en la fecha que elijas. Si Operaciones
          la planifica antes, vuelve antes y te avisa.
        </DialogDescription>
      </DialogHeader>

      {!sePuede ? (
        <p className="rounded-md border px-3 py-2 text-[13px]" style={{ backgroundColor: "#FEF6E7" }}>
          La obra va el {larga(obraVa!)}: está dentro de los {DIAS_ANTES_DE_LA_OBRA} días que hacen
          falta para la documentación, así que no se puede posponer.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {atajos.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={fecha === a.fecha ? "secondary" : "outline"}
                disabled={!!tope && a.fecha > tope}
                onClick={() => setFecha(a.fecha)}
              >
                {a.label}
              </Button>
            ))}
          </div>

          <div className="flex justify-center rounded-md border">
            <Calendar
              mode="single"
              locale={es}
              selected={fecha ? parseISO(fecha) : undefined}
              defaultMonth={fecha ? parseISO(fecha) : undefined}
              onSelect={(d) => d && setFecha(hoyISO(d))}
              disabled={[
                { before: parseISO(manana) },
                ...(tope ? [{ after: parseISO(tope) }] : []),
              ]}
            />
          </div>

          <p className="text-[12px] text-muted-foreground">
            {fecha ? (
              <>
                Vuelve a la bandeja el <span className="font-medium text-foreground">{larga(fecha)}</span>.
              </>
            ) : (
              "Elegí cuándo vuelve a la bandeja."
            )}
            {obraVa && ` La obra va el ${format(parseISO(obraVa), "d MMM", { locale: es })}: no puede volver después del ${format(parseISO(tope!), "d MMM", { locale: es })}.`}
          </p>

          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional) — ej: lleva permiso, falta más de un mes"
            maxLength={500}
            className="h-8 text-[13px]"
          />
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
        {sePuede && (
          <Button onClick={confirmar} disabled={!fecha || posponer.isPending}>
            {posponer.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Posponer
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
