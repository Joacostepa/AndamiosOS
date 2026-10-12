"use client";

// "Mandar a los capataces y choferes" del Pizarrón (maqueta: openSend): el resumen por
// destinatario (las mismas filas y estados que la lista de envío, mensajes.ts / estado.ts) y
// un solo botón que manda todo lo pendiente por Telegram (`enviar_todos`, envios.ts). Lo que
// va a mano (sin Telegram, WhatsApp, reenviar, "No hace falta avisar") sigue en la lista de
// envío de siempre, que se abre desde acá.

import { HardHat, Loader2, Send, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import type { Preparado } from "@/lib/hoja-dia/envios";
import { destinatarios, estadoEnvio, fechaLarga, nombreDe, type EstadoEnvio } from "@/lib/hoja-dia/estado";
import { filaEnvio } from "@/lib/hoja-dia/mensajes";
import { useEnviar } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";
import { IconoVolante } from "./fichas";

const ESTADO: Record<EstadoEnvio["k"], string> = {
  sinrecibe: "sin nadie que la reciba",
  ex: "hay que avisarle que ya no va",
  sinenviar: "sin mandar",
  anulado: "link anulado: mandar de nuevo",
  cambiada: "cambió después de mandar",
  okSinAvisar: "cambio sin avisar (no hacía falta)",
  ok: "mandada",
};
const PENDIENTE: EstadoEnvio["k"][] = ["sinenviar", "anulado", "cambiada", "ex"];

export function Mandar({ abierta, onCerrar, dia, avisos, onRevisar, onUnoPorUno }: {
  abierta: boolean;
  onCerrar: () => void;
  dia: DiaHoja;
  avisos: number;
  onRevisar: () => void;
  onUnoPorUno: () => void;
}) {
  const enviar = useEnviar(dia.fecha);
  const filas = destinatarios(dia).map((x) => ({ x, st: estadoEnvio(dia, x) }));
  const pendientes = filas.filter((f) => PENDIENTE.includes(f.st.k) && f.x.pid);
  const mandar = () =>
    enviar.mutate(
      { accion: "enviar_todos", fecha: dia.fecha },
      {
        onSuccess: (r) => {
          const res = r as unknown as { enviados: string[]; aMano: Preparado[]; errores: { pid: string; error: string }[] };
          const n = res.enviados?.length ?? 0;
          const partes = [n ? `${n === 1 ? "1 enviada" : `${n} enviadas`} por Telegram` : "Nada salió por Telegram"];
          if (res.aMano?.length) partes.push(`${res.aMano.length} para mandar a mano`);
          if (res.errores?.length) partes.push(`${res.errores.length} con error: ${res.errores.map((e) => `${nombreDe(dia, e.pid)} (${e.error})`).join(", ")}`);
          (res.errores?.length ? toast.error : toast)(partes.join(" · "), { duration: 9000 });
          onCerrar();
          if (res.aMano?.length) onUnoPorUno();
        },
      },
    );
  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={`Mandar el ${fechaLarga(dia.fecha)}`}
      sub="Les llega por Telegram a cada uno con lo suyo. Los que no tienen Telegram, desde la lista de envío (WhatsApp o copiar)."
      pie={
        <>
          <Button variant="outline" onClick={onUnoPorUno}>Uno por uno / a mano</Button>
          {avisos > 0 && <Button variant="outline" onClick={onRevisar}>Revisar primero</Button>}
          <Button className="bg-hd-boton font-semibold text-white hover:bg-hd-boton-hover" disabled={!pendientes.length || enviar.isPending} onClick={mandar}>
            {enviar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {avisos > 0 ? "Mandar igual" : "Mandar"}
          </Button>
        </>
      }
    >
      {avisos > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-hd-ambar bg-hd-ambar-bg px-2.5 py-2 text-sm font-bold text-hd-ambar">
          <TriangleAlert className="size-4" />
          {avisos === 1 ? "Queda 1 cosa sin resolver." : `Quedan ${avisos} cosas sin resolver.`}
        </div>
      )}
      <ul className="grid">
        {filas.map(({ x, st }) => (
          <li key={`${x.rol}-${x.pid ?? x.c}`} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 border-t py-2.5">
            <span className="row-span-2 mt-0.5 text-muted-foreground">
              {x.rol === "chofer" ? <IconoVolante className="size-[18px]" /> : x.rol === "ex" ? <Users className="size-[18px]" /> : <HardHat className="size-[18px]" />}
            </span>
            <b className="text-sm font-semibold">{filaEnvio(dia, x)}</b>
            <span className={PENDIENTE.includes(st.k) ? "text-[13px] font-semibold text-hd-ambar" : "text-[13px] text-muted-foreground"}>{ESTADO[st.k]}</span>
          </li>
        ))}
        {!filas.length && <li className="text-sm text-muted-foreground">Todavía no hay a quién mandarle: armá las cuadrillas primero.</li>}
      </ul>
    </HojaLateral>
  );
}
