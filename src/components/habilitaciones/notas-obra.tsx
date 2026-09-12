"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAgregarNota, useBorrarNota, useFijarNota } from "@/hooks/use-habilitaciones";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Nota } from "@/lib/habilitaciones/tipos";

// Notas de la obra — el MISMO hilo que el panel del tablero muestra como "Comentarios".
// Una obra tiene una sola conversación: lo que se anota acá lo lee Operaciones en la
// tarjeta, y lo que Operaciones habla con el cliente se lee acá.
//
// LAS NOTAS SON DE LA OBRA, NO DE AGUSTINA. Son cosas como "el administrador sólo
// atiende martes y jueves" o "la nómina la piden con foto carnet de cada operario, si
// falta una rebotan todo el paquete". Antes eso vivía en su cabeza y en su casilla de
// mail: si estaba de licencia, se perdía.
//
// EL PIN YA NO DECIDE SI SE VE, SINO DÓNDE. El panel del tablero mostraba únicamente lo
// fijado y de 20 notas cargadas había CERO fijadas, así que no mostró ninguna nunca.
// Ahora se ve el hilo entero en las dos pantallas y fijar sirve para lo permanente, que
// no puede hundirse debajo de la charla de ayer.

export function NotasObra({ otId, notas }: { otId: number; notas: Nota[] }) {
  const agregar = useAgregarNota(otId);
  const fijar = useFijarNota(otId);
  const borrar = useBorrarNota(otId);
  const { data: usuario } = useUser();
  const [texto, setTexto] = useState("");

  function guardar(fijada: boolean) {
    if (!texto.trim()) return;
    agregar.mutate(
      { texto: texto.trim(), fijada },
      {
        onSuccess: () => setTexto(""),
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
      },
    );
  }

  return (
    <section className="rounded-md border">
      <header className="border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">Notas de la obra</h3>
      </header>

      <ul>
        {notas.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-2 border-b px-3 py-2 text-[13px] last:border-b-0"
            style={n.fijada ? { backgroundColor: "#FEF6E7" } : undefined}
          >
            {n.fijada && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#B54708" }} />}
            <span className="min-w-0 flex-1">
              <span className="block whitespace-pre-wrap">{n.texto}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {n.autor_nombre ?? "—"} ·{" "}
                {format(parseISO(n.created_at), "d MMM yyyy HH:mm", { locale: es })}
              </span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title={n.fijada ? "Dejar de fijar" : "Fijar arriba de todo"}
              onClick={() => fijar.mutate({ notaId: n.id, fijada: !n.fijada })}
            >
              {n.fijada ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
            {/* Sólo el autor. Borrar la nota de otro borra el único registro de una
                conversación a la que no estuviste; la regla la aplica la RLS, esto es
                que el botón no prometa algo que el servidor va a rechazar. */}
            {n.autor_id === usuario?.id && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Borrar"
                onClick={() =>
                  borrar.mutate(n.id, {
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "No se pudo borrar"),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
        {notas.length === 0 && (
          <li className="px-3 py-3 text-[12px] text-muted-foreground">
            Sin notas. Lo que hoy vive en tu cabeza va acá.
          </li>
        )}
      </ul>

      <div className="space-y-2 border-t p-3">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: el administrador sólo atiende martes y jueves"
          className="min-h-16 text-[13px]"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => guardar(false)} disabled={!texto.trim() || agregar.isPending}>
            Agregar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => guardar(true)}
            disabled={!texto.trim() || agregar.isPending}
            title="Queda arriba de todo, acá y en el panel del tablero"
          >
            <Pin className="mr-1 h-3.5 w-3.5" />
            Agregar y fijar
          </Button>
        </div>
      </div>
    </section>
  );
}
