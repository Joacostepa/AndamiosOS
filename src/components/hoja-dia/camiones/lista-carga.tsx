"use client";

// "Lista de carga" (§9): lo que el depósito tiene que cargar y lo que vuelve, por hora. Sólo
// los viajes que salen del depósito con carga o vuelven con carga. En vivo, lo nuevo
// aparece marcado "nuevo 11:06".

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fechaLarga, hm, hm5, listaCarga, nombreDe, patente, textoListaCarga, type FilaCarga } from "@/lib/hoja-dia/estado";
import { useCamiones } from "./contexto";

export function ListaCarga({ abierta, cerrar, avisarDeposito }: { abierta: boolean; cerrar: () => void; avisarDeposito: () => void }) {
  const { dia, ahora } = useCamiones();
  const [copiado, setCopiado] = useState(false);
  const L = abierta ? listaCarga(dia, ahora) : { sale: [], recibir: [] };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoListaCarga(dia, ahora));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };
  const tabla = (filas: FilaCarga[], vacio: string, est: boolean) =>
    filas.length ? (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {filas.map((x) => (
              <tr key={`${x.viajeId}-${x.t}`} className="border-b align-top last:border-0">
                <td className="w-14 py-1.5 pr-2 font-semibold whitespace-nowrap tabular-nums">{x.hecho ? "✓ " : ""}{est ? `~${hm5(x.t)}` : hm(x.t)}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap"><span className="font-mono text-xs">{patente(dia, x.veh)}</span> · {nombreDe(dia, x.ch)}</td>
                <td className="py-1.5">
                  {x.txt}
                  {x.nuevo != null && <span className="ml-1 font-semibold whitespace-nowrap text-hd-ambar">nuevo {hm(x.nuevo)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="text-[13px] text-muted-foreground">{vacio}</p>
    );

  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && cerrar()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-[560px]">
        <SheetHeader className="border-b">
          <SheetTitle>Lista de carga · {fechaLarga(dia.fecha)}</SheetTitle>
          <SheetDescription>Lo que el depósito tiene que cargar y lo que vuelve, por hora. Sólo viajes que salen del depósito con carga o vuelven con carga.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-auto p-4">
          <section className="grid gap-2 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Para cargar</h3>
            {tabla(L.sale, "Nada para cargar.", false)}
          </section>
          <section className="grid gap-2 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Para recibir</h3>
            {tabla(L.recibir, "Nada para recibir.", true)}
          </section>
          <p className="text-xs text-muted-foreground">Las horas con «~» son estimadas. En la fase 2 esta misma lista está en la tablet del pañol («Para cargar»).</p>
        </div>
        <SheetFooter className="flex-row flex-wrap justify-end border-t">
          <Button variant="outline" onClick={copiar}>{copiado ? "Copiado" : "Copiar para WhatsApp/Telegram"}</Button>
          <Button variant="outline" onClick={avisarDeposito}>Avisar al depósito</Button>
          <Button variant="outline" onClick={cerrar}>Listo</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
