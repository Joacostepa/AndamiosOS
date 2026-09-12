"use client";

import { useState } from "react";
import { ArrowRight, Plus, Trash2, Undo2 } from "lucide-react";
import { useActividadDeOt } from "@/hooks/use-actividad";
import { CORAL, INACTIVO, OK, PELIGRO } from "@/lib/tablero/colores";
import { cuando, fraseMovimiento, type Movimiento } from "@/lib/tablero/tipos-movimiento";

// Qué le pasó a ESTA obra en el tablero.
//
// Va pegado a HistorialConfirmacion, que cuenta la otra mitad —quién la confirmó— y vive
// en otra tabla por razones históricas. Juntos contestan la pregunta que trae a alguien a
// abrir el panel: "¿por qué esta obra está acá?".
//
// SE MUESTRAN TRES Y SE DESPLIEGA EL RESTO. Una obra de varias semanas puede acumular
// veinte movimientos, y el panel tiene otras ocho cosas que decir antes que eso.
//
// NO SE MUESTRA CUANDO NO HAY NADA. Las obras planificadas antes de que esto existiera no
// tienen registro, y un "sin movimientos" en cada panel sería ruido permanente por algo
// que se llena solo con el uso. Mismo criterio que el historial de confirmaciones.

const VISIBLES = 3;

function Icono({ m }: { m: Movimiento }) {
  const clase = "mt-0.5 h-3 w-3 shrink-0";
  if (m.deshaceA) return <Undo2 className={clase} style={{ color: INACTIVO }} />;
  if (m.accion === "crear") return <Plus className={clase} style={{ color: OK }} />;
  if (m.accion === "quitar") return <Trash2 className={clase} style={{ color: PELIGRO }} />;
  return <ArrowRight className={clase} style={{ color: CORAL }} />;
}

export function MovimientosOt({ otId }: { otId: number }) {
  const { data } = useActividadDeOt(otId);
  const [todos, setTodos] = useState(false);

  const movimientos = (data ?? []).flatMap((e) =>
    e.tipo === "movimiento" ? [e.movimiento] : [],
  );
  if (movimientos.length === 0) return null;

  const mostrados = todos ? movimientos : movimientos.slice(0, VISIBLES);
  const ocultos = movimientos.length - mostrados.length;

  return (
    <div className="space-y-1">
      {mostrados.map((m) => (
        <div key={m.id} className="flex items-start gap-1.5">
          <Icono m={m} />
          <span className="text-[11px] text-muted-foreground">
            {/* Tachado y no escondido: que alguien se haya equivocado y lo haya corregido
                también es información, y esconderlo dejaría un salto inexplicable. */}
            <span style={m.deshecho ? { textDecoration: "line-through" } : undefined}>
              {fraseMovimiento(m)}
            </span>
            {" · "}
            {m.autorNombre ?? "—"}
            {" · "}
            {cuando(m.createdAt)}
          </span>
        </div>
      ))}
      {ocultos > 0 && (
        <button
          type="button"
          className="text-[11px] underline text-muted-foreground hover:text-foreground"
          onClick={() => setTodos(true)}
        >
          ver los {movimientos.length} movimientos
        </button>
      )}
    </div>
  );
}
