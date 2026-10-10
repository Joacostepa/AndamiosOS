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
// PARA UNIFICAR: el diálogo de "mandar a mano" es primo de la lista de envío de
// components/hoja-dia/comunes; cuando exista allá un componente para un solo destinatario,
// este debería usarlo.

import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { useDeshacer, useEnviar } from "@/hooks/use-hoja-dia";
import { nombreDe, persona } from "@/lib/hoja-dia/estado";
import { seguimientoAviso } from "@/lib/hoja-dia/camiones";
import { linkWhatsapp } from "@/lib/panol/whatsapp";
import type { DiaHoja, Fecha, Minutos } from "@/lib/hoja-dia/tipos";

type Respuesta = { ok: true; texto: string; historialId: string | null; enviado?: boolean; waLink?: string | null; mensaje?: string; link?: string | null };

export type Mensaje = {
  titulo: string;
  /** "Para Gómez · 11 5555-0000" */
  para: string;
  texto: string;
  waLink: string | null;
  /** Lo que salió mal con Telegram, en palabras. */
  error?: string | null;
  /** "Ya lo mandé": marca enviado (el chofer) o anota el aviso. */
  alMandar?: () => void;
  /** Botones para seguir avisando ("Avisar a Conte", "Avisar al depósito"). */
  otros?: { l: string; onClick: () => void }[];
  nota?: string;
};

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
      const canal = dep.telegramChatId ? "telegram" : "manual";
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
  return { avisar, avisarCapataz, avisarDeposito, mensajeAMano, abrirMensaje: setMsg, dialogo, ocupado: enviar.isPending };
}

function paraDe(dia: DiaHoja, pid: string) {
  const p = persona(dia, pid);
  return `${p?.nombre ?? ""}${p?.celular ? ` · ${p.celular}` : " · sin celular cargado"}`;
}

export function DialogoMensaje({ m, onClose }: { m: Mensaje | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar: seleccioná el texto y copialo a mano");
    }
  };
  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {m && (
          <>
            <DialogTitle>{m.titulo}</DialogTitle>
            {m.error && <p className="text-sm font-medium text-hd-rojo">Telegram no lo mandó: {m.error}</p>}
            <DialogDescription>Para <b className="font-semibold text-foreground">{m.para}</b></DialogDescription>
            <div className="max-h-[40dvh] overflow-auto rounded-lg bg-muted px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap select-all">{m.texto}</div>
            {m.nota && <p className="text-xs text-muted-foreground">{m.nota}</p>}
            {m.otros && m.otros.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-muted-foreground">También podés avisar:</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.otros.map((o) => (
                    <Button key={o.l} size="sm" variant="outline" onClick={() => { onClose(); o.onClick(); }}>
                      {o.l}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={copiar}>
                <Copy /> {copiado ? "Copiado" : "Copiar"}
              </Button>
              {m.waLink ? (
                <a
                  href={m.waLink}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                  onClick={() => { m.alMandar?.(); onClose(); }}
                >
                  <MessageCircle /> Abrir WhatsApp
                </a>
              ) : null}
              {m.alMandar && (
                <Button onClick={() => { m.alMandar?.(); onClose(); }} className={PRI}>
                  <Send /> Ya lo mandé
                </Button>
              )}
              {!m.alMandar && <Button variant="outline" onClick={onClose}>Listo</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
