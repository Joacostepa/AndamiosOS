"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, CircleCheck, CircleDashed } from "lucide-react";
import { useConfirmaciones } from "@/hooks/use-confirmaciones";
import type { Confirmacion } from "@/lib/tablero/tipos-confirmacion";

// Quién confirmó esta obra, y cuándo.
//
// Va pegado al badge Confirmada/Tentativa del panel, que es el dato que califica: el
// badge dice QUÉ, esto dice QUIÉN Y CUÁNDO. Separarlos obligaría a mirar dos lugares
// para una sola pregunta.
//
// El historial es append-only y guarda también las vueltas a tentativa, que suele ser la
// pregunta más importante: "¿por qué esta obra dejó de estar confirmada?".

/** "28 ago, 10:14" — con año sólo si no es el corriente. */
function cuando(iso: string): string {
  const d = parseISO(iso);
  const patron = d.getFullYear() === new Date().getFullYear() ? "d MMM, HH:mm" : "d MMM yyyy, HH:mm";
  return format(d, patron, { locale: es });
}

function Linea({ c, destacada }: { c: Confirmacion; destacada?: boolean }) {
  const confirmada = c.estado === "confirmada";
  const Icono = confirmada ? CircleCheck : CircleDashed;
  return (
    <div className="flex items-start gap-1.5">
      <Icono
        className="mt-0.5 h-3 w-3 shrink-0"
        style={{ color: confirmada ? "#639922" : "#8A8880" }}
      />
      <span className={destacada ? "text-[12px]" : "text-[11px] text-muted-foreground"}>
        <span className="font-medium">{confirmada ? "Confirmada" : "Volvió a tentativa"}</span>
        {" · "}
        {c.autorNombre ?? "—"}
        {" · "}
        {cuando(c.createdAt)}
        {/* La jornada a la que corresponde. Una obra de varios días se confirma entera de
            una, así que agrupar por momento sería lo natural; se muestra el día para que
            se entienda de qué jornada habla cada línea cuando NO fueron todas juntas. */}
        {c.fecha && (
          <span className="text-muted-foreground">
            {" · jornada del "}
            {format(parseISO(c.fecha), "d MMM", { locale: es })}
          </span>
        )}
      </span>
    </div>
  );
}

export function HistorialConfirmacion({ otId }: { otId: number }) {
  const { data, isLoading } = useConfirmaciones(otId);
  const [abierto, setAbierto] = useState(false);

  // Mientras carga no se muestra nada: es un renglón de contexto, y un esqueleto acá
  // haría parpadear el panel cada vez que se abre una tarjeta.
  if (isLoading || !data || data.length === 0) return null;

  const [ultima, ...resto] = data;

  return (
    <div className="rounded-md border px-2.5 py-2">
      <Linea c={ultima} destacada />
      {resto.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {abierto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {abierto ? "Ocultar" : `Ver historial (${resto.length})`}
          </button>
          {abierto && (
            <div className="mt-1.5 space-y-1 border-t pt-1.5">
              {resto.map((c) => (
                <Linea key={c.id} c={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
