"use client";

// "Avisar a Gómez" (§11 "Durante el día: avisar un viaje nuevo"). Por Telegram es UN toque:
// manda y listo, y "Enviada" lo marca el servidor sólo si Telegram contestó. Si el chofer no
// vinculó Telegram, o Telegram falló, sale el respaldo a mano: el mensaje escrito para
// copiar o abrir en WhatsApp, y "Ya lo mandé" lo marca (con Deshacer).
//
// Después de avisarle al chofer se ofrece lo que sigue: "Avisar a Conte" (el capataz que
// pidió) y "Avisar al depósito" (si el viaje nuevo sale de ahí con carga). Se calcula ANTES
// de avisar (seguimientoAviso): después ya no hay diferencia con lo enviado.
//
// El diálogo de "mandar a mano" (un destinatario) es el de comunes/mensaje-a-mano.tsx.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogoMensaje, type Mensaje } from "@/components/hoja-dia/comunes/mensaje-a-mano";
import { useDeshacer, useEnviar } from "@/hooks/use-hoja-dia";
import { nombreDe, persona } from "@/lib/hoja-dia/estado";
import { seguimientoAviso } from "@/lib/hoja-dia/camiones";
import { linkWhatsapp } from "@/lib/panol/whatsapp";

export type { Mensaje };
import type { DiaHoja, Fecha, Minutos } from "@/lib/hoja-dia/tipos";

type Respuesta = { ok: true; texto: string; historialId: string | null; enviado?: boolean; waLink?: string | null; mensaje?: string; link?: string | null };


export function useAvisar(diaVista: DiaHoja | undefined, fecha: Fecha, ahoraVista: Minutos) {
  // Los avisos se disparan desde toasts que viven más que el render que los creó ("Avisar a
  // Gómez" después de ponerle un viaje): se leen el día y la hora de AHORA, no los de entonces.
  const ult = useRef({ dia: diaVista, ahora: ahoraVista });
  useEffect(() => { ult.current = { dia: diaVista, ahora: ahoraVista }; });
  const enviar = useEnviar(fecha);
  const deshacer = useDeshacer(fecha);
  const [msg, setMsg] = useState<Mensaje | null>(null);

  const tg = (pid: string | null | undefined) => { const d = ult.current.dia; return !!d?.telegram.configurado && !!persona(d, pid)?.telegram; };
  const deshacerToast = (r: Respuesta) =>
    r.historialId ? { action: { label: "Deshacer", onClick: () => deshacer.mutate(r.historialId!) } } : {};

  const avisarCapataz = useCallback(
    (pedidoId: string, pid: string) => {
      const dia = ult.current.dia;
      if (!dia) return;
      const N = nombreDe(dia, pid);
      const canal = tg(pid) ? "telegram" : "manual";
      enviar.mutate({ accion: "avisar_capataz", fecha, pedidoId, canal }, {
        onSuccess: (raw) => {
          const r = raw as Respuesta;
          if (canal === "telegram" && r.enviado) return void toast(`Avisado a ${N} por Telegram`);
          setMsg({ titulo: `Avisar a ${N}`, para: paraDe(dia, pid), texto: r.mensaje ?? "", waLink: r.waLink ?? null, error: canal === "telegram" ? r.texto : null, nota: "Opcional: el capataz también lo ve en su link, en «Para tu obra»." });
        },
      });
    },
    [fecha, enviar],
  );

  const avisarDeposito = useCallback(
    (viajeId: string) => {
      const dia = ult.current.dia;
      if (!dia) return;
      const dep = dia.parametros.deposito;
      const canal = dep.telegramChatId && dia.telegram.configurado ? "telegram" : "manual";
      enviar.mutate({ accion: "avisar_deposito", fecha, viajeId, canal }, {
        onSuccess: (raw) => {
          const r = raw as Respuesta;
          if (canal === "telegram" && r.enviado) return void toast("Avisado al depósito por Telegram");
          setMsg({ titulo: "Avisar al depósito", para: `${dep.nombre}${dep.telefono ? ` · ${dep.telefono}` : ""}`, texto: r.mensaje ?? "", waLink: r.waLink ?? null, error: canal === "telegram" ? r.texto : null, nota: dep.telefono ? undefined : "Falta el teléfono del depósito en los parámetros: copiá el mensaje." });
        },
      });
    },
    [fecha, enviar],
  );

  const siguientes = useCallback(
    (pid: string) => {
      const { dia, ahora } = ult.current;
      if (!dia) return [];
      const s = seguimientoAviso(dia, pid, ahora);
      return [
        ...s.capataces.map((c) => ({ l: `Avisar a ${nombreDe(dia, c.pid)}`, onClick: () => avisarCapataz(c.pedidoId, c.pid) })),
        ...s.deposito.slice(0, 1).map((id) => ({ l: "Avisar al depósito", onClick: () => avisarDeposito(id) })),
      ];
    },
    [avisarCapataz, avisarDeposito],
  );

  /** El chofer (o el capataz) al que le cambió algo. */
  const avisar = useCallback(
    (pid: string) => {
      const dia = ult.current.dia;
      if (!dia) return;
      const N = nombreDe(dia, pid);
      const otros = siguientes(pid);
      const aMano = (texto: string, waLink: string | null, error?: string | null) =>
        setMsg({
          titulo: `Avisar a ${N}`,
          para: paraDe(dia, pid),
          texto,
          waLink,
          error,
          otros,
          alMandar: () =>
            enviar.mutate({ accion: "enviar", fecha, personaId: pid, canal: "manual" }, {
              onSuccess: (raw) => {
                const r = raw as Respuesta;
                toast(r.texto, { ...deshacerToast(r), duration: 9000 });
              },
            }),
          nota: tg(pid) ? undefined : `${N} no tiene Telegram vinculado: mandáselo vos. Abrir el link ya lo marca «Abierta».`,
        });
      if (tg(pid)) {
        enviar.mutate({ accion: "enviar", fecha, personaId: pid, canal: "telegram" }, {
          onSuccess: (raw) => {
            const r = raw as Respuesta;
            if (r.enviado === false) return aMano(r.mensaje ?? "", r.waLink ?? null, r.texto);
            toast(`Avisado a ${N} por Telegram`, {
              duration: 12000,
              description: otros.length || r.historialId ? (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {otros.map((o) => (
                    <Button key={o.l} size="xs" variant="outline" onClick={o.onClick}>
                      {o.l}
                    </Button>
                  ))}
                  {r.historialId && (
                    <Button size="xs" variant="ghost" onClick={() => deshacer.mutate(r.historialId!)}>
                      Deshacer
                    </Button>
                  )}
                </span>
              ) : undefined,
            });
          },
        });
      } else {
        enviar.mutate({ accion: "preparar", fecha, personaId: pid }, {
          onSuccess: (raw) => {
            const r = raw as unknown as { texto: string | null; waLink: string | null };
            aMano(r.texto ?? "", r.waLink);
          },
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fecha, enviar, siguientes],
  );

  /**
   * "Sacarlo un rato y avisar a Sack", "Avisar tarde", "Vuelven por su cuenta", la lista de
   * carga al depósito: el servidor arma el texto y lo manda por Telegram si la persona (o el
   * depósito) está vinculada; si no, o si Telegram falla, sale el respaldo a mano.
   */
  const avisarMensaje = useCallback(
    (tipo: "sacar_rato" | "tarde" | "vuelven_solos" | "lista_carga", ref: { viajeId?: string | null; cuadrilla?: number | null }, titulo: string, nota?: string) => {
      enviar.mutate({ accion: "avisar_mensaje", fecha, tipo, ...ref, canal: "auto" }, {
        onSuccess: (raw) => {
          const r = raw as Respuesta & { para?: string; canal?: "telegram" | "manual" };
          if (r.canal === "telegram" && r.enviado) return void toast(r.texto);
          setMsg({ titulo, para: r.para ?? "", texto: r.mensaje ?? "", waLink: r.waLink ?? null, error: r.canal === "telegram" ? r.texto : null, nota });
        },
      });
    },
    [fecha, enviar],
  );

  /** Un mensaje armado en la pantalla, para mandar a mano (p. ej. "Sacarlo un rato y avisar a Sack"). */
  const mensajeAMano = useCallback(
    (pid: string | null, titulo: string, texto: string, nota?: string) => {
      const dia = ult.current.dia;
      if (!dia) return;
      setMsg({ titulo, para: pid ? paraDe(dia, pid) : "", texto, waLink: linkWhatsapp(persona(dia, pid)?.celular ?? null, texto), nota });
    },
    [],
  );

  const dialogo = <DialogoMensaje m={msg} onClose={() => setMsg(null)} />;
  return { avisar, avisarCapataz, avisarDeposito, avisarMensaje, mensajeAMano, abrirMensaje: setMsg, dialogo, ocupado: enviar.isPending };
}

function paraDe(dia: DiaHoja, pid: string) {
  const p = persona(dia, pid);
  return `${p?.nombre ?? ""}${p?.celular ? ` · ${p.celular}` : " · sin celular cargado"}`;
}
