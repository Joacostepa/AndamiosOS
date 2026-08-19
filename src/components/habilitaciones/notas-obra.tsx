"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAgregarNota, useBorrarNota, useFijarNota } from "@/hooks/use-habilitaciones";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Nota } from "@/lib/habilitaciones/tipos";

// Notas de la obra.
//
// LAS NOTAS SON DE LA OBRA, NO DE AGUSTINA. Son cosas como "el administrador sólo
// atiende martes y jueves" o "la nómina la piden con foto carnet de cada operario, si
// falta una rebotan todo el paquete". Hoy eso vive en su cabeza y en su casilla de mail:
// si está de licencia, se pierde.
//
// Por eso las FIJADAS se ven también desde el panel del tablero y desde la ficha de la
// OT, no encerradas en este módulo.

export function NotasObra({ otId, notas }: { otId: number; notas: Nota[] }) {
  const agregar = useAgregarNota(otId);
  const fijar = useFijarNota(otId);
  const borrar = useBorrarNota(otId);
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
              title={n.fijada ? "Dejar de fijar" : "Fijar arriba y mostrar en el tablero"}
              onClick={() => fijar.mutate({ notaId: n.id, fijada: !n.fijada })}
            >
              {n.fijada ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => borrar.mutate(n.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
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
            title="Se ve arriba de todo y también en el panel del tablero"
          >
            <Pin className="mr-1 h-3.5 w-3.5" />
            Agregar y fijar
          </Button>
        </div>
      </div>
    </section>
  );
}
