"use client";

// Los gestos de la vista Camiones con su aviso: el texto en palabras del servidor ("Pedido de
// Conte en el AB 497 YY (Gómez), ~10:45") con "Avisar a Gómez" (si el chofer ya tenía su
// hoja) y "Deshacer". Los hooks del contrato hacen el POST y refrescan el día; acá sólo se
// arma el toast con los botones (§9 "Cómo se despacha", paso 5).

import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAccionPedido, useAccionViaje, useDeshacer } from "@/hooks/use-hoja-dia";
import { nombreDe } from "@/lib/hoja-dia/estado";
import type { AccionPedido, AccionViaje, Resultado } from "@/lib/hoja-dia/acciones";
import type { DiaHoja, Fecha } from "@/lib/hoja-dia/tipos";

export function useGestos(dia: DiaHoja | undefined, fecha: Fecha, avisar: (pid: string) => void) {
  const viajeM = useAccionViaje(fecha, { aviso: false });
  const pedidoM = useAccionPedido(fecha, { aviso: false });
  const deshacer = useDeshacer(fecha);

  const aviso = useCallback(
    (r: Resultado) => {
      const a = r.avisarA;
      const avisarA = (Array.isArray(a) ? a : a ? [a] : []).filter((x): x is string => typeof x === "string");
      const botones = [
        ...avisarA.map((pid) => ({ l: `Avisar a ${dia ? nombreDe(dia, pid) : ""}`, onClick: () => avisar(pid) })),
        ...(r.historialId ? [{ l: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) }] : []),
      ];
      toast(r.texto, {
        duration: avisarA.length ? 12000 : 9000,
        description: botones.length ? (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {botones.map((b, i) => (
              <Button key={b.l} size="xs" variant={i === 0 && avisarA.length ? "outline" : "ghost"} onClick={b.onClick}>
                {b.l}
              </Button>
            ))}
          </span>
        ) : undefined,
      });
    },
    [dia, avisar, deshacer],
  );

  const viaje = useCallback(
    (body: AccionViaje, alTerminar?: (r: Resultado) => void, conAviso = true) =>
      viajeM.mutate(body, { onSuccess: (r) => { if (conAviso) aviso(r); alTerminar?.(r); } }),
    [viajeM, aviso],
  );
  const pedido = useCallback(
    (body: AccionPedido, alTerminar?: (r: Resultado) => void, conAviso = true) =>
      pedidoM.mutate(body, { onSuccess: (r) => { if (conAviso) aviso(r); alTerminar?.(r); } }),
    [pedidoM, aviso],
  );
  return { viaje, pedido, aviso, ocupado: viajeM.isPending || pedidoM.isPending };
}
