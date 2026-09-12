"use client";

import { useState } from "react";
import { MessageSquare, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBorrarComentario, useComentar, useComentariosOt, useFijarComentario,
} from "@/hooks/use-comentarios-ot";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AVISO } from "@/lib/tablero/colores";
import { cuando, type ComentarioOt } from "@/lib/tablero/tipos-comentario";

// El hilo de la obra, dentro del panel de la tarjeta.
//
// QUÉ RESUELVE: Operaciones habla con el cliente y acuerda cosas que no están en ningún
// campo — "entramos 8am el martes, portero avisado", "si llueve corre al jueves". Hasta
// hoy eso vivía en un WhatsApp, así que el que planificaba el jueves no sabía lo que se
// había hablado el lunes.
//
// SE VE SIEMPRE, NO SÓLO LO FIJADO. La versión anterior de esta caja mostraba únicamente
// las notas fijadas de la habilitación, y medido sobre las 20 que había cargadas: CERO
// estaban fijadas. O sea, el tablero nunca mostró una. Pedirle a alguien que escriba y
// además decida que eso "merece" ir al tablero es un segundo paso que no se da. Ahora se
// ven los últimos y el pin sólo decide el ORDEN, no la existencia.
//
// EL TEXTAREA VA ABIERTO, no detrás de un botón "agregar comentario". Un clic menos es la
// diferencia entre que lo usen y que no — que es la misma lección del párrafo anterior.

/** Cuántos se muestran antes de tener que desplegar. */
const VISIBLES = 3;

function Comentario({
  c,
  otId,
  esMio,
}: {
  c: ComentarioOt;
  otId: number;
  /** Sólo el autor ve el tacho: el comentario ajeno es el registro de una charla en la que no estuviste. */
  esMio: boolean;
}) {
  const fijar = useFijarComentario(otId);
  const borrar = useBorrarComentario(otId);

  return (
    <div
      className="group/com rounded-md px-2 py-1.5"
      style={c.fijado ? { backgroundColor: AVISO.fondo } : undefined}
    >
      <div className="flex items-start gap-1.5">
        {c.fijado && <Pin className="mt-1 h-3 w-3 shrink-0" style={{ color: AVISO.icono }} />}
        <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug">{c.texto}</p>

        {/* Los controles aparecen al pasar el mouse: el hilo se lee mucho más de lo que
            se edita, y dos botones por renglón lo convierten en una barra de tareas. */}
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/com:opacity-100">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title={c.fijado ? "Dejar de fijar" : "Fijar arriba de todo"}
            onClick={() => fijar.mutate({ id: c.id, fijado: !c.fijado })}
          >
            {c.fijado ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </Button>
          {esMio && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Borrar"
              onClick={() =>
                borrar.mutate(c.id, {
                  onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo borrar"),
                })
              }
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {c.autorNombre ?? "—"} · {cuando(c.createdAt)}
      </p>
    </div>
  );
}

export function ComentariosOt({ otId }: { otId: number }) {
  const { data: comentarios, isLoading } = useComentariosOt(otId);
  const { data: usuario } = useUser();
  const comentar = useComentar(otId);
  const [texto, setTexto] = useState("");
  const [todos, setTodos] = useState(false);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    comentar.mutate(
      { texto: limpio },
      {
        onSuccess: () => {
          setTexto("");
          // Un comentario recién escrito tiene que quedar a la vista aunque el hilo ya
          // tuviera diez: si desaparece detrás de un "ver los 11", parece que no guardó.
          setTodos(true);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
      },
    );
  }

  const lista = comentarios ?? [];
  const mostrados = todos ? lista : lista.slice(0, VISIBLES);
  const ocultos = lista.length - mostrados.length;

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Comentarios{lista.length > 0 ? ` (${lista.length})` : ""}
        </p>
        {ocultos > 0 && (
          <button
            type="button"
            className="text-[11px] underline text-muted-foreground hover:text-foreground"
            onClick={() => setTodos(true)}
          >
            ver los {lista.length}
          </button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : lista.length === 0 ? (
        // El vacío se muestra y no se esconde: esta caja es una invitación a escribir, y
        // una caja que aparece sólo cuando ya hay algo no la puede hacer nunca.
        <p className="px-2 py-1 text-sm text-muted-foreground">
          Sin comentarios. Lo que hablás con el cliente va acá.
        </p>
      ) : (
        <div className="space-y-0.5">
          {mostrados.map((c) => (
            <Comentario key={c.id} c={c} otId={otId} esMio={c.autorId === usuario?.id} />
          ))}
        </div>
      )}

      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        // El placeholder es un EJEMPLO y no una instrucción: dice qué clase de cosa va acá
        // mejor de lo que lo diría "escribí un comentario".
        placeholder="Ej: hablé con Marcela, entramos 8am el martes"
        className="min-h-14 text-sm"
        // Enter manda y Shift+Enter hace salto de línea, como cualquier chat. El botón
        // queda igual para quien no lo sepa: el atajo acelera, no es el único camino.
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            enviar();
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={enviar} disabled={!texto.trim() || comentar.isPending}>
          Comentar
        </Button>
      </div>
    </div>
  );
}
