"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { useDetalleOt } from "@/hooks/use-detalle-ot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Fijar una obra a su día: por qué no se mueve.
//
// POR QUÉ SE PIDE EL MOTIVO ESCRITO Y NO SE ELIGE DE UNA LISTA. Es la misma decisión que
// el candado de habilitación (ver dialogo-candado.tsx). Lo que hace falta no es
// clasificar: es que a las 7 de la mañana bajo la lluvia, cuando hay que decidir si se
// suspende el día, el que mira la pantalla lea "grúa alquilada, viene 8 hs, no se
// reprograma" y sepa si tiene que llamar para cancelarla. Una selección con "otro" se
// termina comiendo la mitad de los casos y no explica ninguno.
//
// POR QUÉ ES OBLIGATORIO. Si fijar fuera gratis, en dos meses la mitad del tablero está
// fija y el corrimiento del día no sirve más. Escribir cuesta algo, y ese costo es lo que
// mantiene la lista de fijas corta y creíble. El mismo motivo por el que el candado pide
// texto antes de dejar confirmar.
//
// DÓNDE SE LEE DESPUÉS: en el ícono de la tarjeta, en el toast que rebota cuando alguien
// intenta arrastrarla, en el historial de la obra y —el que importa— en la lista de "qué
// queda en su día" del diálogo de correr la jornada. Como el texto que se escribe acá es
// el que después le va a hablar al que escribe, se escribe bien.
//
// NO SE PREGUNTA NADA MÁS. Ni fecha (es la que ya tiene la tarjeta), ni tipo, ni hasta
// cuándo: fijar es un sí o un no sobre los días que el bloque ya ocupa.

export type PedidoFijar = {
  otId: number;
  /** Los días del bloque que se está fijando. Sólo para el título. */
  fechas: string[];
  /** Se ejecuta con el motivo ya validado. */
  fijar: (motivo: string) => void;
};

const dia = (f: string) => format(parseISO(f), "EEE d 'de' MMMM", { locale: es });

export function DialogoFijar({
  pedido,
  onCerrar,
}: {
  pedido: PedidoFijar | null;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  // Se marca en cuanto la persona toca el campo. Desde entonces manda lo que escribió,
  // aunque lo haya borrado: borrar la sugerencia también es una respuesta.
  const [tocado, setTocado] = useState(false);

  // La ficha se pide sólo por la sugerencia, y si no llega no pasa nada: el diálogo
  // funciona igual con el campo vacío. Normalmente ya está en caché, porque para fijar
  // una obra casi siempre se abrió antes su panel.
  const { data: detalle } = useDetalleOt(pedido?.otId ?? null);

  // EL CLIENTE CONTRATÓ UN TÉCNICO DE SEGURIDAD E HIGIENE PARA ESA OBRA. Si lo contrató
  // para el 17, la obra está atada al 17 igual que por una grúa — y eso el sistema ya lo
  // sabe, así que lo sugiere en vez de esperar a que alguien se acuerde. Es una sugerencia
  // editable y borrable, no un motivo que se ponga solo: quien sabe si de verdad no se
  // puede mover es la persona.
  //
  // SE DERIVA EN EL RENDER y no se copia al estado desde un efecto. La ficha llega
  // asincrónica, así que un efecto que escribiera el campo podría pisar lo que la persona
  // está tipeando en ese momento — además de la cascada de renders que marca el linter.
  const sugerencia =
    detalle?.trabajo.syhPresencial === true
      ? "El cliente puso técnico de Seguridad e Higiene en obra para ese día"
      : "";
  const valor = tocado ? motivo : sugerencia;

  if (!pedido) return null;

  const { fechas, fijar } = pedido;

  function cerrar() {
    setMotivo("");
    setTocado(false);
    onCerrar();
  }

  function confirmar() {
    const limpio = valor.trim();
    if (!limpio) {
      toast.error("Escribí por qué no se puede mover");
      return;
    }
    fijar(limpio);
    cerrar();
  }

  const titulo =
    fechas.length > 1
      ? `Fijar del ${dia(fechas[0])} al ${dia(fechas[fechas.length - 1])}`
      : `Fijar al ${dia(fechas[0] ?? "")}`;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pin className="h-4 w-4" />
            {titulo}
          </DialogTitle>
          <DialogDescription>
            {fechas.length > 1
              ? "Estas jornadas dejan de moverse: no se arrastran y el corrimiento del día las saltea."
              : "Esta jornada deja de moverse: no se arrastra y el corrimiento del día la saltea."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Escribí por qué no se puede mover. Es lo que se lee el día que llueve y hay que
            decidir si esta obra sale igual que el resto.
          </p>
          <Textarea
            value={valor}
            onChange={(e) => {
              setTocado(true);
              setMotivo(e.target.value);
            }}
            maxLength={300}
            placeholder="Grúa alquilada, viene 8 hs y no se reprograma"
            className="min-h-20 text-[13px]"
            autoFocus
          />
          {/* Fijar no hace que deje de llover: la obra se queda en su día para que alguien
              decida, no porque se pueda trabajar igual. Vale la pena decirlo acá, que es
              donde se toma la decisión. */}
          <p className="text-[11px] text-muted-foreground">
            Si ese día se suspende, la obra va a quedar sola en el tablero esperando que
            alguien decida qué hacer con ella.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={confirmar}>Fijar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
